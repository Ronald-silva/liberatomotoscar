import { beforeEach, describe, expect, it, vi } from 'vitest';

// O serviço real puxa a autenticação; aqui só a autorização, o banco e o R2 são simulados.
const stub = vi.hoisted(() => ({
  denied: false,
  rows: [] as unknown[],
}));

vi.mock('@/server/authz', () => ({
  requireAdmin: async () => {
    if (stub.denied) throw new Error('Acesso negado');
    return { userId: 'admin' };
  },
}));
vi.mock('@/server/db/client', () => ({
  getDb: () => ({ select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: async () => stub.rows }) }) }) }) }),
}));
vi.mock('@/server/storage/r2', () => ({ createR2Storage: () => { throw new Error('não deve criar R2 real'); }, checkPhoto: vi.fn() }));

import { listAdminVehiclesWithCover } from './service';

const storage = { put: vi.fn(), delete: vi.fn(), signedReadUrl: vi.fn(async (key: string) => `https://r2.exemplo/${key}?assinatura=x`) };
const row = (id: string, cover: { storageKey: string; storageProvider: 'r2' | 'legacy_public' } | null) => ({ vehicle: { id }, cover });

beforeEach(() => { stub.denied = false; stub.rows = []; storage.signedReadUrl.mockClear(); });

describe('estoque com capa', () => {
  it('recusa quem não tem permissão administrativa, sem consultar nada', async () => {
    stub.denied = true;
    stub.rows = [row('a', null)];
    await expect(listAdminVehiclesWithCover({ storage })).rejects.toThrow('Acesso negado');
    expect(storage.signedReadUrl).not.toHaveBeenCalled();
  });

  it('devolve o caminho público cru para capa legacy_public, sem assinar', async () => {
    stub.rows = [row('a', { storageKey: '/images/foo.png', storageProvider: 'legacy_public' })];
    const [item] = await listAdminVehiclesWithCover({ storage });
    expect(item.coverUrl).toBe('/images/foo.png');
    expect(storage.signedReadUrl).not.toHaveBeenCalled();
  });

  it('devolve URL assinada para capa r2', async () => {
    stub.rows = [row('a', { storageKey: 'drafts/v/i.jpg', storageProvider: 'r2' })];
    const [item] = await listAdminVehiclesWithCover({ storage });
    expect(item.coverUrl).toBe('https://r2.exemplo/drafts/v/i.jpg?assinatura=x');
  });

  it('não quebra com veículo sem capa e mantém os demais', async () => {
    stub.rows = [row('a', null), row('b', { storageKey: '/images/b.png', storageProvider: 'legacy_public' })];
    const items = await listAdminVehiclesWithCover({ storage });
    expect(items.map((item) => item.coverUrl)).toEqual([null, '/images/b.png']);
  });

  it('falha ao assinar uma capa vira sem foto, não derruba a lista', async () => {
    storage.signedReadUrl.mockRejectedValueOnce(new Error('segredo'));
    stub.rows = [row('a', { storageKey: 'drafts/v/i.jpg', storageProvider: 'r2' })];
    const [item] = await listAdminVehiclesWithCover({ storage });
    expect(item.coverUrl).toBeNull();
  });
});
