import {
  commitAutomatedReply, listConversationMessages, releaseAutomatedTurn, reserveAutomatedTurn,
  type MessageRow,
} from '@/server/attendance/conversation-repository';
import { consumeRateLimit } from '@/server/attendance/limits';
import {
  recordWhatsappAiTokens, recordWhatsappGuardRejection, reserveWhatsappAiRequest,
} from '@/server/attendance/limits';
import { formatAgentWhatsAppReply } from '@/server/whatsapp/outbound';
import { runAgentTurn, type AgentTurnDeps } from './run';

/**
 * Import tardio de propósito: `attendance/settings` traz `requireAdmin`, e com ele o next-auth
 * para dentro do grafo deste módulo. Quem só formata uma mensagem não precisa de autenticação
 * carregada — e um teste de formatação não deveria ter de mockar auth para rodar.
 */
async function readWhatsappModeDefault(): Promise<{ mode: string }> {
  const { readWhatsappSetting } = await import('@/server/attendance/settings');
  return readWhatsappSetting();
}

/**
 * Teto por conversa. A decisão 0.3 fixou 150 chamadas/dia para a LOJA; sem um teto por conversa,
 * um número só consome tudo e todos os outros clientes do dia recebem a mensagem de sem-cota.
 */
const MAX_TURNOS_POR_CONVERSA_DIA = 40;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

async function consumeConversationQuotaDefault(conversationId: string) {
  return consumeRateLimit(`wa-conv:${conversationId}`, MAX_TURNOS_POR_CONVERSA_DIA, UM_DIA_MS);
}

/**
 * Mensagens do turno. As mensagens do visitante no FIM do histórico são as que ainda não foram
 * respondidas — o cliente que divide a frase em dois balões é a norma, não exceção. Elas entram
 * juntas, na ordem em que foram escritas.
 *
 * A versão anterior filtrava o histórico comparando TEXTO com a mensagem atual, e com isso
 * apagava uma ocorrência anterior igual: quem escrevia "oi" duas vezes fazia o modelo esquecer
 * que já tinha respondido.
 */
export function splitPendingMessages(history: MessageRow[]): { anteriores: MessageRow[]; atual: string } {
  const comTexto = history.filter((row) => row.body.trim());
  let corte = comTexto.length;
  while (corte > 0 && comTexto[corte - 1].sender === 'visitor') corte -= 1;
  const pendentes = comTexto.slice(corte);
  return {
    anteriores: comTexto.slice(0, corte),
    atual: pendentes.map((row) => row.body.trim()).join('\n'),
  };
}

/** Sem cota diária o cliente não fica sem resposta: a conversa vai para o vendedor (5.4). */
const SEM_COTA_BODY = 'Oi! Neste momento não consigo te responder por aqui. '
  + 'Já chamei um vendedor para falar com você.';

export type WhatsappAgentTurnInput = {
  conversationId: string;
  /** A mensagem do cliente já foi persistida pelo webhook antes desta chamada. */
  message: string;
};

export type WhatsappAgentTurnDeps = AgentTurnDeps & {
  reserveTurn?: typeof reserveAutomatedTurn;
  releaseTurn?: typeof releaseAutomatedTurn;
  listMessages?: typeof listConversationMessages;
  commitReply?: typeof commitAutomatedReply;
  reserveQuota?: typeof reserveWhatsappAiRequest;
  recordTokens?: typeof recordWhatsappAiTokens;
  recordGuardRejection?: typeof recordWhatsappGuardRejection;
  /** Teto por conversa, para um número só não queimar a cota do dia inteiro (I8). */
  consumeConversationQuota?: (conversationId: string) => Promise<boolean>;
  /** Chamado pelo webhook quando a Meta recusa o envio: a conversa vai para um humano (I4). */
  markSendFailure?: (conversationId: string, erro: unknown) => Promise<void>;
  onSendFailed?: (conversationId: string, erro: unknown) => Promise<void>;
  readSetting?: () => Promise<{ mode: string }>;
};

/**
 * Um turno completo no canal WhatsApp. Devolve o texto a enviar, ou null quando não há resposta
 * automática a dar — modo desligado, vendedor no comando, turno já reservado por outra instância
 * ou resposta descartada no commit porque um humano assumiu durante a geração.
 */
export async function runWhatsappAgentTurn(
  input: WhatsappAgentTurnInput,
  deps: WhatsappAgentTurnDeps = {},
): Promise<string | null> {
  const reserveTurn = deps.reserveTurn ?? reserveAutomatedTurn;
  const releaseTurn = deps.releaseTurn ?? releaseAutomatedTurn;
  const listMessages = deps.listMessages ?? listConversationMessages;
  const commitReply = deps.commitReply ?? commitAutomatedReply;
  const reserveQuota = deps.reserveQuota ?? reserveWhatsappAiRequest;
  const recordTokens = deps.recordTokens ?? recordWhatsappAiTokens;
  const recordGuard = deps.recordGuardRejection ?? recordWhatsappGuardRejection;
  const readSetting = deps.readSetting ?? readWhatsappModeDefault;
  const consumeConversationQuota = deps.consumeConversationQuota ?? consumeConversationQuotaDefault;

  const setting = await readSetting();
  if (setting.mode !== 'ai') return null;

  // Teto por conversa antes da cota global: quem estourou o próprio limite não gasta a da loja.
  if (!await consumeConversationQuota(input.conversationId)) {
    console.warn('[agente] conversa acima do teto diário próprio', JSON.stringify({
      evento: 'teto_por_conversa', conversationId: input.conversationId, em: new Date().toISOString(),
    }));
    return null;
  }

  // A reserva é o que impede duas instâncias de responderem o mesmo turno.
  const reserved = await reserveTurn(input.conversationId);
  if (!reserved) return null;

  try {
    const quota = await reserveQuota();
    if (!quota) {
      const sent = await commitReply(input.conversationId, {
        sender: 'bot', body: SEM_COTA_BODY, cards: [], handoffReason: 'ai_suggested',
      });
      return sent ? SEM_COTA_BODY : null;
    }

    const history = await listMessages(input.conversationId);
    // A mensagem atual já está no histórico: o webhook a persistiu antes.
    const { anteriores, atual } = splitPendingMessages(history);

    const turn = await runAgentTurn({
      conversationId: input.conversationId,
      message: atual || input.message,
      history: anteriores,
    }, deps);

    if (turn.usage.inputTokens || turn.usage.outputTokens) {
      await recordTokens(quota.dayUtc, turn.usage.inputTokens, turn.usage.outputTokens);
    }
    // 6.5 — a taxa de guarda reprovada é o que mostra se o agente está sendo contido com
    // frequência. Sem contar, só existiria no log, que ninguém agrega.
    if (!turn.guard.ok) await recordGuard(quota.dayUtc);

    // 5.1 — formatação do canal: negrito do WhatsApp e o preço verificado, que o canal não
    // renderiza como cartão. É o servidor que o escreve, a partir do retorno da ferramenta.
    const body = formatAgentWhatsAppReply(turn.reply.body, turn.reply.cards);
    const sent = await commitReply(input.conversationId, { ...turn.reply, body });
    // null do commit significa que um vendedor assumiu durante a geração: o humano tem
    // precedência e a resposta é descartada sem ir ao cliente.
    return sent ? body : null;
  } finally {
    await releaseTurn(input.conversationId);
  }
}
