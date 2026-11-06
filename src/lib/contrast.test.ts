import { expect, it } from 'vitest';
import { contrastRatio } from './contrast';

it('branco sobre preto dá o máximo da escala, 21', () => {
  expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
});

it('a razão não depende da ordem das duas cores', () => {
  expect(contrastRatio('#d8202f', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#d8202f'), 6);
});

it('cor contra ela mesma dá 1', () => {
  expect(contrastRatio('#0a0e13', '#0a0e13')).toBeCloseTo(1, 6);
});
