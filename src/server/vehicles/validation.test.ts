import { describe, expect, it } from 'vitest';
import { allowedStatusTransitions, assertPublishable, assertStatusTransition, detailsInput, draftInput, priceInput, vehicleStatus } from './validation';

describe('validação comercial', () => {
  it('rejeita preço negativo, fracionário e acima do inteiro PostgreSQL', () => {
    for (const value of [-1, 1.5, 2_147_483_648, NaN]) expect(priceInput.safeParse(value).success).toBe(false);
    expect(priceInput.parse(0)).toBe(0); // só rascunho pode ter zero
  });
  it('rejeita tipo, estado, ano e quilometragem inválidos', () => {
    expect(draftInput.safeParse({ type: 'truck' }).success).toBe(false);
    expect(vehicleStatus.safeParse('available').success).toBe(false);
    expect(detailsInput.safeParse({ year: 1800 }).success).toBe(false);
    expect(detailsInput.safeParse({ year: 2101 }).success).toBe(false);
    expect(detailsInput.safeParse({ mileageKm: -1 }).success).toBe(false);
  });
  it('aceita campos opcionais e rejeita campos extras', () => {
    expect(detailsInput.parse({ year: null, mileageKm: null })).toEqual({ year: null, mileageKm: null });
    expect(detailsInput.safeParse({ priceCents: 1 }).success).toBe(false);
  });
  it('bloqueia publicação sem dados mínimos ou foto', () => {
    expect(() => assertPublishable({ brand: 'Honda', model: 'Pop', priceCents: 100 }, 0)).toThrow();
    expect(() => assertPublishable({ brand: '', model: 'Pop', priceCents: 100 }, 1)).toThrow();
    expect(() => assertPublishable({ brand: 'Honda', model: 'Pop', priceCents: 0 }, 1)).toThrow();
    expect(() => assertPublishable({ brand: 'Honda', model: 'Pop', priceCents: 100 }, 1)).not.toThrow();
  });
  it('aplica todas as transições permitidas e rejeita as demais, inclusive o mesmo estado', () => {
    for (const current of vehicleStatus.options) {
      for (const next of vehicleStatus.options) {
        if ((allowedStatusTransitions[current] as readonly string[]).includes(next)) {
          expect(() => assertStatusTransition(current, next)).not.toThrow();
        } else {
          expect(() => assertStatusTransition(current, next)).toThrow('Mudança de estado não permitida.');
        }
      }
    }
  });
});
