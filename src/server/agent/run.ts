import { generateText, isStepCount } from 'ai';
import type { getVehicleDetails, searchAvailableVehicles } from '@/server/vehicles/agent-catalog';
import type { AutomatedReply, MessageCard, MessageRow } from '@/server/attendance/conversation-repository';
import type { AgentTurnState } from './tools';
import { checkAgentReply, type GuardVerdict } from './guards';
import { judgeAgentReply } from './judge';
import { AGENT_SYSTEM_PROMPT } from './prompt';
import { getAgentLanguageModel, normalizeProviderError } from './provider';
import {
  createAgentToolFunctions, createAgentTools, createAgentTurnState, semAcento, veiculosCitaveis,
  type VerifiedVehicle,
} from './tools';

/**
 * Passos do laço. Com reconferência, busca, ficha, anotação de lead e chamada de vendedor, 6
 * apertava: o turno acabava no limite ainda chamando ferramenta, sem ter escrito uma frase.
 */
const MAX_PASSOS = 8;
/**
 * Teto de saída POR PASSO, não por mensagem. Quem limita o tamanho do que vai ao cliente é a
 * guarda de 900 caracteres e o prompt, que pede 2 ou 3 frases.
 *
 * Em 700 o modelo estourava o passo em raciocínio e chamadas de ferramenta antes de escrever a
 * primeira frase: o turno terminava com finishReason=length e texto VAZIO em quase 30% das
 * vezes, e o cliente recebia "prefiro não responder" para um "oi". Uma segunda tentativa não
 * resolvia, porque a causa não era azar de amostragem — era o teto. Folga aqui não encarece: a
 * cobrança é por token gerado, e o que limita a geração é a instrução, não este número.
 */
const MAX_TOKENS_SAIDA = 4000;
/** Quantos veículos já mostrados reconferir no início do turno. */
const MAX_VEICULOS_RECONFERIDOS = 3;
/**
 * Mensagens anteriores que o modelo vê. A conversa de teste em produção chegou a 59 mensagens,
 * quase todas do sistema de regex anterior — e o modelo imitava aquele estilo verboso, escrevia
 * longo demais e era cortado no limite de tokens, entregando resposta VAZIA em 10% dos turnos.
 * Janela curta também é o que o plano pede na seção 1.4: "o custo é o token".
 */
export const JANELA_DE_HISTORICO = 16;

export type AgentTurnInput = {
  conversationId: string;
  message: string;
  history: MessageRow[];
};

export type AgentTurnDeps = {
  model?: ReturnType<typeof getAgentLanguageModel>['model'];
  modelId?: string;
  /** Juiz de política. Injetável para teste; em produção usa o modelo barato de `judge.ts`. */
  judge?: typeof judgeAgentReply;
  searchVehicles?: typeof searchAvailableVehicles;
  readVehicle?: typeof getVehicleDetails;
};

export type AgentTurnResult = {
  reply: AutomatedReply;
  usage: { inputTokens: number; outputTokens: number };
  guard: GuardVerdict;
  /** true quando o cliente recebeu a mensagem honesta em vez da resposta do modelo. */
  fallback: boolean;
  modelId: string;
  /** Nomes das ferramentas chamadas no turno, na ordem. Insumo dos critérios da eval (4.3). */
  toolsUsed: string[];
  /**
   * O que o modelo escreveu, antes das guardas. Null quando o provedor nem respondeu. É o que o
   * relatório da eval precisa mostrar: dizer que o fallback foi reprovado não diagnostica nada.
   */
  modelText: string | null;
};

/**
 * Mensagem que vai ao cliente quando o provedor falha ou uma guarda reprova. Ser honesta sobre
 * o limite é melhor do que devolver uma pergunta genérica que ignora o que a pessoa perguntou —
 * e melhor ainda do que arriscar a frase que não passou na verificação.
 */
const FALLBACK_BODY = 'Essa eu prefiro não responder por aqui sem confirmar, para não te passar '
  + 'informação errada. Já chamei um vendedor para te responder com segurança.';

/**
 * 2.3 — histórico da conversa como o modelo o vê. Vendedor e automação entram os dois como
 * `assistant`: do lado do cliente é a mesma voz da loja, e tratar a fala do vendedor como
 * mensagem do cliente faria o modelo responder ao próprio vendedor.
 */
