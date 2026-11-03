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
