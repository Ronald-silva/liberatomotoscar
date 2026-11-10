// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { AccessDeniedError } = vi.hoisted(() => ({ AccessDeniedError: class AccessDeniedError extends Error {} }));
vi.mock('@/server/authz', () => ({ AccessDeniedError }));
const agenda = vi.fn();
const stock = vi.fn();
vi.mock('@/server/attendance/appointments', () => ({ listAgenda: (n: unknown) => agenda(n) }));
vi.mock('@/server/vehicles/service', () => ({ listAdminVehiclesWithCover: () => stock() }));
// Os formularios usam actions de servidor; aqui so interessa o que a pagina decide mostrar.
vi.mock('./actions', () => ({ marcarVisita: vi.fn(), corrigirVisita: vi.fn(), cancelarVisita: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import AgendaPage, { metadata } from './page';

afterEach(() => { cleanup(); agenda.mockReset(); stock.mockReset(); vi.restoreAllMocks(); });

const empty = { hoje: [], amanha: [], semana: [], depois: [], semHora: [] };

describe('pagina da agenda', () => {
  it('nao e indexavel', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe('Visitas agendadas');
  });

  it('sem visitas, diz que nao ha visita e oferece marcar', async () => {
    agenda.mockResolvedValue(empty);
    stock.mockResolvedValue([]);
    render(await AgendaPage());
    expect(screen.getByText(/Nenhuma visita agendada/)).toBeTruthy();
  });

  it('se a agenda nao carrega (tabela ausente, banco fora), diz isso e nao finge que esta vazia', async () => {
    agenda.mockRejectedValue(new Error('relation "visit_appointments" does not exist'));
    stock.mockResolvedValue([]);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(await AgendaPage());
    expect(screen.getByRole('heading', { name: 'Visitas agendadas' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível carregar a agenda/);
    expect(screen.queryByText(/Nenhuma visita agendada/)).toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it('sem sessao autorizada a negacao sobe, nao vira aviso na tela', async () => {
    agenda.mockRejectedValue(new AccessDeniedError());
    stock.mockResolvedValue([]);
    await expect(AgendaPage()).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