export function buildAgentMessages(history: MessageRow[], message: string) {
  const messages = history
    .filter((row) => row.body.trim())
    .slice(-JANELA_DE_HISTORICO)
    .map((row) => ({
      role: row.sender === 'visitor' ? ('user' as const) : ('assistant' as const),
      content: row.body,
    }));
  messages.push({ role: 'user' as const, content: message });
  return messages;
}

/** Trecho que indica que a moto citada é a DO CLIENTE, não uma oferta da loja. */
const MENCAO_DO_CLIENTE = /\b(anotei|sua|seu|do seu|da sua|na troca|para a troca|pra troca|de entrada|que voce tem|voce falou|voce disse)\b/;

/**
 * Cartões são renderizados pelo servidor a partir do retorno da ferramenta (princípio 3), e só
 * para o veículo que a resposta realmente OFERECE.
 *
 * Duas regras vieram de uma conversa real em que o cliente disse "Titan 2002", falando da
 * própria moto para troca, e recebeu o cartão da Titan 2013 da loja por R$ 11.500 — como se o
 * agente estivesse vendendo o que ele acabou de dizer que quer entregar:
 *
 * 1. A frase que cita o modelo não pode estar falando do veículo do cliente.
 * 2. Se um ano aparece colado ao modelo e não é o do cadastro, é outro veículo.
 */
export function cardsFor(text: string, vehicles: Iterable<VerifiedVehicle>): MessageCard[] {
  const frases = semAcento(text).split(/(?<=[.!?…])\s+|\n+/).filter((f) => f.trim());
  const vistos = new Set<string>();

  return [...vehicles].filter((veiculo) => {
    const nome = semAcento(veiculo.modelo);
    const titulo = semAcento(veiculo.titulo);
    const ofertado = frases.some((frase) => {
      const indice = frase.indexOf(nome) >= 0 ? frase.indexOf(nome) : frase.indexOf(titulo);
      if (indice < 0) return false;
      if (MENCAO_DO_CLIENTE.test(frase)) return false;
      // Ano colado ao modelo que não bate com o cadastro: o cliente está falando de outra moto.
      const depois = frase.slice(indice, indice + nome.length + 12);
      const ano = depois.match(/\b(19|20)\d{2}\b/);
      return !ano || Number(ano[0]) === veiculo.ano;
    });
    if (!ofertado || vistos.has(titulo)) return false;
    vistos.add(titulo);
    return true;
  }).map((veiculo) => ({
    id: veiculo.id,
    title: veiculo.titulo,
    year: veiculo.ano,
    priceCents: veiculo.precoCentavos,
    href: `/veiculos/${veiculo.slug}`,
  }));
}

/**
 * Veículos que a conversa já mostrou, relidos do banco no começo do turno.
 *
 * Sem isto, a segunda mensagem sobre o mesmo veículo cai na guarda: o cliente pergunta "quantos
 * km ela tem?", o modelo responde sem chamar ferramenta de novo — porque já sabe pelo histórico —
 * e a quilometragem é tratada como número inventado. Afrouxar a guarda seria o conserto errado.
 *
 * Reler é mais forte do que confiar no cartão antigo: preço muda e veículo é vendido. O que saiu
 * do estoque não volta ao estado do turno, e aí o agente deixa de poder falar dele como
 * disponível — que é exatamente o certo.
 */
async function reconferirVeiculosJaMostrados(
  history: MessageRow[],
  fn: ReturnType<typeof createAgentToolFunctions>,
  state: AgentTurnState,
) {
  const ids: string[] = [];
  for (const row of history) {
    for (const card of row.cards ?? []) {
      if (!ids.includes(card.id)) ids.push(card.id);
    }
  }
  const recentes = ids.slice(-MAX_VEICULOS_RECONFERIDOS);
  // detalharVeiculo já grava no estado do turno e trata id inválido como resultado, não exceção.
  await Promise.all(recentes.map((id) => fn.detalharVeiculo({ id })));
  for (const id of recentes) if (state.allowedVehicles.has(id)) state.reconferredIds.add(id);
}

