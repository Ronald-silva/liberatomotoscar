import { afterEach, describe, expect, it } from 'vitest';
import { APICallError } from 'ai';
import { DEFAULT_OPENROUTER_MODEL, DemoProviderError, getDemoLanguageModel, normalizeProviderError } from './provider';

const originalKey = process.env.OPENROUTER_API_KEY;
const originalModel = process.env.OPENROUTER_MODEL;

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalModel;
});

describe('adaptador OpenRouter', () => {
  it('recusa ausência de chave antes de qualquer chamada externa', () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => getDemoLanguageModel()).toThrow(new DemoProviderError('missing_key'));
  });

  it('usa instância explícita do OpenRouter e aceita modelo configurado', () => {
    process.env.OPENROUTER_API_KEY = 'chave-ficticia-apenas-para-teste';
    delete process.env.OPENROUTER_MODEL;
    const defaultModel = getDemoLanguageModel();
    expect(defaultModel.modelId).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(defaultModel.model.provider).toContain('openrouter');
    process.env.OPENROUTER_MODEL = 'google/gemini-3-flash-preview';
    expect(getDemoLanguageModel().modelId).toBe('google/gemini-3-flash-preview');
  });

  it('recusa identificador inválido e classifica erros HTTP sem expor corpo do provedor', () => {
    process.env.OPENROUTER_API_KEY = 'chave-ficticia-apenas-para-teste';
    process.env.OPENROUTER_MODEL = 'https://host/segredo';
    expect(() => getDemoLanguageModel()).toThrow(new DemoProviderError('unsupported_model'));
    for (const [status, code] of [[401, 'invalid_key'], [402, 'insufficient_credits'], [404, 'unsupported_model'],
      [429, 'rate_limited'], [504, 'timeout'], [500, 'upstream']] as const) {
      const error = new APICallError({ message: 'raw-secret', url: 'https://openrouter.ai/api/v1/chat/completions',
        requestBodyValues: {}, statusCode: status, responseBody: 'raw-secret' });
      const normalized = normalizeProviderError(error);
      expect(normalized.code).toBe(code);
      expect(normalized.message).not.toContain('raw-secret');
    }
    expect(normalizeProviderError(new DOMException('deadline', 'TimeoutError')).code).toBe('timeout');
  });
});
