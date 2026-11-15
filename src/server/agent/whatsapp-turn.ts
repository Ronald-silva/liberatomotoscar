import {
  commitAutomatedReply, flagConversationForHuman, listConversationMessages, releaseAutomatedTurn,
  reserveAutomatedTurn, type MessageRow,
} from '@/server/attendance/conversation-repository';
import {
  consumeRateLimit, recordWhatsappAiTokens, recordWhatsappGuardRejection, reserveWhatsappAiRequest,
  type RateLimitOutcome,
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
const MENU_LEGADO_BODY = 'O atendimento por menu está temporariamente indisponível. '
  + 'Vou chamar um vendedor para continuar seu atendimento.';
/**
 * Teto da própria conversa. Não diz "você falou demais": a causa é do nosso lado e quem lê é um
 * cliente que acabou de escrever. O que ele precisa saber é que alguém vai responder.
 */
const TETO_CONVERSA_BODY = 'Oi! Já trocamos bastante mensagem por aqui hoje. '
  + 'Vou passar seu atendimento para um vendedor, que continua com você.';
/**
 * Falha de infraestrutura. Antes este caminho era `return null`: o cliente ficava sem resposta e
 * sem vendedor, exatamente o que o AGENTS.md proíbe. A mensagem não menciona erro técnico porque
 * isso não ajuda quem está comprando uma moto — mas o log e o alerta são explícitos.
 */
const FALHA_TECNICA_BODY = 'Oi! Estou com uma instabilidade e não consigo te responder agora. '
  + 'Já chamei um vendedor para falar com você.';

export type WhatsappAgentTurnInput = {
  conversationId: string;
  /** A mensagem do cliente já foi persistida pelo webhook antes desta chamada. */
  message: string;
};

/**
 * Por que não houve resposta automática — e todos estes são casos em que o silêncio é correto:
 * ninguém está esperando a Dayse.
 *
 * - `modo_desligado`: a loja escolheu responder à mão; as mensagens chegam na caixa de entrada.
 * - `turno_reservado`: a reserva não é desta execução — outra instância já está respondendo este
 *   turno, ou a conversa já pertence a um vendedor (`reserveAutomatedTurn` exige automação como
 *   dona). Nos dois casos alguém está com ela.
 * - `humano_assumiu`: um vendedor pegou a conversa durante a geração, e humano tem precedência.
 */
export type WhatsappTurnSilence = 'modo_desligado' | 'turno_reservado' | 'humano_assumiu';

/** Por que a conversa foi ao vendedor sem passar pela IA. Cada motivo tem log próprio. */
export type WhatsappTurnHandoff = 'menu_legado' | 'sem_cota_loja' | 'teto_conversa' | 'infraestrutura';

/**
 * O que ficou registrado no banco junto do encaminhamento.
 *
 * - `completo`: a resposta entrou no histórico e o handoff foi gravado.
 * - `parcial`: o histórico não recebeu a mensagem, mas a conversa está na fila do vendedor.
 * - `nenhum`: o banco não confirmou nada. **Não presumir que alguém vai ver esta conversa.**
 */
export type WhatsappTurnRegistro = 'completo' | 'parcial' | 'nenhum';

/**
 * Resultado de um turno. Era `string | null`, e o `null` juntava quatro situações distintas —
 * modo desligado, turno de outra instância, vendedor assumiu e teto estourado. As três primeiras
 * são silêncio correto; a quarta deixava o cliente esperando para sempre. Sem distinguir no tipo,
 * o webhook não tinha como logar nem agir diferente, e o relatório de incidente não existia.
 */
export type WhatsappTurnResult =
  | { status: 'resposta'; body: string }
  | { status: 'encaminhado'; body: string; motivo: WhatsappTurnHandoff; registro: WhatsappTurnRegistro }
  | { status: 'sem_resposta'; motivo: WhatsappTurnSilence };

export type WhatsappAgentTurnDeps = AgentTurnDeps & {
  reserveTurn?: typeof reserveAutomatedTurn;
  releaseTurn?: typeof releaseAutomatedTurn;
  listMessages?: typeof listConversationMessages;
  commitReply?: typeof commitAutomatedReply;
  /** Rede de segurança do encaminhamento quando `commitReply` não consegue gravar. */
  flagForHuman?: typeof flagConversationForHuman;
  reserveQuota?: typeof reserveWhatsappAiRequest;
  recordTokens?: typeof recordWhatsappAiTokens;
  recordGuardRejection?: typeof recordWhatsappGuardRejection;
  /** Teto por conversa, para um número só não queimar a cota do dia inteiro (I8). */
  consumeConversationQuota?: (conversationId: string) => Promise<RateLimitOutcome>;
  /** Chamado pelo webhook quando a Meta recusa o envio: a conversa vai para um humano (I4). */
  markSendFailure?: (conversationId: string, erro: unknown) => Promise<void>;
  onSendFailed?: (conversationId: string, erro: unknown) => Promise<void>;
  readSetting?: () => Promise<{ mode: string }>;
};

function log(nivel: 'info' | 'warn' | 'error', mensagem: string, dados: Record<string, unknown>) {
  console[nivel](mensagem, JSON.stringify({ ...dados, em: new Date().toISOString() }));
}

/**
 * Encaminha ao vendedor com registro verificável, em dois níveis.
 *
 * O primeiro nível é `commitReply`, que grava a resposta no histórico e abre o handoff na mesma
 * transação. Quando ele falha — e falha justamente quando o banco está ruim, que é quando mais
 * precisamos encaminhar — o segundo nível é `flagForHuman`, que só toca `conversations` e
 * `handoffs`: menos escrita, mais chance de passar.
 *
 * O retorno nunca mente sobre o que foi gravado. `registro: 'nenhum'` é o sinal de que **ninguém
 * foi avisado**, e quem chamou tem de tratar isso como incidente, não como atendimento concluído.
 */
async function encaminharAoVendedor(
  conversationId: string,
  body: string,
  motivo: WhatsappTurnHandoff,
  commitReply: NonNullable<WhatsappAgentTurnDeps['commitReply']>,
  flagForHuman: NonNullable<WhatsappAgentTurnDeps['flagForHuman']>,
): Promise<WhatsappTurnResult> {
  try {
    const gravada = await commitReply(conversationId, {
      sender: 'bot', body, cards: [], handoffReason: 'ai_suggested',
    });
    // null do commit significa que um vendedor assumiu durante a geração: o humano tem
    // precedência e a resposta é descartada sem ir ao cliente.
    if (!gravada) return { status: 'sem_resposta', motivo: 'humano_assumiu' };
    return { status: 'encaminhado', body, motivo, registro: 'completo' };
  } catch (erro) {
    log('error', '[agente] não foi possível gravar a resposta de encaminhamento', {
      evento: 'encaminhamento_commit_falhou', conversationId, motivo,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
  }
  try {
    const sinalizada = await flagForHuman(conversationId, 'ai_suggested');
    if (sinalizada) {
      log('warn', '[agente] encaminhamento registrado sem a mensagem no histórico', {
        evento: 'encaminhamento_registro_parcial', conversationId, motivo,
      });
      return { status: 'encaminhado', body, motivo, registro: 'parcial' };
    }
  } catch (erro) {
    log('error', '[agente] a rede de segurança do encaminhamento também falhou', {
      evento: 'encaminhamento_sinalizacao_falhou', conversationId, motivo,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
  }
  // A mensagem ainda vai ao cliente: ele fica sabendo que um vendedor foi chamado. O que não
  // podemos afirmar é que a conversa apareceu na fila de alguém.
  return { status: 'encaminhado', body, motivo, registro: 'nenhum' };
}

/**
 * Um turno completo no canal WhatsApp.
 *
 * A regra que governa este arquivo: **nenhum limite e nenhuma falha de infraestrutura devolve
 * silêncio.** Limite da loja, teto da conversa, banco indisponível e erro inesperado todos
 * terminam com uma frase para o cliente e um pedido de vendedor. Silêncio sobrou só para os três
 * casos em que ninguém está esperando resposta automática (ver `WhatsappTurnSilence`).
 */
export async function runWhatsappAgentTurn(
  input: WhatsappAgentTurnInput,
  deps: WhatsappAgentTurnDeps = {},
): Promise<WhatsappTurnResult> {
  const reserveTurn = deps.reserveTurn ?? reserveAutomatedTurn;
  const releaseTurn = deps.releaseTurn ?? releaseAutomatedTurn;
  const listMessages = deps.listMessages ?? listConversationMessages;
  const commitReply = deps.commitReply ?? commitAutomatedReply;
  const flagForHuman = deps.flagForHuman ?? flagConversationForHuman;
  const reserveQuota = deps.reserveQuota ?? reserveWhatsappAiRequest;
  const recordTokens = deps.recordTokens ?? recordWhatsappAiTokens;
  const recordGuard = deps.recordGuardRejection ?? recordWhatsappGuardRejection;
  const readSetting = deps.readSetting ?? readWhatsappModeDefault;
  const consumeConversationQuota = deps.consumeConversationQuota ?? consumeConversationQuotaDefault;
  const encaminhar = (body: string, motivo: WhatsappTurnHandoff) =>
    encaminharAoVendedor(input.conversationId, body, motivo, commitReply, flagForHuman);

  /**
   * A leitura do modo é a primeira ida ao banco do turno. Se ela falhar, o modo é desconhecido —
   * e tratar desconhecido como "desligado" devolveria silêncio a uma loja que está com a Dayse
   * ligada. Encaminha.
   */
  let setting: { mode: string };
  try {
    setting = await readSetting();
  } catch (erro) {
    log('error', '[agente] não foi possível ler o modo do canal', {
      evento: 'modo_indisponivel', conversationId: input.conversationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return encaminhar(FALHA_TECNICA_BODY, 'infraestrutura');
  }
  if (setting.mode !== 'ai' && setting.mode !== 'deterministic') {
    return { status: 'sem_resposta', motivo: 'modo_desligado' };
  }

  /**
   * A reserva é o que impede duas instâncias de responderem o mesmo turno — e agora ela vem
   * **antes** do teto por conversa, não depois.
   *
   * O motivo é que o teto deixou de ser um `return null` e passou a gravar uma resposta de
   * encaminhamento. Fora da reserva, duas mensagens simultâneas do mesmo número acima do teto
   * gravariam e enviariam duas vezes a mesma frase ao cliente. Dentro dela, uma só vence.
   *
   * O teto de custo não muda de lugar por isso: a cota paga da loja (`reserveQuota`) continua
   * depois do teto da conversa, então quem estourou o próprio limite não gasta a cota de IA.
   *
   * Falha de banco na reserva não pode virar silêncio nem resposta sem reserva: encaminha.
   */
  let reserved: Awaited<ReturnType<typeof reserveAutomatedTurn>>;
  try {
    reserved = await reserveTurn(input.conversationId);
  } catch (erro) {
    log('error', '[agente] não foi possível reservar o turno', {
      evento: 'reserva_indisponivel', conversationId: input.conversationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return encaminhar(FALHA_TECNICA_BODY, 'infraestrutura');
  }
  if (!reserved) return { status: 'sem_resposta', motivo: 'turno_reservado' };

  try {
    // Teto da própria conversa, para um número só não queimar a cota do dia inteiro (I8).
    const tetoConversa = await consumeConversationQuota(input.conversationId);
    if (tetoConversa !== 'liberado') {
      const motivo = tetoConversa === 'limite' ? 'teto_conversa' : 'infraestrutura';
      log('warn', '[agente] turno bloqueado antes da IA', {
        evento: motivo === 'teto_conversa' ? 'teto_por_conversa' : 'teto_por_conversa_indisponivel',
        conversationId: input.conversationId,
      });
      return await encaminhar(motivo === 'teto_conversa' ? TETO_CONVERSA_BODY : FALHA_TECNICA_BODY, motivo);
    }

    // Banco antigo pode ter modo deterministic salvo. Não gastar IA nem ficar mudo:
    // grava uma resposta explícita e sinaliza a conversa ao vendedor.
    if (setting.mode === 'deterministic') {
      return await encaminhar(MENU_LEGADO_BODY, 'menu_legado');
    }

    const quota = await reserveQuota();
    if (quota.status !== 'reservado') {
      const motivo = quota.status === 'limite' ? 'sem_cota_loja' : 'infraestrutura';
      log('warn', '[agente] cota de IA não liberou o turno', {
        evento: motivo === 'sem_cota_loja' ? 'sem_cota_loja' : 'cota_indisponivel',
        conversationId: input.conversationId,
      });
      return await encaminhar(motivo === 'sem_cota_loja' ? SEM_COTA_BODY : FALHA_TECNICA_BODY, motivo);
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
    if (!sent) return { status: 'sem_resposta', motivo: 'humano_assumiu' };
    return { status: 'resposta', body };
  } catch (erro) {
    /**
     * Qualquer falha daqui para baixo (histórico, contadores, gravação da resposta) deixava o
     * turno estourar. O webhook devolvia 500, a Meta reentregava, e a deduplicação da mensagem
     * de entrada engolia a retentativa: o cliente nunca mais recebia nada.
     */
    log('error', '[agente] turno falhou depois da reserva', {
      evento: 'turno_falhou', conversationId: input.conversationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return await encaminhar(FALHA_TECNICA_BODY, 'infraestrutura');
  } finally {
    /**
     * Liberar a reserva é melhor-esforço. `commitAutomatedReply` já zera `turnLockedUntil` no
     * caminho normal e a reserva expira sozinha em 45 s, então uma falha aqui não trava a
     * conversa — mas, sem o try, ela descartaria um resultado que já tem resposta para o cliente.
     */
    try {
      await releaseTurn(input.conversationId);
    } catch (erro) {
      log('warn', '[agente] não foi possível liberar a reserva do turno', {
        evento: 'liberacao_reserva_falhou', conversationId: input.conversationId,
        detalhe: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }
}
