import { eq } from 'drizzle-orm';
import {
  ensureWhatsappConversation, recordIncomingWhatsappMessage, whatsappConversationToken,
} from '@/server/agent/incoming';
import { runWhatsappAgentTurn, type WhatsappTurnResult } from '@/server/agent/whatsapp-turn';
import { getDb } from '@/server/db/client';
import { conversations } from '@/server/db/schema';
import { notifyOps, type OpsAlertOutcome } from '@/server/ops/alert';
import { decryptAccessToken } from './crypto';

export { whatsappConversationToken };
import { findActiveTenantByPhoneNumberId, type WhatsappTenantRow } from './embedded-signup';
import { normalizeWhatsAppRecipient, sendWhatsAppTextMessage } from './outbound';
import { TEST_TENANT_ID } from './test-number';

type WebhookTenant = Pick<WhatsappTenantRow, 'tenantId' | 'wabaId' | 'whatsappPhoneNumberId' | 'isActive'> & {
  encryptedAccessToken?: string;
  accessToken?: string;
  /**
   * `false` quando o `wabaId` deste tenant veio do próprio evento, por falta de
   * `WHATSAPP_WABA_ID`. Ausente significa origem confiável (banco ou ambiente).
   */
  wabaVerified?: boolean;
};

/** O token salvo e validado no painel tem prioridade; o ambiente cobre apenas o primeiro cadastro. */
export async function resolveWebhookTenant(
  phoneNumberId: string,
  findDbTenant: (id: string) => Promise<WhatsappTenantRow | null> = findActiveTenantByPhoneNumberId,
  eventWabaId?: string,
): Promise<WebhookTenant | null> {
  const dbTenant = await findDbTenant(phoneNumberId);
  const envPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const configuredWabaId = process.env.WHATSAPP_WABA_ID?.trim();
  const envWabaId = configuredWabaId || eventWabaId;
  const envAccessToken = process.env.WHATSAPP_TOKEN?.trim();
  if (dbTenant) {
    return dbTenant;
  }

  if (envPhoneNumberId === phoneNumberId && envWabaId && envAccessToken) {
    return {
      tenantId: TEST_TENANT_ID,
      wabaId: envWabaId,
      whatsappPhoneNumberId: envPhoneNumberId,
      isActive: true,
      accessToken: envAccessToken,
      /**
       * Sem `WHATSAPP_WABA_ID` o `wabaId` é o próprio `entry.id` do evento, e a guarda lá embaixo
       * passa a comparar o valor com ele mesmo. Marcar aqui é o que impede a conferência vacuosa
       * de se passar por conferência feita.
       */
      wabaVerified: Boolean(configuredWabaId),
    };
  }
  return null;
}

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

/** Quando o vendedor responde pelo celular da loja (Coexistence smb_message_echoes), pausa a IA para esse cliente. */
async function pauseAutomationOnSellerEcho(tenantId: string, customerWaId: string, now = new Date()) {
  const token = whatsappConversationToken(tenantId, customerWaId);
  const conv = await ensureWhatsappConversation(token, undefined, now);
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
  findTenant?: (phoneNumberId: string, eventWabaId?: string) => Promise<WebhookTenant | null>;
  decryptToken?: (encrypted: string) => string;
  pauseOnSellerEcho?: (tenantId: string, customerWaId: string) => Promise<void>;
  runAgentTurn?: (params: {
    tenant: WebhookTenant;
    customerWaId: string;
    customerName?: string | null;
    waMessageId: string;
    text: string;
    onConversationPersisted?: (conversationId: string) => void;
  }) => Promise<WhatsappTurnResult | null>;
  sendOutbound?: (params: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    body: string;
  }) => Promise<{ messageId: string | null }>;
  /**
   * Chamado quando a Meta não confirma a entrega: a conversa passa a esperar um humano.
   *
   * `false` significa "ninguém foi avisado" e conta como falha operacional. `void` é o
   * desconhecido de um duplo injetado em teste, e não conta.
   */
  onSendFailed?: (conversationId: string, erro: unknown) => Promise<boolean | void>;
  /** Destino humano dos incidentes. Injetável para que o teste não dependa de rede. */
  alertOps?: typeof notifyOps;
};

/**
 * Falha ao gravar a mensagem que o cliente acabou de mandar.
 *
 * Tem classe própria porque é o **único** erro do atendimento que deve derrubar o webhook: nada
 * foi gravado, então não existe deduplicação para engolir a reentrega da Meta. O webhook devolve
 * erro, a Meta reentrega, e quando o banco voltar a mensagem é processada de verdade. Tratar como
 * os outros — respondendo e seguindo — perderia a mensagem em silêncio.
 *
 * Os erros de depois da gravação são o caso oposto: ali a reentrega JÁ é engolida pela
 * deduplicação, e deixar estourar condena a conversa ao silêncio permanente.
 */
