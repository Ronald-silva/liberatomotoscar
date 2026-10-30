import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { APICallError, UnsupportedFunctionalityError } from 'ai';
import { SITE_URL } from '@/data/store';

/**
 * Decisão 0.4: Claude Sonnet via OpenRouter. O modelo anterior
 * (`deepseek/deepseek-v4-pro-0813`) falhava a saída estruturada ~1 vez a cada 5, e um agente
 * que fala com cliente final paga caro por isso. A troca não exige código: `OPENROUTER_MODEL`
 * sobrepõe este default, que é o ponto da tarefa 4.2 — decidir por medição, não por suposição.
 */
export const DEFAULT_AGENT_MODEL = 'anthropic/claude-sonnet-5-5';

export type AgentProviderErrorCode = 'missing_key' | 'invalid_key' | 'insufficient_credits' |
  'unsupported_model' | 'rate_limited' | 'timeout' | 'upstream';

const safeMessages: Record<AgentProviderErrorCode, string> = {
  missing_key: 'A chave do provedor de IA ainda não foi configurada.',
  invalid_key: 'O acesso ao provedor de IA precisa ser verificado.',
  insufficient_credits: 'Os créditos do provedor de IA estão indisponíveis.',
  unsupported_model: 'O modelo escolhido não oferece as ferramentas exigidas pelo atendimento.',
  rate_limited: 'O provedor de IA atingiu seu limite de chamadas.',
  timeout: 'O provedor de IA demorou a responder.',
  upstream: 'O provedor de IA está indisponível no momento.',
};

export class AgentProviderError extends Error {
  /**
   * O que o provedor realmente disse. A mensagem da classe é segura para o cliente; o detalhe
   * é para o log. Sem ele, uma rodada de eval com 8 falhas vira oito linhas "upstream" e não há
   * como saber se foi rate limit, rota do OpenRouter ou erro do modelo.
   */
  readonly detail: string;

  constructor(public readonly code: AgentProviderErrorCode, cause?: unknown) {
    super(safeMessages[code], cause === undefined ? undefined : { cause });
    this.name = 'AgentProviderError';
    this.detail = describeCause(cause);
  }
}

function describeCause(cause: unknown): string {
  if (cause === undefined || cause === null) return '';
  if (APICallError.isInstance(cause)) {
    const corpo = typeof cause.responseBody === 'string' ? cause.responseBody.slice(0, 300) : '';
    return `HTTP ${cause.statusCode ?? '?'} ${cause.message}${corpo ? ` | ${corpo}` : ''}`;
  }
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause).slice(0, 300);
}

export function getAgentProviderConfig(modelOverride?: string) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new AgentProviderError('missing_key');
  const modelId = modelOverride?.trim() || process.env.OPENROUTER_MODEL?.trim() || DEFAULT_AGENT_MODEL;
  if (!/^[a-z0-9][a-z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(modelId)) {
    throw new AgentProviderError('unsupported_model');
  }
  return { apiKey, modelId };
}

export function getAgentLanguageModel(modelOverride?: string) {
  const { apiKey, modelId } = getAgentProviderConfig(modelOverride);
  const provider = createOpenRouter({
    apiKey,
    compatibility: 'strict',
    appName: 'Liberato Motos Car',
    appUrl: SITE_URL,
  });
  return { model: provider.chat(modelId), modelId };
}

export function normalizeProviderError(error: unknown): AgentProviderError {
  if (error instanceof AgentProviderError) return error;
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return new AgentProviderError('invalid_key', error);
    if (error.statusCode === 402) return new AgentProviderError('insufficient_credits', error);
    if (error.statusCode === 404 || error.statusCode === 400 || error.statusCode === 422) {
      return new AgentProviderError('unsupported_model', error);
    }
    if (error.statusCode === 408 || error.statusCode === 504) return new AgentProviderError('timeout', error);
    if (error.statusCode === 429) return new AgentProviderError('rate_limited', error);
    return new AgentProviderError('upstream', error);
  }
  if (error instanceof UnsupportedFunctionalityError) return new AgentProviderError('unsupported_model', error);
  return new AgentProviderError('upstream', error);
}
