import { expect, it, vi } from 'vitest';

const test = vi.hoisted(() => ({ upsert: vi.fn(), updated: null as Record<string, unknown> | null,
  tx: null as unknown }));
vi.mock('./appointments', () => ({ upsertAgentAppointment: test.upsert }));
vi.mock('@/server/db/client', () => ({ getDb: () => ({ transaction: async (fn: (tx: unknown) => unknown) => {
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: () => ({ limit: async () => [{
      id: 'c1', owner: 'automation', status: 'open', handoffRequestedAt: null,
      facts: [], customerName: 'Ana', customerPhone: '5585999990000',
    }] }) }) }) }),
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'm1' }] }) }),
    update: () => ({ set: (value: Record<string, unknown>) => {
      test.updated = value;
      return { where: async () => [] };
    } }),
  };
  test.tx = tx;
  return fn(tx);
} }) }));

import { commitAutomatedReply } from './conversation-repository';

it('grava visita e resposta na mesma transação e estende retenção do lead', async () => {
  const now = new Date('2026-11-03T12:00:00Z');
  const scheduledFor = new Date('2026-11-07T17:00:00Z');
  const result = await commitAutomatedReply('c1', { sender: 'ai', body: 'Combinado.', cards: [],
    appointment: { scheduledFor, quote: 'sábado às 14h', vehicleId: null } }, now);
  expect(result).toMatchObject({ id: 'm1' });
  expect(test.upsert).toHaveBeenCalledWith({ conversationId: 'c1', vehicleId: null,
    scheduledFor, quote: 'sábado às 14h', customerName: 'Ana', customerPhone: '5585999990000' }, test.tx);
  expect(test.updated?.expiresAt).toEqual(new Date(now.getTime() + 180 * 86_400_000));
});
