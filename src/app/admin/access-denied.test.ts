import { beforeEach, describe, expect, it, vi } from 'vitest';

// A barreira real vive em @/server/authz, que carrega Auth.js e o banco. Aqui só o
// contrato importa: o que cada rota faz quando a concessão falta ou o servidor falha.
const stub = vi.hoisted(() => ({
  AccessDeniedError: class AccessDeniedError extends Error {
    constructor() { super('Acesso negado'); }
  },
  failure: undefined as unknown,
}));

vi.mock('@/server/authz', () => ({
  AccessDeniedError: stub.AccessDeniedError,
  requireAdmin: async () => {
    if (stub.failure) throw stub.failure;
    return { userId: 'usuario-com-concessao' };
  },
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { redirectUrl: url }); },
}));

import ProtectedAdminLayout from './(protected)/layout';
import { GET as healthGet } from '../api/admin/health/route';

beforeEach(() => { stub.failure = undefined; });

describe('layout protegido do painel', () => {
  it('entrega o conteúdo para quem tem concessão ativa', async () => {
    await expect(ProtectedAdminLayout({ children: 'painel' })).resolves.toBe('painel');
  });

  it('manda ao login quem não tem concessão administrativa', async () => {
    stub.failure = new stub.AccessDeniedError();
    await expect(ProtectedAdminLayout({ children: 'painel' })).rejects.toMatchObject({ redirectUrl: '/admin/login' });
  });

  it('não esconde falhas de infraestrutura atrás do login', async () => {
    stub.failure = new Error('banco indisponível');
    await expect(ProtectedAdminLayout({ children: 'painel' })).rejects.toThrow('banco indisponível');
  });
});

describe('rota administrativa de verificação', () => {
  it('responde ok apenas para administrador autorizado', async () => {
    const response = await healthGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('nega sem vazar detalhes quando falta concessão', async () => {
    stub.failure = new stub.AccessDeniedError();
    const response = await healthGet();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Acesso negado' });
  });

  it('separa indisponibilidade de servidor de acesso negado', async () => {
    stub.failure = new Error('banco indisponível');
    const response = await healthGet();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Serviço indisponível' });
  });
});