export class InboundPersistenceError extends Error {
  constructor(cause: unknown) {
    super('Não foi possível gravar a mensagem recebida do WhatsApp.', { cause });
    this.name = 'InboundPersistenceError';
  }
}

/**
 * Persiste a mensagem do cliente e devolve o resultado do turno, ou null quando a Meta reentregou
 * um evento já gravado.
 */
async function defaultRunAgentTurn(params: {
  tenant: WebhookTenant;
  customerWaId: string;
  customerName?: string | null;
  waMessageId: string;
  text: string;
  onConversationPersisted?: (conversationId: string) => void;
}): Promise<WhatsappTurnResult | null> {
  let conversationId: string | null;
  try {
    conversationId = await recordIncomingWhatsappMessage({
      tenantId: params.tenant.tenantId,
      customerWaId: params.customerWaId,
      customerName: params.customerName,
      waMessageId: params.waMessageId,
      text: params.text,
    });
  } catch (erro) {
    throw new InboundPersistenceError(erro);
  }
  // A Meta reentrega o mesmo evento quando o webhook demora. Sem esta saída o cliente
  // receberia duas respostas para a mesma frase.
  if (!conversationId) return null;
  params.onConversationPersisted?.(conversationId);
  return runWhatsappAgentTurn({ conversationId, message: params.text.slice(0, 1000) });
}

/**
 * Falha de envio: a conversa entra na fila do vendedor, porque o cliente está esperando e não
 * recebeu nada — mas CONTINUA com a automação. Marcar como humana aqui desligou o agente em
 * produção quando o token do número expirou, e ele seguiu mudo depois do token ser renovado.
 *
 * Devolve se o pedido de atendimento humano ficou gravado. O `return` silencioso que existia
 * quando o id da conversa não chegava apagava a falha inteira: ninguém era avisado e o webhook
 * reportava sucesso.
 */
async function defaultOnSendFailed(conversationId: string): Promise<boolean> {
  if (!conversationId) {
    console.error('[agente] falha de envio sem conversa identificada; ninguém foi avisado',
      JSON.stringify({ evento: 'falha_envio_sem_conversa', em: new Date().toISOString() }));
    return false;
  }
  const { flagConversationForHuman } = await import('@/server/attendance/conversation-repository');
  const sinalizada = await flagConversationForHuman(conversationId, 'ai_suggested');
  return Boolean(sinalizada);
}

/**
 * Processa eventos recebidos no Webhook da Meta Cloud API em modo Multi-Tenant:
 * - Identifica o tenant pelo `metadata.phone_number_id`
 * - Pausa a automação quando recebe `smb_message_echoes` (Coexistência com celular da loja)
 * - Responde mensagens de texto usando o agente e o token descriptografado do tenant
 */
