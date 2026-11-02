import { expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ touched: false }));
vi.mock('@/server/authz', () => ({ requireAdmin: async () => { throw new Error('Acesso negado'); } }));
vi.mock('@/server/attendance/ensure-schema', () => ({ ensureAttendanceTables: async () => { db.touched = true; } }));
vi.mock('@/server/db/client', () => ({ getDb: () => { db.touched = true; throw new Error('nao devia ler'); } }));

import { listWhatsappTenants } from './embedded-signup';

it('listWhatsappTenants exige admin antes de tocar o banco', async () => {
  await expect(listWhatsappTenants()).rejects.toThrow('Acesso negado');
  expect(db.touched).toBe(false);
});
