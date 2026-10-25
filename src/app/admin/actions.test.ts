import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stub = vi.hoisted(() => ({
  configured: true,
  allowed: true,
  signIn: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ signIn: stub.signIn, signOut: stub.signOut }) }));
vi.mock('@/server/auth-policy', () => ({ isAdminAuthConfigured: () => stub.configured }));
vi.mock('@/server/login-rate-limit', () => ({
  consumeLoginAttempt: () => ({ allowed: stub.allowed, retryAfterSeconds: 60 }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { redirectUrl: url }); },
}));

import { logoutAdmin, startAdminLogin } from './actions';

async function redirectOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try { await run(); } catch (error) { return (error as { redirectUrl?: string }).redirectUrl; }
  return undefined;
}

beforeEach(() => { stub.configured = true; stub.allowed = true; });
afterEach(() => { stub.signIn.mockClear(); stub.signOut.mockClear(); });

describe('início de login administrativo', () => {
  it('encaminha ao Google e volta para o painel', async () => {
    await startAdminLogin();
    expect(stub.signIn).toHaveBeenCalledWith('google', { redirectTo: '/admin' });
  });

  it('não abre provedor enquanto a configuração do servidor estiver incompleta', async () => {
    stub.configured = false;
    expect(await redirectOf(startAdminLogin)).toBe('/admin/login?status=unavailable');
    expect(stub.signIn).not.toHaveBeenCalled();
  });

  it('não abre provedor depois do limite de tentativas', async () => {
    stub.allowed = false;
    expect(await redirectOf(startAdminLogin)).toBe('/admin/login?status=limit');
    expect(stub.signIn).not.toHaveBeenCalled();
  });
});

describe('saída do painel', () => {
  it('encerra a sessão no servidor e devolve o usuário ao login', async () => {
    await logoutAdmin();
    expect(stub.signOut).toHaveBeenCalledWith({ redirectTo: '/admin/login' });
  });

  it('volta ao login sem chamar o provedor quando não há configuração', async () => {
    stub.configured = false;
    expect(await redirectOf(logoutAdmin)).toBe('/admin/login');
    expect(stub.signOut).not.toHaveBeenCalled();
  });
});
