// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgendaView, type AgendaGroups } from './AgendaView';
import type { VisitView } from './VisitCard';

vi.mock('./actions', () => ({ marcarVisita: vi.fn(), corrigirVisita: vi.fn(), cancelarVisita: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const visit = (id: string, name: string): VisitView => ({
  id, scheduledFor: '2026-11-07T17:00:00.000Z', passou: false, customerName: name, customerPhone: '85999990000',
  quote: '', conversationId: null, vehicleId: null, vehicle: null,
});
const none: AgendaGroups = { hoje: [], amanha: [], semana: [], depois: [], semHora: [] };
const props = { vehicles: [], vehiclesAvailable: true, minDate: '2026-11-02' };

it('vazia, diz com todas as letras que nao ha visita e convida a marcar, sem fingir conteudo', () => {
  const { container } = render(<AgendaView groups={none} {...props} />);
  expect(screen.getByText(/Nenhuma visita marcada/)).toBeTruthy();
  expect(screen.getByText(/Marque a primeira/)).toBeTruthy();
  // Nao promete o que ainda nao existe: a Dayse ainda nao grava agendamentos.
  expect(container.textContent).not.toMatch(/Dayse/);
  expect(screen.queryAllByRole('listitem')).toEqual([]);
  expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
  expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(true);
  expect(screen.getByLabelText('Nome do cliente')).toBeTruthy();
});

it('mostra os grupos na ordem combinada e esconde os vazios', () => {
  render(<AgendaView groups={{ ...none, semHora: [visit('5', 'E')], depois: [visit('4', 'D')], hoje: [visit('1', 'A')], semana: [visit('3', 'C')] }} {...props} />);
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent))
    .toEqual(['Hoje (1)', 'Esta semana (1)', 'Depois (1)', 'Combinado, sem hora certa (1)']);
  expect(screen.queryByText(/Amanhã/)).toBeNull();
  expect(screen.queryByText(/Nenhuma visita marcada/)).toBeNull();
});

it('com todos os grupos, a ordem e Hoje, Amanha, Esta semana, Depois, Combinado', () => {
  render(<AgendaView groups={{ hoje: [visit('1', 'A')], amanha: [visit('2', 'B')], semana: [visit('3', 'C')], depois: [visit('4', 'D')], semHora: [visit('5', 'E')] }} {...props} />);
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/ \(\d+\)/, '')))
    .toEqual(['Hoje', 'Amanhã', 'Esta semana', 'Depois', 'Combinado, sem hora certa']);
  // Com visitas, o formulario continua a um toque, recolhido.
  expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(false);
});
