import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

let sessionUserId: string | undefined;
vi.mock('@/server/auth', () => ({
  getAuth: () => ({ auth: async () => sessionUserId ? { user: { id: sessionUserId } } : null }),
}));
vi.mock('@/server/auth-policy', () => ({ isAdminAuthConfigured: () => true }));

import { closeDb, getDb } from '@/server/db/client';
import { adminGrants, usersTable } from '@/server/db/schema';
import { AccessDeniedError, requireAdmin } from './authz';

describe.skipIf(!process.env.TEST_DATABASE_URL)('autorização com PostgreSQL isolado (sessão simulada)', () => {
  afterAll(closeDb);

  it('bloqueia anônimo e autenticado sem concessão, libera e revoga explicitamente', async () => {
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Banco de teste isolado obrigatório.');
    sessionUserId = undefined;
    await expect(requireAdmin()).rejects.toBeInstanceOf(AccessDeniedError);
    const userId = randomUUID();
    await getDb().insert(usersTable).values({ id: userId });
    sessionUserId = userId;
    await expect(requireAdmin()).rejects.toBeInstanceOf(AccessDeniedError);
    await getDb().insert(adminGrants).values({ userId });
    await expect(requireAdmin()).resolves.toEqual({ userId });
    await getDb().update(adminGrants).set({ revokedAt: new Date() }).where(eq(adminGrants.userId, userId));
    await expect(requireAdmin()).rejects.toBeInstanceOf(AccessDeniedError);
    sessionUserId = undefined;
  });
});
