// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./actions', () => ({ operateInboxConversation: async () => ({ message: null, error: false }) }));

import { InboxOperatorControls } from './InboxOperatorControls';

const base = { conversationId: 'c1', status: 'open' as const, owner: 'human' as const,
  assignedTo: 'admin', viewerUserId: 'admin', tenantId: 'tenant-1', customerPhone: '5585999990000' };

afterEach(cleanup);

it('conversa antiga não oferece uma caixa que descartaria a resposta', () => {
  render(<InboxOperatorControls {...base} customerPhone={null} />);
  expect(screen.queryByRole('textbox', { name: 'Responder como vendedor' })).toBeNull();
  expect(screen.getByText(/anterior ao registro do contato/)).toBeTruthy();
});

it('janela encerrada oferece resposta pelo celular da loja', () => {
  render(<InboxOperatorControls {...base} lastVisitorMessageAt="2026-01-01T12:00:00Z" />);
  expect(screen.queryByRole('textbox', { name: 'Responder como vendedor' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Responder pelo WhatsApp da loja' }).getAttribute('href'))
    .toBe('https://wa.me/5585999990000');
});

it('conversa recente com contato mostra a caixa de resposta', () => {
  render(<InboxOperatorControls {...base} lastVisitorMessageAt={new Date().toISOString()} />);
  expect(screen.getByRole('textbox', { name: 'Responder como vendedor' })).toBeTruthy();
});

it('exige confirmação em dois passos antes de excluir conversa', () => {
  render(<InboxOperatorControls {...base} lastVisitorMessageAt={new Date().toISOString()} />);
  expect(screen.queryByRole('button', { name: 'Sim, excluir conversa' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Excluir conversa' }));
  expect(screen.getByText(/histórico de mensagens será apagado permanentemente/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sim, excluir conversa' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Manter conversa' }));
  expect(screen.queryByRole('button', { name: 'Sim, excluir conversa' })).toBeNull();
});

// O campo que o servidor exige só **existe** depois da confirmação, e vale o id desta conversa.
// É o que impede o formulário de nascer já confirmado, como acontecia com o `confirm=yes` fixo.
it('o campo de confirmação da exclusão só nasce com a caixa aberta e repete a conversa', () => {
  const { container } = render(<InboxOperatorControls {...base} lastVisitorMessageAt={new Date().toISOString()} />);
  const campo = () => container.querySelector<HTMLInputElement>('input[name="confirm"]');
  expect(campo()).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Excluir conversa' }));
  expect(campo()?.value).toBe('c1');
  fireEvent.click(screen.getByRole('button', { name: 'Manter conversa' }));
  expect(campo()).toBeNull();
});

it('conversa encerrada também confirma antes de apagar e também traz o campo', () => {
  const { container } = render(<InboxOperatorControls {...base} status="closed" />);
  expect(container.querySelector('input[name="confirm"]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Excluir conversa' }));
  expect(container.querySelector<HTMLInputElement>('input[name="confirm"]')?.value).toBe('c1');
  expect(screen.getByRole('button', { name: 'Sim, excluir conversa' })).toBeTruthy();
});
