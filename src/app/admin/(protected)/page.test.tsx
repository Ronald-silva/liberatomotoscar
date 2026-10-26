// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parseStatusFilter, StatusFilter } from './StatusFilter';

afterEach(cleanup);

const counts = { draft: 2, published: 3, reserved: 1, sold: 0, archived: 4, discarded: 0 };

describe('filtro do estoque', () => {
  it('mapeia o estado da URL e ignora valores desconhecidos', () => {
    expect(parseStatusFilter('rascunho')).toBe('draft');
    expect(parseStatusFilter('publicado')).toBe('published');
    expect(parseStatusFilter('qualquer')).toBeUndefined();
    expect(parseStatusFilter(['rascunho'])).toBeUndefined();
  });

  it('oferece links com contagem e marca o filtro ativo', () => {
    render(<StatusFilter counts={counts} active="draft" />);
    expect(screen.getByRole('link', { name: 'Tudo (10)' }).getAttribute('href')).toBe('/admin');
    expect(screen.getByRole('link', { name: 'Rascunhos (2)' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Publicados (3)' }).getAttribute('href')).toBe('/admin?estado=publicado');
    expect(screen.queryByRole('link', { name: /Descartados/ })).toBeNull();
  });

  it('mostra descartados quando existem e não inventa contagens após falha', () => {
    render(<StatusFilter counts={{ ...counts, discarded: 1 }} active="discarded" />);
    expect(screen.getByRole('link', { name: 'Descartados (1)' }).getAttribute('aria-current')).toBe('page');
    cleanup();
    render(<StatusFilter counts={null} />);
    expect(screen.getByRole('link', { name: 'Tudo' })).toBeTruthy();
    expect(screen.queryByText('(0)')).toBeNull();
  });
});