export async function runAgentTurn(input: AgentTurnInput, deps: AgentTurnDeps = {}): Promise<AgentTurnResult> {
  const resolved = deps.model
    ? { model: deps.model, modelId: deps.modelId ?? 'injetado' }
    : getAgentLanguageModel();
  const state = createAgentTurnState();
  const catalogDeps = { searchVehicles: deps.searchVehicles, readVehicle: deps.readVehicle };
  const tools = createAgentTools(state, catalogDeps);
  await reconferirVeiculosJaMostrados(input.history, createAgentToolFunctions(state, catalogDeps), state);

  const fallback = (
    guard: GuardVerdict,
    usage: { inputTokens: number; outputTokens: number },
    toolsUsed: string[] = [],
    modelText: string | null = null,
  ): AgentTurnResult => ({
    reply: {
      sender: 'ai',
      body: FALLBACK_BODY,
      cards: [],
      // Os fatos já anotados valem mesmo com a resposta descartada: o vendedor precisa deles.
      facts: state.facts,
      handoffReason: state.handoffReason ?? 'ai_suggested',
    },
    usage, guard, fallback: true, modelId: resolved.modelId, toolsUsed, modelText,
  });

  const messages = buildAgentMessages(input.history, input.message);
  const gerar = () => generateText({
    model: resolved.model,
    system: AGENT_SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: isStepCount(MAX_PASSOS),
    maxOutputTokens: MAX_TOKENS_SAIDA,
    temperature: 0.4,
    maxRetries: 1,
    timeout: { totalMs: 25_000, stepMs: 15_000 },
  });

  let result: Awaited<ReturnType<typeof generateText<typeof tools>>>;
  try {
    result = await gerar();
    // Terminar sem escrever nada não é resposta ruim: é resposta nenhuma. Mandar o fallback
    // aqui desperdiça um turno do cliente por um problema que uma segunda amostra costuma
    // resolver — eram 10% dos turnos em produção, com o cliente lendo "prefiro não responder"
    // para um "oi". Vale para qualquer motivo: cortado no limite ou passos esgotados em
    // chamadas de ferramenta.
    if (!result.text.trim()) {
      console.warn('[agente] turno sem texto; tentando de novo', JSON.stringify({
        evento: 'saida_vazia_retentada', motivo: result.finishReason,
        conversationId: input.conversationId, em: new Date().toISOString(),
      }));
      result = await gerar();
    }
  } catch (error) {
    const normalized = normalizeProviderError(error);
    console.warn('[agente] provedor indisponível', JSON.stringify({
      evento: 'provedor_falhou', codigo: normalized.code, detalhe: normalized.detail,
      conversationId: input.conversationId, em: new Date().toISOString(),
    }));
    return fallback({ ok: false, violation: 'tamanho_invalido', detail: `provedor: ${normalized.code}` },
      { inputTokens: 0, outputTokens: 0 });
  }

  const usage = {
    inputTokens: result.totalUsage.inputTokens ?? 0,
    outputTokens: result.totalUsage.outputTokens ?? 0,
  };
  const toolsUsed = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
  const text = result.text.trim();
  const customerText = [...input.history.filter((m) => m.sender === 'visitor').map((m) => m.body),
    input.message].join('\n');

  // 1) Conferência mecânica: número fora do catálogo, link de terceiro, id vazado, resposta
  //    vazia ou truncada. Determinística, barata e sem falso positivo.
  const guard = checkAgentReply({
    text, finishReason: result.finishReason, state, conversationId: input.conversationId,
    customerText,
  });
  if (!guard.ok) return fallback(guard, usage, toolsUsed, text);

  // 2) Julgamento de política, por modelo. Promessa, negociação, estimativa de troca e estoque
  //    inventado são questões de SENTIDO, e decidir sentido por regex foi o que produziu 41% de
  //    falso positivo — a arquitetura que o próprio plano manda não repetir (seção 1.2).
  const julgamento = await (deps.judge ?? judgeAgentReply)({
    reply: text, veiculos: veiculosCitaveis(state), customerText,
  });
  if (!julgamento.ok) {
    console.warn('[agente] juiz reprovou', JSON.stringify({
      evento: 'juiz_reprovou', violacao: julgamento.violation, detalhe: julgamento.detail,
      conversationId: input.conversationId, saidaOriginal: text, em: new Date().toISOString(),
    }));
    return fallback(julgamento, usage, toolsUsed, text);
  }

  return {
    reply: {
      sender: 'ai',
      body: text,
      cards: cardsFor(text, veiculosCitaveis(state)),
      facts: state.facts,
      handoffReason: state.handoffReason,
    },
    usage, guard, fallback: false, modelId: resolved.modelId, toolsUsed, modelText: text,
  };
}
