// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VehicleForms } from './VehicleForms';
import type { VehicleDraft } from './useVehicleDraft';

afterEach(cleanup);

function draft(overrides: Partial<VehicleDraft> = {}): VehicleDraft {
  return {
    fields: { brand: 'Honda', model: 'CG 160', versionName: '', year: '', mileageKm: '', color: '', description: '', price: '18.500' },
    set: vi.fn(), flush: vi.fn(), retry: vi.fn(), saveState: 'idle', message: null, isStale: false,
    missing: [], version: 3, enqueue: vi.fn(), photoAdded: vi.fn(), photoRemoved: vi.fn(), saveBeforeAction: vi.fn(),
    ...overrides,
  };
}

it('mantém os campos, chips e sugestões, sem botão de salvar', () => {
  const state = draft();
  render(<VehicleForms draft={state} type="motorcycle" currentYear={2026} />);
  expect(screen.getByRole('button', { name: 'Honda' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Modelo' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Preço' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'Preço' }), { target: { value: '19000' } });
  expect(state.set).toHaveBeenCalledWith('price', '19.000');
  fireEvent.blur(screen.getByRole('textbox', { name: 'Preço' }));
  expect(state.flush).toHaveBeenCalled();
});

it('preserva o valor após falha, anuncia o erro e oferece nova tentativa', () => {
  const state = draft({ saveState: 'error', message: 'Não foi possível salvar.', fields: { ...draft().fields, price: '19.000' } });
  render(<VehicleForms draft={state} type="motorcycle" currentYear={2026} />);
  expect((screen.getByRole('textbox', { name: 'Preço' }) as HTMLInputElement).value).toBe('19.000');
  expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  expect(screen.getByRole('status').textContent).toContain('Não foi possível salvar.');
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(state.retry).toHaveBeenCalled();
});
