import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { ensureAttendanceTables } from '@/server/attendance/ensure-schema';
import { hashConversationToken, RETENTION_NO_LEAD_DAYS } from '@/server/attendance/conversation-repository';
import { handleSiteTurn } from '@/server/attendance/site-chat';
import { getDb } from '@/server/db/client';
import { conversations } from '@/server/db/schema';
import { decryptAccessToken, deterministicUuidFromWaMessageId } from './crypto';
import { findActiveTenantByPhoneNumberId, type WhatsappTenantRow } from './embedded-signup';
import { formatDayseWhatsAppReply, sendWhatsAppTextMessage } from './outbound';

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
        }>;
        /** Eventos de Coexistência: disparados quando o vendedor responde pelo WhatsApp Business no celular */
        message_echoes?: Array<{
          id: string;
          from: string;
          to: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
};

/** Gera um token determinístico de 43 caracteres base64url por (tenantId + número do cliente). */
export function whatsappConversationToken(tenantId: string, customerWaId: string): string {
  return createHash('sha256')
    .update(`wa:${tenantId}:${customerWaId.replace(/\D/g, '')}`)
    .digest('base64url');
}

async function ensureWhatsappConversation(token: string, now = new Date()) {
  await ensureAttendanceTables();
  const db = getDb();
  const tokenHash = hashConversationToken(token);
  const expiresAt = new Date(now.getTime() + RETENTION_NO_LEAD_DAYS * 86_400_000);

  const [existing] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.tokenHash, tokenHash))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(conversations)
    .values({
      channel: 'whatsapp',
      tokenHash,
      owner: 'automation',
      status: 'open',
      createdAt: now,
      lastMessageAt: now,
      expiresAt,
    })
    .onConflictDoNothing()
    .returning();

  return created ?? null;
}

/** Quando o vendedor responde pelo celular da loja (Coexistence smb_message_echoes), pausa a IA para esse cliente. */
async function pauseAutomationOnSellerEcho(tenantId: string, customerWaId: string, now = new Date()) {
  const token = whatsappConversationToken(tenantId, customerWaId);
  const conv = await ensureWhatsappConversation(token, now);
  if (!conv) return;

  await getDb()
    .update(conversations)
    .set({
      owner: 'human',
      handoffRequestedAt: conv.handoffRequestedAt ?? now,
      turnLockedUntil: null,
      lastMessageAt: now,
    })
    .where(eq(conversations.id, conv.id));
}

export type WebhookHandlerDeps = {
  findTenant?: (phoneNumberId: string) => Promise<WhatsappTenantRow | null>;
  decryptToken?: (encrypted: string) => string;
  pauseOnSellerEcho?: (tenantId: string, customerWaId: string) => Promise<void>;
  runAgentTurn?: (params: {
    tenant: WhatsappTenantRow;
    customerWaId: string;
    waMessageId: string;
    text: string;
  }) => Promise<string | null>;
  sendOutbound?: (params: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    body: string;
  }) => Promise<{ messageId: string | null }>;
};

async function defaultRunAgentTurn(params: {
  tenant: WhatsappTenantRow;
  customerWaId: string;
  waMessageId: string;
  text: string;
}): Promise<string | null> {
  const token = whatsappConversationToken(params.tenant.tenantId, params.customerWaId);
  await ensureWhatsappConversation(token);
  const clientMessageId = deterministicUuidFromWaMessageId(params.waMessageId);

  const prevCountResult = await handleSiteTurn(token, {
    message: params.text.slice(0, 1000),
    clientMessageId,
  });

  const lastMsg = prevCountResult.view.messages.at(-1);
  if (!lastMsg || (lastMsg.sender !== 'ai' && lastMsg.sender !== 'bot')) {
    return null;
  }

  return formatDayseWhatsAppReply(lastMsg.body, lastMsg.cards);
}

/**
 * Processa eventos recebidos no Webhook da Meta Cloud API em modo Multi-Tenant:
 * - Identifica o tenant pelo `metadata.phone_number_id`
 * - Pausa a automação quando recebe `smb_message_echoes` (Coexistência com celular da loja)
 * - Responde mensagens de texto usando a Dayse e o token descriptografado do tenant
 */
export async function processMetaWebhookPayload(
  payload: MetaWebhookPayload,
  deps: WebhookHandlerDeps = {},
): Promise<{ processedMessages: number; pausedConversations: number }> {
  if (payload.object !== 'whatsapp_business_account') {
    return { processedMessages: 0, pausedConversations: 0 };
  }

  const findTenant = deps.findTenant ?? findActiveTenantByPhoneNumberId;
  const decrypt = deps.decryptToken ?? ((enc: string) => decryptAccessToken(enc));
  const pauseEcho = deps.pauseOnSellerEcho ?? pauseAutomationOnSellerEcho;
  const runAgent = deps.runAgentTurn ?? defaultRunAgentTurn;
  const sendOutbound = deps.sendOutbound ?? sendWhatsAppTextMessage;

  let processedMessages = 0;
  let pausedConversations = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const tenant = await findTenant(phoneNumberId);
      if (!tenant || !tenant.isActive) continue;

      // 1. Modo Coexistência: vendedor respondeu pelo WhatsApp Business do celular
      if (change.field === 'smb_message_echoes' && value?.message_echoes?.length) {
        for (const echo of value.message_echoes) {
          if (!echo.to) continue;
          await pauseEcho(tenant.tenantId, echo.to);
          pausedConversations += 1;
        }
        continue;
      }

      // 2. Mensagens recebidas de clientes no WhatsApp
      for (const incoming of value?.messages ?? []) {
        if (incoming.type !== 'text' || !incoming.text?.body?.trim()) continue;

        const replyBody = await runAgent({
          tenant,
          customerWaId: incoming.from,
          waMessageId: incoming.id,
          text: incoming.text.body.trim(),
        });

        if (replyBody) {
          const accessToken = decrypt(tenant.encryptedAccessToken);
          await sendOutbound({
            phoneNumberId: tenant.whatsappPhoneNumberId,
            accessToken,
            to: incoming.from,
            body: replyBody,
          });
          processedMessages += 1;
        }
      }
    }
  }

  return { processedMessages, pausedConversations };
}

