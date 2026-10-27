import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { APICallError, NoObjectGeneratedError, UnsupportedFunctionalityError } from 'ai';
import { SITE_URL } from '@/data/store';

export const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-pro-0813';

export type DemoProviderErrorCode = 'missing_key' | 'invalid_key' | 'insufficient_credits' |
  'unsupported_model' | 'rate_limited' | 'timeout' | 'upstream';

const safeMessages: Record<DemoProviderErrorCode, string> = {
  missing_key: 'A chave do provedor de IA ainda não foi configurada.',
  invalid_key: 'O acesso ao provedor de IA precisa ser verificado.',
  insufficient_credits: 'Os créditos do provedor de IA estão indisponíveis.',
  unsupported_model: 'O modelo escolhido não oferece as ferramentas exigidas pela demonstração.',
  rate_limited: 'O provedor de IA atingiu seu limite de chamadas. Tente novamente mais tarde.',
  timeout: 'O provedor de IA demorou a responder. Tente novamente.',
  upstream: 'O provedor de IA está indisponível no momento.',
};

export class DemoProviderError extends Error {
  constructor(public readonly code: DemoProviderErrorCode) {
    super(safeMessages[code]);
    this.name = 'DemoProviderError';
  }
}

export function getDemoProviderConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new DemoProviderError('missing_key');
  const modelId = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  if (!/^[a-z0-9][a-z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(modelId)) {
    throw new DemoProviderError('unsupported_model');
  }
  return { apiKey, modelId };
}

export function getDemoLanguageModel() {
  const { apiKey, modelId } = getDemoProviderConfig();
  const provider = createOpenRouter({
    apiKey,
    compatibility: 'strict',
    appName: 'Liberato Motos Car',
    appUrl: SITE_URL,
  });
  return { model: provider.chat(modelId), modelId };
}

export function normalizeProviderError(error: unknown): DemoProviderError {
  if (error instanceof DemoProviderError) return error;
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return new DemoProviderError('invalid_key');
    if (error.statusCode === 402) return new DemoProviderError('insufficient_credits');
    if (error.statusCode === 404 || error.statusCode === 400 || error.statusCode === 422) return new DemoProviderError('unsupported_model');
    if (error.statusCode === 408 || error.statusCode === 504) return new DemoProviderError('timeout');
    if (error.statusCode === 429) return new DemoProviderError('rate_limited');
    return new DemoProviderError('upstream');
  }
  if (NoObjectGeneratedError.isInstance(error) || error instanceof UnsupportedFunctionalityError) {
    return new DemoProviderError('unsupported_model');
  }
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new DemoProviderError('timeout');
  }
  return new DemoProviderError('upstream');
}
