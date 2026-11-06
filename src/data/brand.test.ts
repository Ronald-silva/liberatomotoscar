import { expect, it } from 'vitest';
import { contrastRatio } from '@/lib/contrast';
import { BRAND } from './brand';
import { STORE } from './store';

it('o telefone da arte é o mesmo da loja', () => {
  expect(BRAND.phoneDisplay).toBe(STORE.phoneDisplay);
});

it('o branco sobre o chip atinge o mínimo da WCAG para texto', () => {
  expect(contrastRatio(BRAND.palette.chipInk, BRAND.palette.chip)).toBeGreaterThanOrEqual(4.5);
});

it('a tinta atinge o mínimo da WCAG sobre o véu', () => {
  // O véu é o que torna o texto branco legível sobre foto. Se a ponta opaca dele não aguentar a
  // tinta, nenhuma rampa de opacidade salva o texto — a garantia nasce aqui, na cor.
  expect(contrastRatio(BRAND.palette.ink, BRAND.palette.scrim)).toBeGreaterThanOrEqual(4.5);
});

it('o texto de apoio também passa sobre o véu', () => {
  expect(contrastRatio(BRAND.palette.dim, BRAND.palette.scrim)).toBeGreaterThanOrEqual(4.5);
});
