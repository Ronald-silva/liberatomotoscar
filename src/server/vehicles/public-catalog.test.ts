import { describe, expect, it } from 'vitest';
import { toCatalogVehicle } from './public-catalog';

describe('catálogo público', () => {
  it('converte centavos sem mudar o estado e usa a foto do anúncio', () => {
    const listing = {
      id: 'test', slug: 'moto-teste', type: 'motorcycle' as const,
      brand: 'Honda', model: 'CG 160', version: null,
      year: 2024, mileageKm: 1200, color: 'Preta', priceCents: 1850050,
      description: 'Moto de teste', status: 'reserved' as const,
      publishedAt: new Date(), image: 'https://example.invalid/foto.jpg',
    };
    const result = toCatalogVehicle(listing);
    expect(result).toMatchObject({
      slug: 'moto-teste', title: 'Honda CG 160', category: 'moto',
      priceBRL: 18500.5, availability: 'reservado', image: listing.image,
      condition: 'Não informada',
    });
  });
});
