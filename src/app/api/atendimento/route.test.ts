import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  consumeRateLimit: vi.fn(),
  getSiteChatView: vi.fn(),
  handleSiteTurn: vi.fn(),
}));

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: mocks.requireAdmin,
}));
vi.mock('@/server/env', () => ({
  getAuthSecret: () => 'test-secret-with-at-least-32-chars-123456',
}));
vi.mock('@/server/attendance/limits', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
  rateLimitKey: () => 'test-bucket',
}));
vi.mock('@/server/attendance/site-chat', () => ({
  SiteChatError: class SiteChatError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code: string,
    ) {
      super(message);
      this.name = 'SiteChatError';
    }
  },
  getSiteChatView: mocks.getSiteChatView,
  handleSiteTurn: mocks.handleSiteTurn,
}));

import { AccessDeniedError } from '@/server/authz';
import { DELETE, GET, POST, SITE_CHAT_COOKIE } from './route';

const sampleView = {
  mode: 'deterministic' as const,
  conversation: null,
  messages: [],
  choices: [],
  handoffUrl: 'https://wa.me/5585999999999',
};

describe('rota /api/atendimento', () => {
  const originalAccess = process.env.SITE_CHAT_ACCESS;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SITE_CHAT_ACCESS = 'public';
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.getSiteChatView.mockResolvedValue(sampleView);
    mocks.handleSiteTurn.mockResolvedValue({ token: 'novo-token', view: sampleView });
  });

  afterEach(() => {
    if (originalAccess === undefined) delete process.env.SITE_CHAT_ACCESS;
    else process.env.SITE_CHAT_ACCESS = originalAccess;
  });

  it('responde 404 quando SITE_CHAT_ACCESS está desativado', async () => {
    process.env.SITE_CHAT_ACCESS = 'disabled';
    const response = await GET(new Request('http://localhost:3000/api/atendimento'));
    expect(response.status).toBe(404);
    expect(mocks.getSiteChatView).not.toHaveBeenCalled();
  });

  it('exige administrador quando SITE_CHAT_ACCESS=admin', async () => {
    process.env.SITE_CHAT_ACCESS = 'admin';
    mocks.requireAdmin.mockRejectedValueOnce(new AccessDeniedError());

    const blocked = await GET(new Request('http://localhost:3000/api/atendimento'));
    expect(blocked.status).toBe(404);

    mocks.requireAdmin.mockResolvedValueOnce({ userId: 'admin-1', email: 'admin@liberato.com' });
    const allowed = await GET(new Request('http://localhost:3000/api/atendimento'));
    expect(allowed.status).toBe(200);
  });

  it('rejeita POST com origem diferente e grava cookie HttpOnly quando cria conversa', async () => {
    const crossOrigin = await POST(
      new Request('http://localhost:3000/api/atendimento', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Oi', clientMessageId: '11111111-1111-4111-8111-111111111111' }),
      }),
    );
    expect(crossOrigin.status).toBe(403);

    const valid = await POST(
      new Request('http://localhost:3000/api/atendimento', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Oi', clientMessageId: '11111111-1111-4111-8111-111111111111' }),
      }),
    );
    expect(valid.status).toBe(200);
    expect(valid.headers.get('set-cookie')).toContain(`${SITE_CHAT_COOKIE}=novo-token`);
    expect(valid.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('limpa o cookie de conversa no DELETE da mesma origem', async () => {
    const response = await DELETE(
      new Request('http://localhost:3000/api/atendimento', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:3000' },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
