import { beforeEach, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ updateAppointment: vi.fn(), createManualAppointment: vi.fn(), deleteAppointment: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: cache.revalidatePath }));
vi.mock('@/server/attendance/appointments', () => ({
  ...service,
  AppointmentInputError: class AppointmentInputError extends Error {},
}));

import { corrigirVisita } from './actions';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const initial = { message: null, ok: false };

beforeEach(() => { service.updateAppointment.mockReset().mockResolvedValue({}); });

it('corrigir sem o campo de veiculo nao pede para apagar o vinculo', async () => {
  await corrigirVisita(initial, form({ id: 'a1', data: '2026-11-07', hora: '10:00' }));
  expect(service.updateAppointment).toHaveBeenCalledWith('a1', { data: '2026-11-07', hora: '10:00', vehicleId: undefined });
});

it('"sem veiculo" escolhido de proposito e o unico jeito de apagar o vinculo', async () => {
  await corrigirVisita(initial, form({ id: 'a1', data: '2026-11-07', hora: '10:00', vehicleId: '' }));
  expect(service.updateAppointment).toHaveBeenCalledWith('a1', { data: '2026-11-07', hora: '10:00', vehicleId: null });
  await corrigirVisita(initial, form({ id: 'a1', data: '2026-11-07', hora: '10:00', vehicleId: 'car2' }));
  expect(service.updateAppointment).toHaveBeenLastCalledWith('a1', { data: '2026-11-07', hora: '10:00', vehicleId: 'car2' });
});

it('gravar uma visita revalida o layout, onde mora o contador da aba Agenda', async () => {
  cache.revalidatePath.mockClear();
  await corrigirVisita(initial, form({ id: 'a1', data: '2026-11-07', hora: '10:00' }));
  expect(cache.revalidatePath).toHaveBeenCalledWith('/admin', 'layout');
});
