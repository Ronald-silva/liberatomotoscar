import { generateText, isStepCount } from 'ai';
import type { getVehicleDetails, searchAvailableVehicles } from '@/server/vehicles/agent-catalog';
import type { AutomatedReply, MessageCard, MessageRow } from '@/server/attendance/conversation-repository';
import { checkAgentReply, type GuardVerdict } from './guards';
import { AGENT_SYSTEM_PROMPT } from './prompt';
import { getAgentLanguageModel, normalizeProviderError } from './provider';
import {
  createAgentToolFunctions, createAgentTools, createAgentTurnState, semAcento, type VerifiedVehicle,
} from './tools';

/** Passos suficientes para buscar, detalhar, anotar e responder; o bastante para não girar à toa. */
const MAX_PASSOS = 6;
const MAX_TOKENS_SAIDA = 500;
/** Quantos veículos já mostrados reconferir no início do turno. */
const MAX_VEICULOS_RECONFERIDOS = 3;

export type AgentTurnInput = {
  conversationId: string;
  message: string;
  history: MessageRow[];
};

export type AgentTurnDeps = {
  model?: ReturnType<typeof getAgentLanguageModel>['model'];
  modelId?: string;
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
    .map((row) => ({
      role: row.sender === 'visitor' ? ('user' as const) : ('assistant' as const),
      content: row.body,
    }));
  messages.push({ role: 'user' as const, content: message });
  return messages;
}

/**
 * Cartões são renderizados pelo servidor a partir do retorno da ferramenta (princípio 3), e só
 * para o veículo que a resposta realmente cita: cartão de veículo que o texto não menciona
 * confunde quem lê.
 */
function cardsFor(text: string, vehicles: Iterable<VerifiedVehicle>): MessageCard[] {
  const plano = semAcento(text);
  return [...vehicles]
    .filter((veiculo) => plano.includes(semAcento(veiculo.modelo)) || plano.includes(semAcento(veiculo.titulo)))
    .map((veiculo) => ({
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
}

export async function runAgentTurn(input: AgentTurnInput, deps: AgentTurnDeps = {}): Promise<AgentTurnResult> {
  const resolved = deps.model
    ? { model: deps.model, modelId: deps.modelId ?? 'injetado' }
    : getAgentLanguageModel();
  const state = createAgentTurnState();
  const catalogDeps = { searchVehicles: deps.searchVehicles, readVehicle: deps.readVehicle };
  const tools = createAgentTools(state, catalogDeps);
  await reconferirVeiculosJaMostrados(input.history, createAgentToolFunctions(state, catalogDeps));

  const fallback = (
    guard: GuardVerdict,
    usage: { inputTokens: number; outputTokens: number },
    toolsUsed: string[] = [],
  ): AgentTurnResult => ({
    reply: {
      sender: 'ai',
      body: FALLBACK_BODY,
      cards: [],
      // Os fatos já anotados valem mesmo com a resposta descartada: o vendedor precisa deles.
      facts: state.facts,
      handoffReason: state.handoffReason ?? 'ai_suggested',
    },
    usage, guard, fallback: true, modelId: resolved.modelId, toolsUsed,
  });

  let result: Awaited<ReturnType<typeof generateText<typeof tools>>>;
  try {
    result = await generateText({
      model: resolved.model,
      system: AGENT_SYSTEM_PROMPT,
      messages: buildAgentMessages(input.history, input.message),
      tools,
      stopWhen: isStepCount(MAX_PASSOS),
      maxOutputTokens: MAX_TOKENS_SAIDA,
      temperature: 0.4,
      maxRetries: 1,
      timeout: { totalMs: 25_000, stepMs: 15_000 },
    });
  } catch (error) {
    const normalized = normalizeProviderError(error);
    console.warn('[agente] provedor indisponível', JSON.stringify({
      evento: 'provedor_falhou', codigo: normalized.code, conversationId: input.conversationId,
      em: new Date().toISOString(),
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
  const guard = checkAgentReply({
    text, finishReason: result.finishReason, state, conversationId: input.conversationId,
  });
  if (!guard.ok) return fallback(guard, usage, toolsUsed);

  return {
    reply: {
      sender: 'ai',
      body: text,
      cards: cardsFor(text, state.allowedVehicles.values()),
      facts: state.facts,
      handoffReason: state.handoffReason,
    },
    usage, guard, fallback: false, modelId: resolved.modelId, toolsUsed,
  };
}
