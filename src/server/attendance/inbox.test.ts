import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { SQL } from 'drizzle-orm';
import * as schema from '@/server/db/schema';

// O banco registra a condição `where` recebida; o teste a transforma em SQL e confere o filtro.
const seen = vi.hoisted(() => ({ where: [] as unknown[] }));

vi.mock('@/server/authz', () => ({ requireAdmin: async () => ({ userId: 'admin-1' }) }));
vi.mock('./conversation-repository', () => ({}));
vi.mock('@/server/db/client', () => ({
  getDb: () => {
    const chain = {
      from: () => chain,
      where: (condition: unknown) => { seen.where.push(condition); return chain; },
      orderBy: () => chain,
      limit: async () => [],
      then: (resolve: (rows: unknown[]) => unknown) => resolve([]),
    };
    return { select: () => chain };
  },
}));

import { countInbox, listInbox } from './inbox';

const mock = drizzle.mock({ schema });
const sqlOf = (condition: unknown) => mock.select().from(schema.conversations).where(condition as SQL).toSQL().sql;

beforeEach(() => { seen.where = []; });

describe('caixa de entrada', () => {
  it('nao lista conversa sem nenhuma mensagem', async () => {
    for (const filter of ['waiting', 'mine', 'automation', 'closed'] as const) {
      seen.where = [];
      await listInbox(filter);
      expect(sqlOf(seen.where[0]), filter).toContain('exists (select 1 from "conversation_messages"');
    }
  });

  it('nao conta conversa sem nenhuma mensagem', async () => {
    await countInbox();
    expect(sqlOf(seen.where[0])).toContain('exists (select 1 from "conversation_messages"');
  });
});
