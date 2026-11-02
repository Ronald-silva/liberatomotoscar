// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AdminTabBar } from './AdminTabBar';

afterEach(cleanup);

it('mostra os quatro destinos e marca o ativo', () => {
  render(<AdminTabBar active="agenda" counts={{ agenda: 2, conversas: 1 }} />);
  for (const n of ['Estoque', 'Agenda', 'Divulgar', 'Conversas']) {
    expect(screen.getByRole('link', { name: new RegExp(n) })).toBeTruthy();
  }
  expect(screen.getByRole('link', { name: /Agenda/ }).getAttribute('aria-current')).toBe('page');
});

it('so o destino ativo leva aria-current', () => {
  render(<AdminTabBar active="divulgar" counts={{ agenda: 0, conversas: 0 }} />);
  const marcados = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
  expect(marcados.map((a) => a.textContent)).toEqual([expect.stringContaining('Divulgar')]);
});

it('aponta cada destino para a sua rota', () => {
  render(<AdminTabBar active="estoque" counts={{ agenda: null, conversas: null }} />);
  const hrefs = Object.fromEntries(screen.getAllByRole('link').map((a) => [a.textContent?.replace(/\d+|pendentes?/g, '').trim(), a.getAttribute('href')]));
  expect(hrefs).toEqual({ Estoque: '/admin', Agenda: '/admin/agenda', Divulgar: '/admin/divulgar', Conversas: '/admin/atendimento' });
});

it('e uma navegacao nomeada', () => {
  render(<AdminTabBar active="estoque" counts={{ agenda: 0, conversas: 0 }} />);
  expect(screen.getByRole('navigation', { name: 'Seções do painel' })).toBeTruthy();
});

it('renderiza sem numero quando a contagem falhou', () => {
  render(<AdminTabBar active="estoque" counts={{ agenda: null, conversas: null }} />);
  expect(screen.getByRole('link', { name: /Agenda/ }).textContent).not.toMatch(/\d/);
  expect(screen.getByRole('link', { name: /Conversas/ }).textContent).not.toMatch(/\d/);
});

it('mostra o numero quando ha pendencia e some com o zero', () => {
  render(<AdminTabBar active="estoque" counts={{ agenda: 3, conversas: 0 }} />);
  expect(screen.getByRole('link', { name: /Agenda/ }).textContent).toMatch(/3/);
  expect(screen.getByRole('link', { name: /Conversas/ }).textContent).not.toMatch(/\d/);
});

it('lido em voz alta o numero diz o que conta', () => {
  render(<AdminTabBar active="estoque" counts={{ agenda: 3, conversas: 1 }} />);
  expect(screen.getByRole('link', { name: 'Agenda, 3 visitas hoje' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Conversas, 1 aguardando vendedor' })).toBeTruthy();
});
