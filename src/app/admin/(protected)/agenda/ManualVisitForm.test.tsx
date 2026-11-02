// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManualVisitForm } from './ManualVisitForm';

const { marcarVisita, refresh } = vi.hoisted(() => ({ marcarVisita: vi.fn(), refresh: vi.fn() }));
vi.mock('./actions', () => ({ marcarVisita }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const vehicles = [{ id: 'car1', label: 'Honda CG 160' }, { id: 'car2', label: 'Yamaha Fazer 250' }];
beforeEach(() => { marcarVisita.mockReset(); refresh.mockReset(); });
afterEach(cleanup);

function fill() {
  fireEvent.change(screen.getByLabelText('Nome do cliente'), { target: { value: 'Ana Souza' } });
  fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '85999990000' } });
  fireEvent.change(screen.getByLabelText('Dia'), { target: { value: '2026-11-07' } });
  fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '14:00' } });
}

it('pede nome, telefone, dia e hora, e permite escolher veiculo do estoque', () => {
  render(<ManualVisitForm vehicles={vehicles} />);
  for (const label of ['Nome do cliente', 'Telefone com DDD', 'Dia', 'Hora']) {
    expect((screen.getByLabelText(label) as HTMLInputElement).required).toBe(true);
  }
  const select = screen.getByLabelText('Veículo') as HTMLSelectElement;
  expect([...select.options].map((o) => o.textContent)).toEqual(['Sem veículo definido', 'Honda CG 160', 'Yamaha Fazer 250']);
  // O horario de funcionamento vem da politica da loja, nao de um numero escrito aqui.
  expect(screen.getByText(/Segunda a sábado, 9h às 18h/)).toBeTruthy();
});

it('envia os campos e, gravada, limpa o formulario e confirma ali mesmo', async () => {
  marcarVisita.mockResolvedValue({ message: 'Visita marcada.', ok: true });
  render(<ManualVisitForm vehicles={vehicles} />);
  fill();
  fireEvent.change(screen.getByLabelText('Veículo'), { target: { value: 'car2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Marcar visita' }));
  await waitFor(() => expect(marcarVisita).toHaveBeenCalledTimes(1));
  const data = marcarVisita.mock.calls[0][1] as FormData;
  expect(Object.fromEntries(data)).toEqual({
    customerName: 'Ana Souza', customerPhone: '85999990000', data: '2026-11-07', hora: '14:00', vehicleId: 'car2',
  });
  expect((await screen.findByRole('status')).textContent).toContain('Visita marcada.');
  expect((screen.getByLabelText('Nome do cliente') as HTMLInputElement).value).toBe('');
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('mostra o motivo quando a gravacao falha e nao apaga o que foi digitado', async () => {
  marcarVisita.mockResolvedValue({ message: 'Esse horário está fora do funcionamento da loja.', ok: false });
  render(<ManualVisitForm vehicles={vehicles} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Marcar visita' }));
  expect((await screen.findByRole('alert')).textContent).toContain('fora do funcionamento');
  expect((screen.getByLabelText('Nome do cliente') as HTMLInputElement).value).toBe('Ana Souza');
  expect(refresh).not.toHaveBeenCalled();
});

it('se a chamada ao servidor cair, ainda explica em vez de ficar calado', async () => {
  marcarVisita.mockRejectedValue(new Error('rede'));
  render(<ManualVisitForm vehicles={vehicles} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Marcar visita' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/Tente de novo/);
});

it('enquanto grava, o botao avisa e nao aceita segundo toque', async () => {
  let release!: (v: unknown) => void;
  marcarVisita.mockReturnValue(new Promise((resolve) => { release = resolve; }));
  render(<ManualVisitForm vehicles={vehicles} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Marcar visita' }));
  const busy = await screen.findByRole('button', { name: 'Marcando...' });
  expect((busy as HTMLButtonElement).disabled).toBe(true);
  release({ message: 'Visita marcada.', ok: true });
  await screen.findByRole('status');
});
