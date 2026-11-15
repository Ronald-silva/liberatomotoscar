// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Hero } from './Hero';

afterEach(cleanup);

/** Texto visível do link, como o usuário de comando de voz o lê na tela. */
const VISIVEL = 'DESLIZE PARA EXPLORAR';

it('o nome acessível do link contém o texto visível (WCAG 2.5.3)', () => {
  render(<Hero />);
  const link = screen.getByRole('link', { name: /deslize para explorar/i });
  expect(link.textContent?.toUpperCase()).toContain(VISIVEL);
  const nomeAcessivel = link.getAttribute('aria-label') ?? link.textContent ?? '';
  expect(nomeAcessivel.toLowerCase()).toContain(VISIVEL.toLowerCase());
  expect(link).toHaveProperty('hash', '#vitrine');
});

it('o link continua levando à vitrine e o ícone segue fora do nome acessível', () => {
  render(<Hero />);
  const link = screen.getByRole('link', { name: /deslize para explorar/i });
  expect(link.getAttribute('href')).toBe('#vitrine');
  expect(link.querySelector('[aria-hidden="true"]')).not.toBeNull();
});
