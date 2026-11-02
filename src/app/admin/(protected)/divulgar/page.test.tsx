// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
vi.mock('@/server/vehicles/service', () => ({ listAdminVehiclesWithCover: (o: unknown) => list(o) }));

import DivulgarPage, { metadata } from './page';

afterEach(() => { cleanup(); list.mockReset(); });

const vehicle = (over: Record<string, unknown> = {}) => ({ id: 'v1', status: 'published', brand: 'Honda', model: 'CG 160',
  year: 2022, priceCents: 1590000, coverUrl: '/capa.jpg', ...over });

describe('divulgar', () => {
  it('nao e indexavel', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('lista so os publicados, com atalho para o estudio de arte', async () => {
    list.mockResolvedValue([vehicle()]);
    render(await DivulgarPage());
    expect(list).toHaveBeenCalledWith({ status: 'published' });
    expect(screen.getByRole('link', { name: /Criar arte.*Honda CG 160/ }).getAttribute('href')).toBe('/admin/veiculos/v1/arte');
  });

  it('explica o que fazer quando nao ha veiculo publicado', async () => {
    list.mockResolvedValue([]);
    render(await DivulgarPage());
    expect(screen.getByText(/Nenhum veículo publicado/)).toBeTruthy();
    expect(screen.getByText(/só é criada para veículo publicado/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver o estoque' }).getAttribute('href')).toBe('/admin');
    expect(screen.queryByRole('link', { name: /Criar arte/ })).toBeNull();
  });

  it('veiculo publicado com cadastro incompleto aponta para o cadastro, nao para um caminho que falha', async () => {
    list.mockResolvedValue([vehicle({ priceCents: null })]);
    render(await DivulgarPage());
    expect(screen.queryByRole('link', { name: /Criar arte/ })).toBeNull();
    expect(screen.getByText(/Complete marca, modelo, ano e preço/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Completar cadastro.*Honda CG 160/ }).getAttribute('href')).toBe('/admin/veiculos/v1');
  });

  it('se o estoque nao carrega, diz isso em vez de parecer vazio', async () => {
    list.mockRejectedValue(new Error('db'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(await DivulgarPage());
    expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível carregar/);
    expect(screen.queryByText(/Nenhum veículo publicado/)).toBeNull();
  });
});
