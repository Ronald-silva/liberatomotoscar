import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getArtVehicleData: vi.fn() }));
vi.mock('@/server/art-studio/vehicle-art-data', () => ({
  getArtVehicleData: mocks.getArtVehicleData, artExportProblem: () => null,
}));
vi.mock('@/components/art-studio/ArtEditor', () => ({ ArtEditor: () => null }));

import ArtPage from './page';

it('usa o arquivo público da foto importada ao abrir Criar arte', async () => {
  mocks.getArtVehicleData.mockResolvedValue({
    vehicle: { id: 'v1', versionNumber: 1, status: 'published', brand: 'Volkswagen', model: 'Saveiro',
      version: 'Robust', year: 2024, priceCents: 6_999_900, slug: 'saveiro', type: 'car',
      mileageKm: 0, color: 'Branca' },
    photos: [{ id: 'p1', isCover: true, storageProvider: 'legacy_public',
      storageKey: '/images/volkswagen-saveiro-robust-2024.png' },
    { id: 'p2', isCover: false, storageProvider: 'r2', storageKey: 'drafts/v1/p2.jpg' }],
  });
  const page = await ArtPage({ params: Promise.resolve({ id: 'v1' }) });
  expect(page.props.photos).toEqual([
    { id: 'p1', isCover: true, src: '/images/volkswagen-saveiro-robust-2024.png' },
    { id: 'p2', isCover: false, src: '/api/admin/vehicles/v1/art-photo/p2' },
  ]);
});

it('compõe o título da arte sem repetir o que a versão suja já traz', async () => {
  // Dado real do estoque (§13 do spec): o Lander tem version = "Yamaha xtz Lander 250", e o
  // `join(' ')` de antes punha "Yamaha Lander 250 Yamaha xtz Lander 250" no cabeçalho e na legenda.
  mocks.getArtVehicleData.mockResolvedValue({
    vehicle: { id: 'v2', versionNumber: 3, status: 'published', brand: 'Yamaha', model: 'Lander 250',
      version: 'Yamaha xtz Lander 250', year: 2023, priceCents: 2_530_000, slug: 'lander-250',
      type: 'motorcycle', mileageKm: 23_218, color: 'Vermelho' },
    photos: [],
  });
  const page = await ArtPage({ params: Promise.resolve({ id: 'v2' }) });
  expect(page.props.vehicle.title).toBe('Yamaha Lander 250 XTZ');
});

it('rascunho sem marca nem modelo abre com o título de reserva, não com uma letra solta', async () => {
  mocks.getArtVehicleData.mockResolvedValue({
    vehicle: { id: 'v3', versionNumber: 1, status: 'draft', brand: null, model: null, version: 'x',
      year: null, priceCents: null, slug: 'rascunho', type: 'car', mileageKm: null, color: null },
    photos: [],
  });
  const page = await ArtPage({ params: Promise.resolve({ id: 'v3' }) });
  expect(page.props.vehicle.title).toBe('Veículo sem título');
});
