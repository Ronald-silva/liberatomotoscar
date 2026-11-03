import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { conversationMessages, conversations, whatsappTenants } from '@/server/db/schema';
import { decryptAccessToken } from '@/server/whatsapp/crypto';
import { normalizeWhatsAppRecipient, sendWhatsAppTextMessage } from '@/server/whatsapp/outbound';
import { TEST_TENANT_ID } from '@/server/whatsapp/test-number';
import { ConversationStateError, type MessageRow } from './conversation-repository';
import { replyWindowState } from './reply-window';

export type OperatorReplyResult = { message: MessageRow | null; delivered: boolean; reason: string | null };

/** Confere estado e janela novamente no servidor. Só grava a resposta depois da confirmação da Meta. */
export async function sendOperatorReply(conversationId: string, actorUserId: string, body: string,
  now = new Date()): Promise<OperatorReplyResult> {
  let metaAccepted = false;
  try {
    return await getDb().transaction(async (tx) => {
      const [conversation] = await tx.select().from(conversations)
        .where(eq(conversations.id, conversationId)).for('update').limit(1);
      if (!conversation) throw new ConversationStateError('Conversa não encontrada.');
      if (conversation.status !== 'open') throw new ConversationStateError('A conversa já foi encerrada.');
      if (conversation.owner !== 'human' || conversation.assignedTo !== actorUserId) {
        throw new ConversationStateError('Assuma a conversa antes de responder.');
      }
      if (!conversation.customerPhone || !conversation.tenantId) {
        return { message: null, delivered: false, reason: 'Esta conversa é anterior ao registro do contato. Responda pelo celular da loja.' };
      }
      const [lastVisitor] = await tx.select({ createdAt: conversationMessages.createdAt })
        .from(conversationMessages)
        .where(and(eq(conversationMessages.conversationId, conversationId), eq(conversationMessages.sender, 'visitor')))
        .orderBy(desc(conversationMessages.createdAt)).limit(1);
      if (replyWindowState(lastVisitor?.createdAt ?? null, now) !== 'open') {
        return { message: null, delivered: false, reason: 'A janela de 24 horas terminou. Responda pelo celular da loja.' };
      }

      const tenants = await tx.select().from(whatsappTenants)
        .where(and(eq(whatsappTenants.tenantId, conversation.tenantId), eq(whatsappTenants.isActive, true)))
        .orderBy(desc(whatsappTenants.updatedAt)).limit(2);
      if (tenants.length > 1) {
        return { message: null, delivered: false,
          reason: 'Há mais de um número ativo nesta conta. Responda pelo celular da loja até identificar o número desta conversa.' };
      }
      const tenant = tenants[0];
      const envFallback = conversation.tenantId === TEST_TENANT_ID
        ? { phone: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(), token: process.env.WHATSAPP_TOKEN?.trim() }
        : null;
      const phoneNumberId = tenant?.whatsappPhoneNumberId ?? envFallback?.phone;
      let accessToken: string | undefined;
      try { accessToken = tenant ? decryptAccessToken(tenant.encryptedAccessToken) : envFallback?.token; }
      catch { /* token antigo ou chave alterada: a tela explica sem expor segredo */ }
      if (!phoneNumberId || !accessToken) {
        return { message: null, delivered: false, reason: 'O WhatsApp da loja precisa ser reconectado em Ajustes antes de enviar.' };
      }
      try {
        await sendWhatsAppTextMessage({
          phoneNumberId, accessToken, to: normalizeWhatsAppRecipient(conversation.customerPhone), body,
          signal: AbortSignal.timeout(12_000),
        });
        metaAccepted = true;
      } catch {
        return { message: null, delivered: false, reason: 'A Meta não confirmou o envio. Confira a conexão em Ajustes e tente novamente.' };
      }
      const [message] = await tx.insert(conversationMessages).values({
        conversationId, sender: 'human', body, authorUserId: actorUserId, createdAt: now,
      }).returning();
      await tx.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversationId));
      return { message, delivered: true, reason: null };
    });
  } catch (error) {
    if (metaAccepted) {
      return { message: null, delivered: false,
        reason: 'A Meta aceitou a mensagem, mas o painel não confirmou o registro. Confira no celular antes de tentar novamente.' };
    }
    throw error;
  }
}
