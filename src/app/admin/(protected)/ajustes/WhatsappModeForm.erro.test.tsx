// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

// Aqui a action é trocada de vez: o que se prova é a tela diante de um erro devolvido, não a trava.
const mocks = vi.hoisted(() => ({ changeWhatsappMode: vi.fn() }));
vi.mock('../atendimento/actions', () => ({ changeWhatsappMode: mocks.changeWhatsappMode }));

import { WhatsappModeForm } from './WhatsappModeForm';

afterEach(cleanup);

it('erro generico: aparece junto ao botao e a confirmacao continua ali (o servidor so grava se a versao ainda vale)', async () => {
  mocks.changeWhatsappMode.mockResolvedValue({ mode: 'ai', version: 3, error: true,
    message: 'Não foi possível alterar o modo. Confira os dados e tente novamente.' });
  render(<WhatsappModeForm mode="ai" version={3} />);
  fireEvent.click(screen.getByRole('radio', { name: /Dayse desligada/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Sim, trocar para Dayse desligada' }));
  await waitFor(() => expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toContain('Não foi possível'));
  expect(screen.getByRole('button', { name: 'Sim, trocar para Dayse desligada' })).toBeTruthy();
});

it('versao velha: nao oferece repetir (falharia de novo), so recarregar', async () => {
  mocks.changeWhatsappMode.mockResolvedValue({ mode: 'ai', version: 3, error: true, stale: true,
    message: 'O modo de atendimento mudou. Atualize a página antes de tentar novamente.' });
  render(<WhatsappModeForm mode="ai" version={3} />);
  fireEvent.click(screen.getByRole('radio', { name: /Dayse desligada/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Sim, trocar para Dayse desligada' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Recarregar a página' })).toBeTruthy());
  expect(screen.queryByRole('button', { name: /Sim, trocar/ })).toBeNull();
  expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toContain('mudou');
});
