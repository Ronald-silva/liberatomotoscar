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
        contacts?: Array<{
          wa_id?: string;
          profile?: { name?: string };
        }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
          image?: { id?: string; caption?: string; mime_type?: string };
          video?: { id?: string; caption?: string; mime_type?: string };
          document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
          audio?: { id?: string; voice?: boolean; mime_type?: string };
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
    customerName?: string | null;
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
  customerName?: string | null;
  waMessageId: string;
  text: string;
}): Promise<string | null> {
  const token = whatsappConversationToken(params.tenant.tenantId, params.customerWaId);
  await ensureWhatsappConversation(token);
  const clientMessageId = deterministicUuidFromWaMessageId(params.waMessageId);

  const prevCountResult = await handleSiteTurn(token, {
    message: params.text.slice(0, 1000),
    clientMessageId,
    customerName: params.customerName,
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

      // 2. Mensagens recebidas de clientes no WhatsApp (Texto, Áudio, Fotos, Vídeos e Documentos)
      for (const incoming of value?.messages ?? []) {
        let normalizedText = '';
        if (incoming.type === 'text' && incoming.text?.body?.trim()) {
          normalizedText = incoming.text.body.trim();
        } else if (incoming.type === 'audio') {
          normalizedText = '[MIDIA_WHATSAPP:AUDIO]';
        } else if (
          incoming.type === 'image' ||
          incoming.type === 'video' ||
          incoming.type === 'document'
        ) {
          const caption =
            incoming.image?.caption?.trim() ||
            incoming.video?.caption?.trim() ||
            incoming.document?.caption?.trim() ||
            '';
          normalizedText = caption
            ? `[MIDIA_WHATSAPP:VISUAL] ${caption}`
            : '[MIDIA_WHATSAPP:VISUAL]';
        }

        if (!normalizedText) continue;

        const contactMatch =
          value?.contacts?.find((c) => c.wa_id === incoming.from) ?? value?.contacts?.[0];
        const customerName = contactMatch?.profile?.name?.trim() || null;

        const replyBody = await runAgent({
          tenant,
          customerWaId: incoming.from,
          customerName,
          waMessageId: incoming.id,
          text: normalizedText,
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