export async function processMetaWebhookPayload(
  payload: MetaWebhookPayload,
  deps: WebhookHandlerDeps = {},
): Promise<{ processedMessages: number; pausedConversations: number; encaminhamentos: number; falhasOperacionais: number }> {
  if (payload.object !== 'whatsapp_business_account') {
    return { processedMessages: 0, pausedConversations: 0, encaminhamentos: 0, falhasOperacionais: 0 };
  }

  const findTenant = deps.findTenant ?? ((id: string, wabaId?: string) => resolveWebhookTenant(id, findActiveTenantByPhoneNumberId, wabaId));
  const decrypt = deps.decryptToken ?? ((enc: string) => decryptAccessToken(enc));
  const pauseEcho = deps.pauseOnSellerEcho ?? pauseAutomationOnSellerEcho;
  const runTurn = deps.runAgentTurn ?? defaultRunAgentTurn;
  const onSendFailed = deps.onSendFailed ?? defaultOnSendFailed;
  const alertOps = deps.alertOps ?? notifyOps;
  /**
   * O alerta sai por fora do log porque log de função serverless não acorda ninguém. Ele nunca
   * lança e nunca segura o laço por muito tempo: o incidente já está registrado e contado, e o
   * envio do aviso não pode virar uma segunda falha.
   */
  const alertar = (alerta: Parameters<typeof notifyOps>[0]): Promise<OpsAlertOutcome> =>
    alertOps(alerta).catch(() => 'falhou' as const);
  const sendOutbound = deps.sendOutbound ?? sendWhatsAppTextMessage;

  let processedMessages = 0;
  let pausedConversations = 0;
  /** Encaminhamentos ao vendedor que substituíram uma resposta da IA (limite, menu, falha). */
  let encaminhamentos = 0;
  /**
   * Casos em que o cliente ficou esperando e NÃO há confirmação de que alguém foi avisado. É o
   * número que precisa ser zero no ensaio real; qualquer valor acima de zero é incidente.
   */
  let falhasOperacionais = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const tenant = await findTenant(phoneNumberId, entry.id);
      if (!tenant || !tenant.isActive) {
        if (value?.messages?.length) console.warn('Webhook WhatsApp: número sem credenciais ativas; nenhuma resposta enviada.');
        continue;
      }
      if (entry.id && entry.id !== tenant.wabaId) {
        if (value?.messages?.length) console.warn('Webhook WhatsApp: WABA do evento diferente da conta configurada; nenhuma resposta enviada.');
        continue;
      }
      /**
       * A comparação acima só vale quando o `wabaId` do tenant tem origem independente do evento.
       * No caminho de ambiente sem `WHATSAPP_WABA_ID` ela compara `entry.id` com `entry.id`: não
       * reprova nada. Bloquear aqui deixaria o cliente sem resposta e sem vendedor por uma
       * variável ausente — o que a assinatura HMAC e o `phone_number_id` já barram —, então o
       * atendimento segue e a lacuna fica registrada, com nome próprio, até a variável existir
       * nas duas produções.
       */
      if (entry.id && tenant.wabaVerified === false && value?.messages?.length) {
        console.warn('[whatsapp] WABA do evento não conferida: WHATSAPP_WABA_ID ausente', JSON.stringify({
          evento: 'waba_nao_verificada', wabaDoEvento: entry.id, em: new Date().toISOString(),
        }));
      }

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

        // Escopo da própria mensagem: requisições simultâneas não compartilham o ID.
        let conversationIdForTurn: string | null = null;
        let turno: WhatsappTurnResult | null;
        try {
          turno = await runTurn({
            tenant,
            customerWaId: incoming.from,
            customerName,
            waMessageId: incoming.id,
            text: normalizedText,
            onConversationPersisted: (id) => { conversationIdForTurn = id; },
          });
        } catch (erro) {
          /**
           * A mensagem do cliente já está gravada, então a deduplicação engoliria a reentrega da
           * Meta: deixar estourar aqui condena a conversa ao silêncio permanente. O turno já trata
           * as próprias falhas; esta é a rede de fora, para o que escapar dele.
           *
           * A exceção é a gravação da entrada: nada foi persistido, nada será deduplicado, e a
           * reentrega da Meta é a recuperação. Essa sobe.
           */
          if (erro instanceof InboundPersistenceError) throw erro;
          console.error('[agente] turno estourou no webhook', JSON.stringify({
            evento: 'turno_estourou', conversationId: conversationIdForTurn,
            detalhe: erro instanceof Error ? erro.message : String(erro),
            em: new Date().toISOString(),
          }));
          const avisado = await onSendFailed(conversationIdForTurn ?? '', erro).catch(() => false);
          if (avisado === false) {
            falhasOperacionais += 1;
            const destino = await alertar({
              evento: 'cliente_sem_atendimento',
              resumo: 'cliente sem resposta e sem vendedor avisado',
              conversationId: conversationIdForTurn,
              motivo: 'turno_estourou',
            });
            console.error('[agente] ALERTA: cliente sem resposta e sem vendedor avisado',
              JSON.stringify({ evento: 'cliente_sem_atendimento', conversationId: conversationIdForTurn,
                alerta: destino, em: new Date().toISOString() }));
          }
          continue;
        }

        if (turno?.status === 'encaminhado' && turno.registro === 'nenhum') {
          // O cliente vai receber a frase, mas o banco não confirmou nada: não há conversa na fila
          // de ninguém. Isto é incidente, e não pode passar por atendimento concluído.
          falhasOperacionais += 1;
          const destino = await alertar({
            evento: 'encaminhamento_nao_registrado',
            resumo: 'cliente recebeu encaminhamento que não entrou na fila de ninguém',
            conversationId: conversationIdForTurn,
            motivo: turno.motivo,
          });
          console.error('[agente] ALERTA: encaminhamento não registrado', JSON.stringify({
            evento: 'encaminhamento_nao_registrado', conversationId: conversationIdForTurn,
            motivo: turno.motivo, alerta: destino, em: new Date().toISOString(),
          }));
        }

        // O turno inteiro, e não só o texto: o ramo de envio precisa saber se o que vai ao
        // cliente é resposta da IA ou encaminhamento, para contar e registrar cada um.
        const entrega = turno && turno.status !== 'sem_resposta' ? turno : null;

        if (entrega) {
          const replyBody = entrega.body;
          // A resposta já foi gravada na conversa. Se o envio falhar e nós lançarmos, a Meta
          // reentrega o evento e a deduplicação engole a retentativa: o banco fica com uma
          // resposta que o cliente nunca recebeu, e ninguém é avisado. Por isso a falha vira
          // um pedido de atendimento humano, não uma exceção. Inclui token ausente/ilegível.
          try {
            const accessToken = tenant.accessToken ?? (tenant.encryptedAccessToken ? decrypt(tenant.encryptedAccessToken) : null);
            if (!accessToken) throw new Error('Token de envio do WhatsApp não configurado para o número recebido.');
            const sent = await sendOutbound({
              phoneNumberId: tenant.whatsappPhoneNumberId,
              accessToken,
              to: normalizeWhatsAppRecipient(incoming.from),
              body: replyBody,
            });
            if (!sent.messageId) throw new Error('A API da Meta não confirmou o envio da resposta do agente.');
            processedMessages += 1;
            if (entrega.status === 'encaminhado') {
              encaminhamentos += 1;
              console.warn('[agente] cliente recebeu encaminhamento ao vendedor', JSON.stringify({
                evento: `encaminhado_${entrega.motivo}`, conversationId: conversationIdForTurn,
                registro: entrega.registro, em: new Date().toISOString(),
              }));
            }
          } catch (erro) {
            console.error('[agente] envio ao WhatsApp falhou', JSON.stringify({
              evento: 'envio_falhou', conversationId: conversationIdForTurn,
              detalhe: erro instanceof Error ? erro.message : String(erro),
              em: new Date().toISOString(),
            }));
            // A sinalização ao vendedor é a última linha de defesa; se ela também falhar, o
            // cliente ficou esperando e ninguém sabe. Nunca deixar a exceção subir daqui: a
            // reentrega da Meta é engolida pela deduplicação da mensagem de entrada.
            const avisado = await onSendFailed(conversationIdForTurn ?? '', erro).catch((falha: unknown) => {
              console.error('[agente] sinalização de falha de envio também falhou', JSON.stringify({
                evento: 'sinalizacao_falha_envio_falhou', conversationId: conversationIdForTurn,
                detalhe: falha instanceof Error ? falha.message : String(falha),
                em: new Date().toISOString(),
              }));
              return false;
            });
            if (avisado === false) {
              falhasOperacionais += 1;
              const destino = await alertar({
                evento: 'cliente_sem_atendimento',
                resumo: 'cliente sem resposta e sem vendedor avisado',
                conversationId: conversationIdForTurn,
                motivo: 'envio_falhou',
              });
              console.error('[agente] ALERTA: cliente sem resposta e sem vendedor avisado',
                JSON.stringify({ evento: 'cliente_sem_atendimento', conversationId: conversationIdForTurn,
                  alerta: destino, em: new Date().toISOString() }));
            }
          }
        } else if (turno === null) {
          // Reentrega da Meta. Não é incidente: a resposta da primeira entrega já foi enviada.
          console.info('[agente] evento reentregue pela Meta; mensagem já processada', JSON.stringify({
            evento: 'mensagem_duplicada', waMessageId: incoming.id, em: new Date().toISOString(),
          }));
        } else if (turno.status === 'sem_resposta') {
          /**
           * Os três motivos abaixo são silêncio correto, e por isso têm log distinto: antes uma
           * frase só cobria "modo desativado, vendedor ativo ou mensagem duplicada" — e também o
           * teto da conversa, que não estava na lista e deixava o cliente sem ninguém. Sem
           * separar, não havia como saber depois do fato se um cliente foi ignorado.
           */
          const explicacao = {
            modo_desligado: 'canal fora do modo automático; a equipe responde pela caixa de entrada',
            turno_reservado: 'outra instância está respondendo este turno, ou a conversa já é de um vendedor',
            humano_assumiu: 'vendedor assumiu durante a geração; resposta automática descartada',
          }[turno.motivo];
          console.info('[agente] sem resposta automática', JSON.stringify({
            evento: `sem_resposta_${turno.motivo}`, conversationId: conversationIdForTurn,
            explicacao, em: new Date().toISOString(),
          }));
        }
      }
    }
  }

  return { processedMessages, pausedConversations, encaminhamentos, falhasOperacionais };
}

