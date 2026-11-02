// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VisitCard, type VisitView } from './VisitCard';

const { cancelarVisita, corrigirVisita, refresh } = vi.hoisted(() => ({ cancelarVisita: vi.fn(), corrigirVisita: vi.fn(), refresh: vi.fn() }));
vi.mock('./actions', () => ({ cancelarVisita, corrigirVisita }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const visit = (extra: Partial<VisitView> = {}): VisitView => ({
  id: 'v1', scheduledFor: '2026-11-07T17:00:00.000Z', passou: false, customerName: 'Ana Souza',
  customerPhone: '(85) 99999-0000', quote: 'ACHO QUE SABADO DEPOIS DDO ALMOCO', conversationId: 'c1', vehicleId: 'car1',
  vehicle: { label: 'Honda CG 160', year: 2022, price: 'R$ 14.500,00' }, ...extra,
});
const vehicles = [{ id: 'car1', label: 'Honda CG 160' }, { id: 'car2', label: 'Yamaha Fazer 250' }];

beforeEach(() => { cancelarVisita.mockReset(); corrigirVisita.mockReset(); refresh.mockReset(); });
afterEach(cleanup);

it('mostra hora, nome, telefone, veiculo e a frase do cliente', () => {
  render(<VisitCard visit={visit()} vehicles={vehicles} />);
  // 17:00 UTC é 14:00 na loja.
  expect(screen.getByText('14:00')).toBeTruthy();
  expect(screen.getByText('Ana Souza')).toBeTruthy();
  expect(screen.getByText('(85) 99999-0000')).toBeTruthy();
  expect(screen.getByText(/Honda CG 160/)).toBeTruthy();
  expect(screen.getByText(/2022/)).toBeTruthy();
  expect(screen.getByText(/R\$ 14\.500,00/)).toBeTruthy();
  // O cliente escreveu em caixa alta; o cartao nao grita.
  expect(screen.getByText(/Acho que sabado depois ddo almoco/)).toBeTruthy();
  expect(screen.queryByText(/ACHO QUE SABADO/)).toBeNull();
});

it('sem veiculo vinculado, o cartao nao inventa veiculo', () => {
  render(<VisitCard visit={visit({ vehicle: null, vehicleId: null })} vehicles={vehicles} />);
  expect(screen.queryByText(/Honda|Yamaha|R\$/)).toBeNull();
  expect(screen.getByText('Veículo não definido')).toBeTruthy();
});

it('sem telefone, nao oferece o botao de WhatsApp', () => {
  const { rerender } = render(<VisitCard visit={visit({ customerPhone: null })} vehicles={vehicles} />);
  expect(screen.queryByRole('link', { name: /WhatsApp/ })).toBeNull();
  rerender(<VisitCard visit={visit()} vehicles={vehicles} />);
  expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toBe('https://wa.me/5585999990000');
});

it('so oferece Ver conversa quando a visita veio de uma conversa', () => {
  const { rerender } = render(<VisitCard visit={visit()} vehicles={vehicles} />);
  expect(screen.getByRole('link', { name: 'Ver conversa' }).getAttribute('href')).toBe('/admin/atendimento?conversa=c1');
  rerender(<VisitCard visit={visit({ conversationId: null })} vehicles={vehicles} />);
  expect(screen.queryByRole('link', { name: 'Ver conversa' })).toBeNull();
});

it('visita de hoje que ja passou aparece apagada e dita, nao so pela cor', () => {
  const { container, rerender } = render(<VisitCard visit={visit({ passou: true })} vehicles={vehicles} />);
  expect(screen.getByText('Já passou')).toBeTruthy();
  expect(container.querySelector('[data-passou="true"]')).not.toBeNull();
  rerender(<VisitCard visit={visit()} vehicles={vehicles} />);
  expect(screen.queryByText('Já passou')).toBeNull();
  expect(container.querySelector('[data-passou="true"]')).toBeNull();
});

it('combinado sem hora certa diz isso em vez de inventar uma hora', () => {
  render(<VisitCard visit={visit({ scheduledFor: null })} vehicles={vehicles} />);
  expect(screen.getByText('Sem hora certa')).toBeTruthy();
});

it('cancelar pede confirmacao em linha antes de remover', async () => {
  cancelarVisita.mockResolvedValue({ message: 'Visita cancelada.', ok: true });
  render(<VisitCard visit={visit()} vehicles={vehicles} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar visita' }));
  expect(cancelarVisita).not.toHaveBeenCalled();
  expect(screen.getByText(/Cancelar a visita de Ana Souza\?/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
  await waitFor(() => expect(cancelarVisita).toHaveBeenCalledTimes(1));
  expect((cancelarVisita.mock.calls[0][1] as FormData).get('id')).toBe('v1');
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

it('desistir de cancelar nao remove nada', () => {
  render(<VisitCard visit={visit()} vehicles={vehicles} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar visita' }));
  fireEvent.click(screen.getByRole('button', { name: 'Manter visita' }));
  expect(cancelarVisita).not.toHaveBeenCalled();
  expect(screen.queryByText(/Cancelar a visita de/)).toBeNull();
});

it('falha ao cancelar explica o motivo ao lado do botao e mantem a confirmacao', async () => {
  cancelarVisita.mockResolvedValue({ message: 'Não foi possível salvar agora. Tente de novo.', ok: false });
  render(<VisitCard visit={visit()} vehicles={vehicles} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar visita' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível salvar agora');
  expect(refresh).not.toHaveBeenCalled();
});

it('corrigir abre o formulario com o horario atual e envia dia, hora e veiculo', async () => {
  corrigirVisita.mockResolvedValue({ message: 'Visita corrigida.', ok: true });
  render(<VisitCard visit={visit()} vehicles={vehicles} />);
  fireEvent.click(screen.getByRole('button', { name: 'Corrigir' }));
  expect((screen.getByLabelText('Dia') as HTMLInputElement).value).toBe('2026-11-07');
  expect((screen.getByLabelText('Hora') as HTMLInputElement).value).toBe('14:00');
  fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '10:30' } });
  fireEvent.change(screen.getByLabelText('Veículo'), { target: { value: 'car2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }));
  await waitFor(() => expect(corrigirVisita).toHaveBeenCalledTimes(1));
  const data = corrigirVisita.mock.calls[0][1] as FormData;
  expect([data.get('id'), data.get('data'), data.get('hora'), data.get('vehicleId')]).toEqual(['v1', '2026-11-07', '10:30', 'car2']);
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

it('falha ao corrigir mostra o motivo e preserva o que foi digitado', async () => {
  corrigirVisita.mockResolvedValue({ message: 'Esse horário está fora do funcionamento da loja.', ok: false });
  render(<VisitCard visit={visit()} vehicles={vehicles} />);
  fireEvent.click(screen.getByRole('button', { name: 'Corrigir' }));
  fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '19:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }));
  expect((await screen.findByRole('alert')).textContent).toContain('fora do funcionamento');
  expect((screen.getByLabelText('Hora') as HTMLInputElement).value).toBe('19:00');
});
