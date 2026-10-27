import { describe, expect, it } from 'vitest';
import { artExportProblem } from './policy';

const vehicle = { status: 'published', brand: 'Honda', model: 'CG 160', year: 2024, priceCents: 1850000 };
const photos = [{ id: 'photo-1' }];

describe('liberação de exportação da arte', () => {
  it('aceita anúncio publicado, reservado e vendido com dados completos', () => {
    for (const status of ['published', 'reserved', 'sold']) {
      expect(artExportProblem({ vehicle: { ...vehicle, status }, photos })).toBeNull();
    }
  });

  it('impede rascunho, dados incompletos e foto ausente', () => {
    expect(artExportProblem({ vehicle: { ...vehicle, status: 'draft' }, photos })).toMatch(/Publique/);
    expect(artExportProblem({ vehicle: { ...vehicle, priceCents: null }, photos })).toMatch(/preço/);
    expect(artExportProblem({ vehicle, photos: [] })).toMatch(/foto/);
  });
});
