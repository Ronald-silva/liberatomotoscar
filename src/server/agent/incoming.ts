import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  appendVisitorMessage, hashConversationToken, RETENTION_NO_LEAD_DAYS,
} from '@/server/attendance/conversation-repository';
import { ensureAttendanceTables } from '@/server/attendance/ensure-schema';
import { getDb } from '@/server/db/client';
import { conversations } from '@/server/db/schema';
import { deterministicUuidFromWaMessageId } from '@/server/whatsapp/crypto';

/**
 * Entrada da mensagem do cliente no WhatsApp. Separado do handler do webhook de propósito: o
 * handler trata do protocolo da Meta, isto trata da conversa, e o agente só recebe um
 * conversationId. Assim um turno pode ser reprocessado em teste sem simular um evento inteiro.
 */

/** Token determinístico de 43 caracteres base64url por (tenantId + número do cliente). */
export function whatsappConversationToken(tenantId: string, customerWaId: string): string {
  return createHash('sha256')
    .update(`wa:${tenantId}:${customerWaId.replace(/\D/g, '')}`)
    .digest('base64url');
}

export async function ensureWhatsappConversation(token: string, now = new Date()) {
  await ensureAttendanceTables();
  const db = getDb();
  const tokenHash = hashConversationToken(token);
  const expiresAt = new Date(now.getTime() + RETENTION_NO_LEAD_DAYS * 86_400_000);

  const [existing] = await db.select().from(conversations)
    .where(eq(conversations.tokenHash, tokenHash)).limit(1);

  if (existing) {
    if (existing.expiresAt > now) return existing;
    const [renewed] = await db.update(conversations).set({ expiresAt })
      .where(eq(conversations.id, existing.id)).returning();
    return renewed ?? null;
  }

  const [created] = await db.insert(conversations).values({
    channel: 'whatsapp', tokenHash, owner: 'automation', status: 'open',
    createdAt: now, lastMessageAt: now, expiresAt,
  }).onConflictDoNothing().returning();

  return created ?? null;
}

export type IncomingWhatsappMessage = {
  tenantId: string;
  customerWaId: string;
  waMessageId: string;
  text: string;
};

/**
 * Persiste a mensagem recebida e devolve o id da conversa, ou null quando a Meta reentregou um
 * evento que já foi gravado. A deduplicação é a chave única por `clientMessageId`, derivada do
 * id da mensagem no WhatsApp: a Meta reentrega o mesmo evento quando o webhook demora, e sem
 * isso o cliente receberia duas respostas para a mesma frase.
 */
export async function recordIncomingWhatsappMessage(
  params: IncomingWhatsappMessage,
): Promise<string | null> {
  const token = whatsappConversationToken(params.tenantId, params.customerWaId);
  const conversation = await ensureWhatsappConversation(token);
  if (!conversation) throw new Error('Não foi possível criar a conversa do WhatsApp.');
  const { duplicate } = await appendVisitorMessage(
    conversation.id,
    params.text.slice(0, 1000),
    deterministicUuidFromWaMessageId(params.waMessageId),
  );
  return duplicate ? null : conversation.id;
}
