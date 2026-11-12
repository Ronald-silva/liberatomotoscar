// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// A action de verdade (com a trava de confirmacao) roda; so a gravacao e a sessao sao trocadas.
const mocks = vi.hoisted(() => ({ setWhatsappMode: vi.fn() }));
vi.mock('@/server/attendance/settings', () => ({ setWhatsappMode: mocks.setWhatsappMode }));
vi.mock('@/server/attendance/inbox', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/authz', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/server/whatsapp/test-number', () => ({}));

import { whatsappModes } from '@/server/attendance/mode-labels';
import { WhatsappModeForm } from './WhatsappModeForm';

beforeEach(() => mocks.setWhatsappMode.mockReset());
afterEach(cleanup);

const label = (value: string) => whatsappModes.find((m) => m.value === value)!.label;

it('lista apenas modos implementados, com descrições e atual marcado', () => {
  render(<WhatsappModeForm mode="ai" version={3} />);
  expect(whatsappModes.map((m) => m.value)).toEqual(['ai', 'disabled']);
  expect(screen.queryByRole('radio', { name: /Atendimento por menu/ })).toBeNull();
  for (const m of whatsappModes) {
    expect(screen.getByRole('radio', { name: new RegExp(m.label) })).toBeTruthy();
    expect(screen.getByText(m.description)).toBeTruthy();
  }
  expect((screen.getByRole('radio', { name: new RegExp(label('ai')) }) as HTMLInputElement).checked).toBe(true);
});

it('escolher um modo nao grava nem manda nada: so aparece a confirmacao, que diz o que muda', () => {
  render(<WhatsappModeForm mode="ai" version={3} />);
  expect(screen.queryByRole('button', { name: /Sim, trocar/ })).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(label('disabled')) }));
  expect(mocks.setWhatsappMode).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: `Sim, trocar para ${label('disabled')}` });
  expect(confirm).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain(label('disabled'));
});

it('nao existe campo confirm no formulario: ele so nasce do toque no botao de confirmar', () => {
  const { container } = render(<WhatsappModeForm mode="ai" version={3} />);
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(label('disabled')) }));
  // Um input escondido preso ao radio faria a trava virar enfeite (o antigo confirm=yes).
  expect(container.querySelector('input[name="confirm"]')).toBeNull();
  const form = container.querySelector('form') as HTMLFormElement;
  const sent = new FormData(form);
  expect(sent.has('confirm')).toBe(false);
});

it('enter num radio nao confirma: os radios ficam fora do formulario', () => {
  const { container } = render(<WhatsappModeForm mode="ai" version={3} />);
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(label('disabled')) }));
  const form = container.querySelector('form') as HTMLFormElement;
  expect(form.querySelector('input[type="radio"]')).toBeNull();
});

it('tocar em confirmar manda confirm igual ao modo escolhido e mostra o resultado ali', async () => {
  mocks.setWhatsappMode.mockResolvedValue({ mode: 'disabled', version: 4 });
  render(<WhatsappModeForm mode="ai" version={3} />);
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(label('disabled')) }));
  fireEvent.click(screen.getByRole('button', { name: `Sim, trocar para ${label('disabled')}` }));
  await waitFor(() => expect(mocks.setWhatsappMode).toHaveBeenCalledWith('disabled', 3));
  expect((await screen.findByRole('status')).textContent).toContain('Modo da Dayse atualizado.');
  expect(screen.queryByRole('button', { name: /Sim, trocar/ })).toBeNull();
  expect((screen.getByRole('radio', { name: new RegExp(label('disabled')) }) as HTMLInputElement).checked).toBe(true);
});

it('voltar ao modo atual desfaz a escolha sem pedir nada', () => {
  render(<WhatsappModeForm mode="ai" version={3} />);
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(label('disabled')) }));
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(label('ai')) }));
  expect(screen.queryByRole('button', { name: /Sim, trocar/ })).toBeNull();
});
