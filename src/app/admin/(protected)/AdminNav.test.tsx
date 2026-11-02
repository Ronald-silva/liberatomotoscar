// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { activeDestination, AdminNav } from './AdminNav';

const nav = vi.hoisted(() => ({ pathname: '/admin' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
afterEach(cleanup);

it('liga cada rota ao destino da barra', () => {
  expect(activeDestination('/admin')).toBe('estoque');
  expect(activeDestination('/admin/veiculos/abc')).toBe('estoque');
  expect(activeDestination('/admin/agenda')).toBe('agenda');
  expect(activeDestination('/admin/divulgar')).toBe('divulgar');
  expect(activeDestination('/admin/atendimento')).toBe('conversas');
});

it('Ajustes nao e destino: nenhuma aba fica marcada', () => {
  expect(activeDestination('/admin/ajustes')).toBeNull();
});

it('marca na barra o destino da rota atual', () => {
  nav.pathname = '/admin/agenda';
  render(<AdminNav counts={{ agenda: 1, conversas: null }} />);
  expect(screen.getByRole('link', { name: /Agenda/ }).getAttribute('aria-current')).toBe('page');
});
