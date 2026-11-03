// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./actions', () => ({ operateInboxConversation: async () => ({ message: null, error: false }) }));

import { InboxOperatorControls } from './InboxOperatorControls';

const base = { conversationId: 'c1', status: 'open' as const, owner: 'human' as const,
  assignedTo: 'admin', viewerUserId: 'admin', tenantId: 'tenant-1', customerPhone: '5585999990000' };

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
