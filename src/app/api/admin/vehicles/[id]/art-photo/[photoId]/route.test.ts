import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getArtVehicleData: vi.fn(), read: vi.fn() }));
vi.mock('@/server/authz', () => ({ AccessDeniedError: class AccessDeniedError extends Error {} }));
vi.mock('@/server/art-studio/vehicle-art-data', () => ({ getArtVehicleData: mocks.getArtVehicleData }));
vi.mock('@/server/storage/r2', () => ({ createR2Storage: () => ({ read: mocks.read }) }));

import { GET } from './route';

const context = { params: Promise.resolve({ id: 'veiculo', photoId: 'foto' }) };
const request = new Request('https://example.com/api/admin/vehicles/veiculo/art-photo/foto');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getArtVehicleData.mockResolvedValue({ photos: [{ id: 'foto', storageKey: 'chave',
    storageProvider: 'r2', mimeType: 'image/jpeg' }] });
});

describe('foto da arte', () => {
  it('recebe o arquivo inteiro antes de responder ao celular', async () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    mocks.read.mockResolvedValue(bytes);
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('devolve 502 quando o R2 falha, sem entregar uma imagem parcial', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.read.mockRejectedValue(new TypeError('network interrupted'));
    const response = await GET(request, context);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('');
    expect(log).toHaveBeenCalledWith('Falha ao ler foto da arte no R2', { reason: 'TypeError' });
    log.mockRestore();
  });
});
