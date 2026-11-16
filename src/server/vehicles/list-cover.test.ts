import { beforeEach, describe, expect, it, vi } from 'vitest';

// O serviço real puxa a autenticação; aqui só a autorização, o banco e o R2 são simulados.
const stub = vi.hoisted(() => ({
  denied: false,
  rows: [] as unknown[],
  // O que a consulta pediu ao banco, para a paginação poder ser afirmada e não suposta.
  pedido: { limit: null as number | null, offset: null as number | null, ordenou: false },
}));

vi.mock('@/server/authz', () => ({
  requireAdmin: async () => {
    if (stub.denied) throw new Error('Acesso negado');
    return { userId: 'admin' };
  },
}));
vi.mock('@/server/db/client', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({
      orderBy: () => { stub.pedido.ordenou = true; return {
        limit: (valor: number) => { stub.pedido.limit = valor; return {
          offset: async (salto: number) => { stub.pedido.offset = salto; return stub.rows; },
        }; },
      }; },
    }) }) }) }),
  }),
}));
vi.mock('@/server/storage/r2', () => ({ createR2Storage: () => { throw new Error('não deve criar R2 real'); }, checkPhoto: vi.fn() }));

import { ADMIN_PAGE_SIZE, listAdminVehiclesWithCover } from './service';

const storage = { put: vi.fn(), delete: vi.fn(), signedReadUrl: vi.fn(async (key: string) => `https://r2.exemplo/${key}?assinatura=x`) };
const row = (id: string, cover: { storageKey: string; storageProvider: 'r2' | 'legacy_public' } | null) => ({ vehicle: { id }, cover });

beforeEach(() => {
  stub.denied = false;
  stub.rows = [];
  stub.pedido = { limit: null, offset: null, ordenou: false };
  storage.signedReadUrl.mockClear();
});

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

// A paginação é do servidor, não da tela: a tela nunca recebe o estoque inteiro para recortar.
describe('paginação no servidor', () => {
  it('a primeira página pede o tamanho padrão e salto zero', async () => {
    await listAdminVehiclesWithCover({ storage });
    expect(stub.pedido).toEqual({ limit: ADMIN_PAGE_SIZE, offset: 0, ordenou: true });
  });

  it('a página N salta (N-1) páginas', async () => {
    await listAdminVehiclesWithCover({ page: 3, pageSize: 20, storage });
    expect(stub.pedido.limit).toBe(20);
    expect(stub.pedido.offset).toBe(40);
  });

  it('página e tamanho absurdos não viram salto negativo nem consulta sem limite', async () => {
    await listAdminVehiclesWithCover({ page: 0, storage });
    expect(stub.pedido.offset).toBe(0);
    await listAdminVehiclesWithCover({ page: -7, pageSize: 0, storage });
    expect(stub.pedido.offset).toBe(0);
    expect(stub.pedido.limit).toBe(1);
    await listAdminVehiclesWithCover({ page: 2.7, pageSize: 10.9, storage });
    expect(stub.pedido.limit).toBe(10);
    expect(stub.pedido.offset).toBe(10);
  });

  it('a busca também passa por requireAdmin antes de tocar o banco', async () => {
    stub.denied = true;
    await expect(listAdminVehiclesWithCover({ search: 'honda', storage })).rejects.toThrow('Acesso negado');
    expect(stub.pedido.limit).toBeNull();
  });
});
