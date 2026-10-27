// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { InventoryVehicle } from '@/data/inventory-vehicles';
import { InventoryDetail } from './InventoryDetail';

const vehicle: InventoryVehicle = {
  slug: 'honda-cg-teste', sourceStatus: 'confirmed_in_listing', brand: 'Honda', model: 'CG',
  title: 'Honda CG', priceBRL: 10000, category: 'moto', categoryLabel: 'Moto', color: 'Preta',
  condition: 'Seminovo', image: '/images/fachada.png', imageAlt: 'Honda CG',
  shortDescription: 'Moto anunciada.', description: 'Moto para teste.', highlights: [], pendingVerification: [],
};

afterEach(cleanup);

it('informa a venda no slug antigo e remove o contato para compra', () => {
  render(<InventoryDetail vehicle={{ ...vehicle, availability: 'vendido' }} vehicles={[]} images={[]} />);
  expect(screen.getByText(/Vendido · anúncio mantido para consulta histórica/)).toBeTruthy();
  expect(screen.getByText('Preço anunciado antes da venda.')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Este veículo foi vendido.' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Consultar veículo' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Consultar reserva' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Ver outros veículos' })).toBeTruthy();
});

it('diferencia reserva temporária e permite consultar a loja', () => {
  render(<InventoryDetail vehicle={{ ...vehicle, availability: 'reservado' }} vehicles={[]} images={[]} />);
  expect(screen.getByText(/Reservado · indisponível no momento/)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Veículo reservado.' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Consultar reserva' })).toBeTruthy();
});
