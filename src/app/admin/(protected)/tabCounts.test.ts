import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listAgenda: vi.fn(), countInbox: vi.fn() }));
vi.mock('@/server/attendance/appointments', () => ({ listAgenda: mocks.listAgenda }));
vi.mock('@/server/attendance/inbox', () => ({ countInbox: mocks.countInbox }));

import { loadTabCounts } from './tabCounts';

const row = (passou: boolean) => ({ passou });
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

it('conta as visitas de hoje que ainda nao passaram e as conversas aguardando vendedor', async () => {
  mocks.listAgenda.mockResolvedValue({ hoje: [row(true), row(false), row(false)], amanha: [row(false)], semana: [], depois: [], semHora: [] });
  mocks.countInbox.mockResolvedValue({ waiting: 4, mine: 9, automation: 7 });
  expect(await loadTabCounts(new Date())).toEqual({ agenda: 2, conversas: 4 });
});

it('uma contagem que falha vira null sem derrubar a outra', async () => {
  mocks.listAgenda.mockRejectedValue(new Error('banco fora'));
  mocks.countInbox.mockResolvedValue({ waiting: 1, mine: 0, automation: 0 });
  expect(await loadTabCounts(new Date())).toEqual({ agenda: null, conversas: 1 });
  expect(console.error).toHaveBeenCalled();
});

it('as duas falhando, a barra ainda tem o que renderizar', async () => {
  mocks.listAgenda.mockRejectedValue(new Error('x'));
  mocks.countInbox.mockRejectedValue(new Error('y'));
  expect(await loadTabCounts(new Date())).toEqual({ agenda: null, conversas: null });
});
