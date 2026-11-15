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
      .resolves.toEqual({ status: 'reservado', dayUtc: '2026-11-11' });
  });

  it('recusa IA quando o limite acabou, e diz que foi limite', async () => {
    state.result = [];
    await expect(reserveWhatsappAiRequest(new Date('2026-11-11T15:00:00Z'), 150))
      .resolves.toEqual({ status: 'limite' });
  });

  /**
   * O que a auditoria de 15/11/2026 pediu: continuar recusando (o teto de custo não pode sumir
   * quando o controle falha) **e** dizer que foi falha, não limite. Quem atende um cliente trata
   * os dois de formas diferentes, e antes os dois chegavam como o mesmo `null`.
   */
  it('recusa IA quando o banco está indisponível, e distingue de limite', async () => {
    state.databaseUnavailable = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(reserveWhatsappAiRequest(new Date('2026-11-11T15:00:00Z'), 150))
      .resolves.toEqual({ status: 'indisponivel' });
  });

  it('recusa IA quando o limite configurado é zero', async () => {
    await expect(reserveWhatsappAiRequest(new Date('2026-11-11T15:00:00Z'), 0))
      .resolves.toEqual({ status: 'limite' });
  });

  it('permite requisição na janela quando a reserva foi confirmada', async () => {
    await expect(consumeRateLimit('key', 10, 60_000)).resolves.toBe('liberado');
  });

  it('recusa requisição quando o limite da janela acabou', async () => {
    state.result = [];
    await expect(consumeRateLimit('key', 10, 60_000)).resolves.toBe('limite');
  });

  it('recusa requisição quando o banco não pode confirmar a cota, e distingue de limite', async () => {
    state.databaseUnavailable = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(consumeRateLimit('key', 10, 60_000)).resolves.toBe('indisponivel');
  });

  it('nunca libera sem confirmação do banco: limite e indisponível bloqueiam igual', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.result = [];
    expect(await consumeRateLimit('key', 10, 60_000)).not.toBe('liberado');
    state.databaseUnavailable = true;
    expect(await consumeRateLimit('key', 10, 60_000)).not.toBe('liberado');
    expect((await reserveWhatsappAiRequest(new Date('2026-11-11T15:00:00Z'), 150)).status)
      .not.toBe('reservado');
  });
});
