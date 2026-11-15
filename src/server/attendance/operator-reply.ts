import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { conversationMessages, conversations, whatsappTenants } from '@/server/db/schema';
import { decryptAccessToken } from '@/server/whatsapp/crypto';
import { normalizeWhatsAppRecipient, sendWhatsAppTextMessage } from '@/server/whatsapp/outbound';
import { TEST_TENANT_ID } from '@/server/whatsapp/test-number';
import { ConversationStateError, type MessageRow } from './conversation-repository';
import { replyWindowState } from './reply-window';

export type OperatorReplyResult = { message: MessageRow | null; delivered: boolean; reason: string | null };

type Recusa = { envia: false; reason: string };
type Envio = { envia: true; phoneNumberId: string; accessToken: string; to: string };

/**
 * Confere estado e janela novamente no servidor. Só grava a resposta depois da confirmação da Meta.
 *
 * O envio acontece ENTRE duas transações curtas, e não dentro de uma. A versão anterior chamava a
 * Meta com a linha da conversa travada em `FOR UPDATE` e um timeout de 12 s: cada resposta de
 * vendedor podia segurar um lock e uma conexão do pool do Neon por doze segundos, e uma Meta lenta
 * virava fila no banco inteiro. O travamento nunca impediu envio duplicado — duas requisições
 * simultâneas passavam na mesma validação, uma depois da outra —, então nada se perde ao soltá-lo
 * durante a rede.
 */
export async function sendOperatorReply(conversationId: string, actorUserId: string, body: string,
  now = new Date()): Promise<OperatorReplyResult> {
  // 1. Leitura consistente: estado, janela de 24 h e credencial do número. Nenhuma escrita, nenhuma rede.
  const preparo = await getDb().transaction(async (tx): Promise<Recusa | Envio> => {
    const [conversation] = await tx.select().from(conversations)
      .where(eq(conversations.id, conversationId)).limit(1);
    if (!conversation) throw new ConversationStateError('Conversa não encontrada.');
    if (conversation.status !== 'open') throw new ConversationStateError('A conversa já foi encerrada.');
    if (conversation.owner !== 'human' || conversation.assignedTo !== actorUserId) {
      throw new ConversationStateError('Assuma a conversa antes de responder.');
    }
    if (!conversation.customerPhone || !conversation.tenantId) {
      return { envia: false, reason: 'Esta conversa é anterior ao registro do contato. Responda pelo celular da loja.' };
    }
    const [lastVisitor] = await tx.select({ createdAt: conversationMessages.createdAt })
      .from(conversationMessages)
      .where(and(eq(conversationMessages.conversationId, conversationId), eq(conversationMessages.sender, 'visitor')))
      .orderBy(desc(conversationMessages.createdAt)).limit(1);
    if (replyWindowState(lastVisitor?.createdAt ?? null, now) !== 'open') {
      return { envia: false, reason: 'A janela de 24 horas terminou. Responda pelo celular da loja.' };
    }

    const tenants = await tx.select().from(whatsappTenants)
      .where(and(eq(whatsappTenants.tenantId, conversation.tenantId), eq(whatsappTenants.isActive, true)))
      .orderBy(desc(whatsappTenants.updatedAt)).limit(2);
    if (tenants.length > 1) {
      return { envia: false,
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
      return { envia: false, reason: 'O WhatsApp da loja precisa ser reconectado em Ajustes antes de enviar.' };
    }
    return { envia: true, phoneNumberId, accessToken, to: normalizeWhatsAppRecipient(conversation.customerPhone) };
  });

  if (!preparo.envia) return { message: null, delivered: false, reason: preparo.reason };

  // 2. Rede, já fora de qualquer transação. O timeout de 12 s agora só atrasa esta requisição.
  try {
    await sendWhatsAppTextMessage({
      phoneNumberId: preparo.phoneNumberId, accessToken: preparo.accessToken, to: preparo.to, body,
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { message: null, delivered: false,
      reason: 'A Meta não confirmou o envio. Confira a conexão em Ajustes e tente novamente.' };
  }

  // 3. A Meta aceitou: o cliente já recebeu. A gravação registra o que aconteceu de fato, por isso
  // não reprova por mudança de dono no intervalo — a mensagem saiu e precisa aparecer no histórico.
  try {
    return await getDb().transaction(async (tx) => {
      const [conversation] = await tx.select({ id: conversations.id }).from(conversations)
        .where(eq(conversations.id, conversationId)).for('update').limit(1);
      if (!conversation) throw new ConversationStateError('Conversa não encontrada.');
      const [message] = await tx.insert(conversationMessages).values({
        conversationId, sender: 'human', body, authorUserId: actorUserId, createdAt: now,
      }).returning();
      await tx.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversationId));
      return { message, delivered: true, reason: null };
    });
  } catch {
    return { message: null, delivered: false,
      reason: 'A Meta aceitou a mensagem, mas o painel não confirmou o registro. Confira no celular antes de tentar novamente.' };
  }
}
