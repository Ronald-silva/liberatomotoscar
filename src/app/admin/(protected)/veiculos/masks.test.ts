import { describe, expect, it } from 'vitest';
import { groupThousands, maskMileage, maskPrice, priceToText, yearOptions } from './masks';

describe('máscara de quilometragem', () => {
  it.each([
    ['12500', '12.500'],
    ['12.500', '12.500'],
    ['125', '125'],
    ['1234567', '1.234.567'],
    ['', ''],
  ])('formata "%s" como "%s"', (typed, expected) => {
    expect(maskMileage(typed)).toBe(expected);
  });

  it('descarta o que não é dígito em vez de recusar o toque', () => {
    expect(maskMileage('12a5b00')).toBe('12.500');
    expect(maskMileage('abc')).toBe('');
  });

  it('não deixa zero à esquerda nem valor absurdo', () => {
    expect(maskMileage('000125')).toBe('125');
    expect(maskMileage('0')).toBe('0');
    expect(maskMileage('123456789012')).toBe('1.234.567');
  });
});

describe('máscara de preço', () => {
  it.each([
    ['18500', '18.500'],
    ['R$ 18.500', '18.500'],
    ['18.500', '18.500'],
    ['1850000', '1.850.000'],
    ['', ''],
  ])('formata "%s" como "%s"', (typed, expected) => {
    expect(maskPrice(typed)).toBe(expected);
  });

  // Preço vindo do catálogo antigo pode ter centavos; apagar a vírgula multiplicaria por cem.
  it('preserva os centavos quando a vírgula já existe', () => {
    expect(maskPrice('18.500,50')).toBe('18.500,50');
    expect(maskPrice('18500,5')).toBe('18.500,5');
    expect(maskPrice('18500,999')).toBe('18.500,99');
    expect(maskPrice(',50')).toBe('0,50');
  });

  it('respeita o teto que o servidor aceita', () => {
    expect(maskPrice('214748364')).toBe('21.474.836');
    expect(maskPrice('21.474.836,47')).toBe('21.474.836,47');
  });
});

describe('preço salvo virando texto do campo', () => {
  it.each([
    [null, ''],
    [1850000, '18.500'],
    [1850050, '18.500,50'],
    [1850005, '18.500,05'],
    [100, '1'],
    [0, '0'],
  ])('mostra %s como "%s"', (cents, expected) => {
    expect(priceToText(cents)).toBe(expected);
  });

  it('o que sai do campo volta igual pela máscara', () => {
    for (const cents of [1850000, 1850050, 100, 0]) {
      expect(maskPrice(priceToText(cents))).toBe(priceToText(cents));
    }
  });
});

describe('lista de anos', () => {
  it('começa no ano seguinte e desce, porque ano-modelo adiantado é comum', () => {
    const years = yearOptions(2026, 3);
    expect(years).toEqual([2027, 2026, 2025, 2024, 2023]);
  });

  it('cobre a faixa pedida e fica dentro do que o servidor aceita', () => {
    const years = yearOptions(2026);
    expect(years[0]).toBe(2027);
    expect(years.at(-1)).toBe(1981);
    expect(years.every((year) => year >= 1900 && year <= 2100)).toBe(true);
  });
});

describe('agrupamento de milhar', () => {
  it.each([['1', '1'], ['12', '12'], ['123', '123'], ['1234', '1.234'], ['1234567', '1.234.567']])(
    'agrupa "%s" como "%s"', (digits, expected) => {
      expect(groupThousands(digits)).toBe(expected);
    });
});
