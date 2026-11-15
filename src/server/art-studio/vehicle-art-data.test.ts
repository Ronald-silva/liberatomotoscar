import { describe, expect, it } from 'vitest';
import { publishRequirements } from '@/server/vehicles/validation';
import { artExportProblem, hasPublicPage } from './policy';

const vehicle = { status: 'published', brand: 'Honda', model: 'CG 160', year: 2024, priceCents: 1850000 };
const photos = [{ id: 'photo-1' }];

describe('liberação de exportação da arte', () => {
  it('aceita anúncio publicado, reservado e vendido com dados completos', () => {
    for (const status of ['published', 'reserved', 'sold']) {
      expect(artExportProblem({ vehicle: { ...vehicle, status }, photos })).toBeNull();
    }
  });

  it('impede quando falta um dado do cadastro, dizendo qual', () => {
    expect(artExportProblem({ vehicle: { ...vehicle, priceCents: null }, photos })).toMatch(/preço/);
    expect(artExportProblem({ vehicle: { ...vehicle, brand: null }, photos })).toMatch(/marca/);
    expect(artExportProblem({ vehicle: { ...vehicle, model: null }, photos })).toMatch(/modelo/);
    expect(artExportProblem({ vehicle, photos: [] })).toMatch(/foto/);
  });

  it('lista tudo que falta de uma vez, para a pessoa não descobrir um campo por vez', () => {
    const problema = artExportProblem({ vehicle: { ...vehicle, brand: null, priceCents: null }, photos: [] });
    expect(problema).toMatch(/marca/);
    expect(problema).toMatch(/preço/);
    expect(problema).toMatch(/foto/);
  });

  /**
   * As duas regressões que esta fase veio fechar. Cada uma era um caminho que o painel aceitava
   * e o estúdio recusava depois.
   */
  it('não exige ano: o cadastro o trata como opcional e o checklist nunca o pediu', () => {
    expect(artExportProblem({ vehicle: { ...vehicle, year: null }, photos })).toBeNull();
  });

  it('libera rascunho completo, para a arte ser vista antes de publicar', () => {
    expect(artExportProblem({ vehicle: { ...vehicle, status: 'draft' }, photos })).toBeNull();
    expect(artExportProblem({ vehicle: { ...vehicle, status: 'draft', year: null }, photos })).toBeNull();
  });

  it('é a mesma regra da publicação, campo por campo', () => {
    const casos = [
      { ...vehicle, status: 'draft' },
      { ...vehicle, status: 'draft', year: null },
      { ...vehicle, brand: null },
      { ...vehicle, model: null },
      { ...vehicle, priceCents: null },
      { ...vehicle, priceCents: 0 },
    ];
    for (const caso of casos) {
      for (const quantidadeDeFotos of [0, 1]) {
        const fotos = photos.slice(0, quantidadeDeFotos);
        const publicavel = publishRequirements(caso, fotos.length).every((item) => item.done);
        const arte = artExportProblem({ vehicle: caso, photos: fotos }) === null;
        expect(arte, JSON.stringify({ caso, quantidadeDeFotos })).toBe(publicavel);
      }
    }
  });
});

describe('endereço público do anúncio', () => {
  it('existe só nas situações que a vitrine atende', () => {
    for (const status of ['published', 'reserved', 'sold']) expect(hasPublicPage(status)).toBe(true);
    for (const status of ['draft', 'archived', 'discarded']) expect(hasPublicPage(status)).toBe(false);
  });
});
