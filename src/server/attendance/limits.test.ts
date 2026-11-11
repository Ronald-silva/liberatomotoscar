import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  databaseUnavailable: false,
  result: [{ aiRequests: 1 }] as { aiRequests: number }[],
}));

vi.mock('./ensure-schema', () => ({
  ensureAttendanceTables: async () => {
    if (state.databaseUnavailable) throw new Error('database unavailable');
  },
}));

vi.mock('@/server/db/client', () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => state.result,
        }),
      }),
    }),
  }),
}));

import { consumeRateLimit, reserveWhatsappAiRequest } from './limits';

beforeEach(() => {
  state.databaseUnavailable = false;
  state.result = [{ aiRequests: 1 }];
});

describe('limites de IA e taxa falham fechados', () => {
  it('autoriza IA somente quando a reserva foi confirmada pelo banco', async () => {
    await expect(reserveWhatsappAiRequest(new Date('2026-11-11T15:00:00Z'), 150))
      .resolves.toEqual({ dayUtc: '2026-11-11' });
  });

  it('recusa IA quando o limite acabou', async () => {
    state.result = [];
    await expect(reserveWhatsappAiRequest(new Date('2026-11-11T15:00:00Z'), 150))
      .resolves.toBeNull();
  });

  it('recusa IA quando o banco está indisponível', async () => {
    state.databaseUnavailable = true;
    await expect(reserveWhatsappAiRequest(new Date('2026-11-11T15:00:00Z'), 150))
      .resolves.toBeNull();
  });

  it('recusa IA quando o limite configurado é zero', async () => {
    await expect(reserveWhatsappAiRequest(new Date('2026-11-11T15:00:00Z'), 0))
      .resolves.toBeNull();
  });

  it('permite requisição na janela quando a reserva foi confirmada', async () => {
    await expect(consumeRateLimit('key', 10, 60_000)).resolves.toBe(true);
  });

  it('recusa requisição quando o limite da janela acabou', async () => {
    state.result = [];
    await expect(consumeRateLimit('key', 10, 60_000)).resolves.toBe(false);
  });

  it('recusa requisição quando o banco não pode confirmar a cota', async () => {
    state.databaseUnavailable = true;
    await expect(consumeRateLimit('key', 10, 60_000)).resolves.toBe(false);
  });
});
