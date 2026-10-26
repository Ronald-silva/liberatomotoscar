import { describe, expect, it } from 'vitest';
import { allowedStatusTransitions, assertPublishable, publishRequirements, assertStatusTransition, detailsInput, draftInput, isDiscardable, priceInput, vehicleStatus } from './validation';

describe('validação comercial', () => {
  it('aceita discarded como estado válido', () => {
    expect(vehicleStatus.parse('discarded')).toBe('discarded');
  });
  it('não oferece discarded como transição de nenhum estado', () => {
    for (const targets of Object.values(allowedStatusTransitions)) {
      expect(targets).not.toContain('discarded');
    }
  });
  it('não permite transição a partir de discarded', () => {
    expect(allowedStatusTransitions.discarded).toEqual([]);
    expect(() => assertStatusTransition('discarded', 'draft')).toThrow('Mudança de estado não permitida.');
  });
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

// A tela de edição mostra esta lista item por item. Se ela e assertPublishable discordassem, a
// tela prometeria uma publicação que o serviço recusa.
describe('requisitos de publicação', () => {
  const complete = { brand: 'Honda', model: 'Pop', priceCents: 100 };

  it('nomeia os quatro requisitos, na ordem da tela', () => {
    expect(publishRequirements(complete, 1).map((item) => item.label))
      .toEqual(['Marca', 'Modelo', 'Preço', 'Pelo menos uma foto']);
  });

  it('marca tudo pronto quando o anúncio está completo', () => {
    expect(publishRequirements(complete, 2).every((item) => item.done)).toBe(true);
  });

  it.each([
    [{ ...complete, brand: null }, 1, 'Marca'],
    [{ ...complete, brand: '   ' }, 1, 'Marca'],
    [{ ...complete, model: null }, 1, 'Modelo'],
    [{ ...complete, priceCents: 0 }, 1, 'Preço'],
    [{ ...complete, priceCents: null }, 1, 'Preço'],
    [complete, 0, 'Pelo menos uma foto'],
  ])('aponta %j com %i foto(s) como faltando "%s"', (vehicle, photos, label) => {
    const missing = publishRequirements(vehicle, photos).filter((item) => !item.done).map((item) => item.label);
    expect(missing).toEqual([label]);
  });

  it('concorda com assertPublishable em todo caso testado', () => {
    const cases: [{ brand: string | null; model: string | null; priceCents: number | null }, number][] = [
      [complete, 1], [complete, 0], [{ ...complete, brand: null }, 1],
      [{ ...complete, model: '' }, 3], [{ ...complete, priceCents: 0 }, 1], [{ brand: null, model: null, priceCents: null }, 0],
    ];
    for (const [vehicle, photos] of cases) {
      const faltando = publishRequirements(vehicle, photos).some((item) => !item.done);
      const recusa = (() => { try { assertPublishable(vehicle, photos); return false; } catch { return true; } })();
      expect(recusa).toBe(faltando);
    }
  });

  it('só permite excluir rascunho que nunca foi publicado', () => {
    expect(isDiscardable({ status: 'draft', publishedAt: null })).toBe(true);
    expect(isDiscardable({ status: 'draft', publishedAt: new Date() })).toBe(false);
    expect(isDiscardable({ status: 'published', publishedAt: new Date() })).toBe(false);
    expect(isDiscardable({ status: 'archived', publishedAt: null })).toBe(false);
  });
});
