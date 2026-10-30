import {
  commitAutomatedReply, listConversationMessages, releaseAutomatedTurn, reserveAutomatedTurn,
} from '@/server/attendance/conversation-repository';
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

  const setting = await readSetting();
  if (setting.mode !== 'ai') return null;

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
    // A mensagem atual já está no histórico: o webhook a persistiu antes. Tirá-la de lá evita
    // o modelo ver a mesma frase duas vezes, como histórico e como mensagem do turno.
    const anteriores = history.filter((row) => row.body.trim() !== input.message.trim());

    const turn = await runAgentTurn({
      conversationId: input.conversationId, message: input.message, history: anteriores,
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
