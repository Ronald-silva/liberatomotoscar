import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  runDemoAgent: vi.fn(),
  reserveDemoRequest: vi.fn(),
  recordDemoTokens: vi.fn(),
}));

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: mocks.requireAdmin,
}));
vi.mock('@/server/env', () => ({ getAuthSecret: () => 'segredo-longo-apenas-para-teste-de-rota' }));
vi.mock('@/server/ai/demo-agent', () => ({ runDemoAgent: mocks.runDemoAgent }));
vi.mock('@/server/ai/demo-usage', () => ({
  DemoLimitError: class DemoLimitError extends Error {},
  reserveDemoRequest: mocks.reserveDemoRequest,
  recordDemoTokens: mocks.recordDemoTokens,
}));

import { POST } from './route';
import { AccessDeniedError } from '@/server/authz';
import { DemoLimitError } from '@/server/ai/demo-usage';
import { DemoProviderError } from '@/server/ai/provider';

function request(body: unknown, origin = 'https://liberato.example', accept?: string) {
  return new Request('https://liberato.example/api/demo-ia', {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...(accept ? { accept } : {}) }, body: JSON.stringify(body),
  });
}

describe('rota da demonstração', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_AI_ENABLED = 'true';
    process.env.OPENROUTER_API_KEY = 'chave-ficticia-apenas-para-teste';
    mocks.requireAdmin.mockResolvedValue({ userId: 'admin-teste' });
    mocks.reserveDemoRequest.mockResolvedValue({ dayUtc: '2026-10-26', requests: 1 });
    mocks.recordDemoTokens.mockResolvedValue(undefined);
  });

  it('fica fechada quando a flag está desligada', async () => {
    process.env.DEMO_AI_ENABLED = 'false';
    const response = await POST(request({ message: 'Quero uma moto', state: null }));
    expect(response.status).toBe(503);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
  });

  it('recusa origem diferente e usuário sem autorização', async () => {
    expect((await POST(request({ message: 'Oi', state: null }, 'https://outro.example'))).status).toBe(403);
    mocks.requireAdmin.mockRejectedValue(new AccessDeniedError());
    expect((await POST(request({ message: 'Oi', state: null }))).status).toBe(401);
    expect(mocks.runDemoAgent).not.toHaveBeenCalled();
  });

  it('se o modelo falha, informa indisponibilidade sem inventar veículos', async () => {
    mocks.runDemoAgent.mockRejectedValue(new Error('provider unavailable'));
    const response = await POST(request({ message: 'Quero uma moto até 18 mil', state: null }));
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error).toContain('Não consegui consultar o estoque');
    expect(payload.cards).toBeUndefined();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('não chama o modelo quando o limite diário foi atingido', async () => {
    mocks.reserveDemoRequest.mockRejectedValue(new DemoLimitError());
    const response = await POST(request({ message: 'Quero um carro', state: null }));
    expect(response.status).toBe(429);
    expect(mocks.runDemoAgent).not.toHaveBeenCalled();
  });

  it('trata falha de banco antes de chamar o modelo', async () => {
    mocks.reserveDemoRequest.mockRejectedValue(new Error('database unavailable'));
    const response = await POST(request({ message: 'Quero um carro', state: null }));
    expect(response.status).toBe(503);
    expect(mocks.runDemoAgent).not.toHaveBeenCalled();
    expect((await response.json()).error).not.toContain('database');
  });

  it('recusa estado adulterado sem consumir a cota', async () => {
    const response = await POST(request({ message: 'Quero um carro', state: 'abc.def' }));
    expect(response.status).toBe(400);
    expect(mocks.reserveDemoRequest).not.toHaveBeenCalled();
  });

  it('informa ausência de chave antes de reservar cota diária', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await POST(request({ message: 'Quero uma moto', state: null }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('chave do provedor');
    expect(mocks.reserveDemoRequest).not.toHaveBeenCalled();
    expect(mocks.runDemoAgent).not.toHaveBeenCalled();
  });

  it('transmite progresso e só envia a resposta validada no evento final', async () => {
    mocks.runDemoAgent.mockImplementation(async (_session, _message, onProgress) => {
      onProgress?.('inventory_checked');
      return { answer: 'Encontrei um anúncio publicado.', cards: [], lead: { stage: 'researching', facts: [], nextAction: 'Continuar pesquisa.' },
        handoffUrl: null, handoffRequested: false, checkedAt: '2026-10-26T00:00:00Z', model: 'deepseek/deepseek-v4-pro-0813',
        usage: { inputTokens: 120, outputTokens: 40 } };
    });
    const response = await POST(request({ message: 'Quero uma moto', state: null }, undefined, 'text/event-stream'));
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('event: status');
    expect(body).toContain('inventory_checked');
    expect(body).toContain('event: answer');
    expect(body).toContain('deepseek/deepseek-v4-pro-0813');
    expect(body).toContain('"state":"');
    expect(mocks.recordDemoTokens).toHaveBeenCalledWith('admin-teste', '2026-10-26', 120, 40);
  });

  it('transmite falha de crédito com mensagem segura, sem resposta de anúncio', async () => {
    mocks.runDemoAgent.mockRejectedValue(new DemoProviderError('insufficient_credits'));
    const response = await POST(request({ message: 'Quero uma moto', state: null }, undefined, 'text/event-stream'));
    const body = await response.text();
    expect(body).toContain('event: error');
    expect(body).toContain('insufficient_credits');
    expect(body).not.toContain('event: answer');
  });
});
