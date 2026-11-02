// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

// Aqui a action é trocada de vez: o que se prova é a tela diante de um erro devolvido, não a trava.
const mocks = vi.hoisted(() => ({ changeWhatsappMode: vi.fn() }));
vi.mock('../atendimento/actions', () => ({ changeWhatsappMode: mocks.changeWhatsappMode }));

import { WhatsappModeForm } from './WhatsappModeForm';

afterEach(cleanup);

it('versao velha: o erro aparece junto ao botao e a confirmacao continua ali para tentar de novo', async () => {
  mocks.changeWhatsappMode.mockResolvedValue({ mode: 'ai', version: 3, error: true,
    message: 'O modo de atendimento mudou. Atualize a página antes de tentar novamente.' });
  render(<WhatsappModeForm mode="ai" version={3} />);
  fireEvent.click(screen.getByRole('radio', { name: /Atendimento por menu/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Sim, trocar para Atendimento por menu' }));
  await waitFor(() => expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toContain('mudou'));
  expect(screen.getByRole('button', { name: 'Sim, trocar para Atendimento por menu' })).toBeTruthy();
});
