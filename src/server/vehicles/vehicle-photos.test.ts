import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mesma técnica de list-cover.test.ts: o serviço real puxa autenticação e rede, então aqui
// autorização, banco e R2 são simulados. O que importa é o contrato da tela de edição e o
// custo dela — uma autorização e duas consultas, nunca uma por foto.
const stub = vi.hoisted(() => ({
  denied: false,
  authorizations: 0,
  queries: 0,
  vehicleRows: [] as unknown[],
  imageRows: [] as unknown[],
}));

vi.mock('@/server/authz', () => ({
  requireAdmin: async () => {
    if (stub.denied) throw new Error('Acesso negado');
    stub.authorizations += 1;
    return { userId: 'admin' };
  },
}));
// A consulta do veículo termina em .limit(); a das imagens, em .orderBy().
vi.mock('@/server/db/client', () => ({
  getDb: () => ({
    select: () => {
      stub.queries += 1;
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: async () => stub.vehicleRows,
        orderBy: async () => stub.imageRows,
      };
      return chain;
    },
  }),
}));
vi.mock('@/server/storage/r2', () => ({
  createR2Storage: () => { throw new Error('não deve criar R2 real'); },
  checkPhoto: vi.fn(),
}));

import { getAdminVehicle, VehicleNotFoundError } from './service';

const ID = '0f1d3c62-9a1b-4c63-9f6e-7a2b5c8d4e10';
const storage = {
  put: vi.fn(),
  delete: vi.fn(),
  signedReadUrl: vi.fn(async (key: string) => `https://r2.exemplo/${key}?assinatura=x`),
};
const image = (id: string, storageProvider: 'r2' | 'legacy_public', storageKey: string, isCover = false) =>
  ({ id, storageProvider, storageKey, isCover });

beforeEach(() => {
  stub.denied = false;
  stub.authorizations = 0;
  stub.queries = 0;
  stub.vehicleRows = [{ id: ID, brand: 'Honda' }];
  stub.imageRows = [];
  storage.signedReadUrl.mockClear();
});

describe('veículo administrativo com fotos', () => {
  it('cobra uma autorização e duas consultas, independente do número de fotos', async () => {
    stub.imageRows = [
      image('i1', 'r2', 'drafts/v/1.jpg', true),
      image('i2', 'r2', 'drafts/v/2.jpg'),
      image('i3', 'r2', 'drafts/v/3.jpg'),
    ];
    const { photos } = await getAdminVehicle(ID, storage);
    expect(photos).toHaveLength(3);
    expect(stub.authorizations).toBe(1);
    expect(stub.queries).toBe(2);
    // Assinar é cálculo local: uma vez por foto, sem ida ao banco.
    expect(storage.signedReadUrl).toHaveBeenCalledTimes(3);
  });

  it('devolve o caminho público cru para legacy_public, sem assinar nem criar R2', async () => {
    stub.imageRows = [image('i1', 'legacy_public', '/images/foo.png', true)];
    const { photos } = await getAdminVehicle(ID);
    expect(photos).toEqual([{ id: 'i1', isCover: true, url: '/images/foo.png' }]);
  });

  it('devolve URL assinada para foto em r2, preservando ordem e capa', async () => {
    stub.imageRows = [image('i1', 'r2', 'drafts/v/1.jpg', true), image('i2', 'legacy_public', '/images/b.png')];
    const { photos } = await getAdminVehicle(ID, storage);
    expect(photos).toEqual([
      { id: 'i1', isCover: true, url: 'https://r2.exemplo/drafts/v/1.jpg?assinatura=x' },
      { id: 'i2', isCover: false, url: '/images/b.png' },
    ]);
  });

  it('falha ao assinar uma foto vira espaço vazio, não derruba a tela', async () => {
    storage.signedReadUrl.mockRejectedValueOnce(new Error('segredo'));
    stub.imageRows = [image('i1', 'r2', 'drafts/v/1.jpg', true), image('i2', 'r2', 'drafts/v/2.jpg')];
    const { photos } = await getAdminVehicle(ID, storage);
    expect(photos.map((photo) => photo.url)).toEqual([null, 'https://r2.exemplo/drafts/v/2.jpg?assinatura=x']);
  });

  it('sem leitura assinada disponível, a foto em r2 vira espaço vazio', async () => {
    stub.imageRows = [image('i1', 'r2', 'drafts/v/1.jpg', true)];
    const { photos } = await getAdminVehicle(ID, { put: vi.fn(), delete: vi.fn() });
    expect(photos).toEqual([{ id: 'i1', isCover: true, url: null }]);
  });

  it('veículo inexistente é erro de não encontrado, não tela vazia', async () => {
    stub.vehicleRows = [];
    await expect(getAdminVehicle(ID, storage)).rejects.toBeInstanceOf(VehicleNotFoundError);
  });

  it('identificador malformado é recusado antes de qualquer consulta', async () => {
    await expect(getAdminVehicle('nao-e-uuid', storage)).rejects.toThrow();
    expect(stub.queries).toBe(0);
  });

  it('recusa quem não tem permissão administrativa', async () => {
    stub.denied = true;
    await expect(getAdminVehicle(ID, storage)).rejects.toThrow('Acesso negado');
    expect(stub.queries).toBe(0);
  });
});
