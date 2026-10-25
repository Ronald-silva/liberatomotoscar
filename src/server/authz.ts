import { and, eq, isNull } from 'drizzle-orm';
import { getAuth } from '@/server/auth';
import { isAdminAuthConfigured } from '@/server/auth-policy';
import { getDb } from '@/server/db/client';
import { adminGrants } from '@/server/db/schema';

export class AccessDeniedError extends Error {
  constructor() { super('Acesso negado'); }
}

export async function hasAdminGrant(userId: string): Promise<boolean> {
  const [grant] = await getDb().select({ userId: adminGrants.userId }).from(adminGrants)
    .where(and(eq(adminGrants.userId, userId), isNull(adminGrants.revokedAt))).limit(1);
  return Boolean(grant);
}

export async function getAdminIdentity(): Promise<{ userId: string } | null> {
  if (!isAdminAuthConfigured()) return null;
  const session = await getAuth().auth();
  const userId = session?.user?.id;
  if (!userId || !(await hasAdminGrant(userId))) return null;
  return { userId };
}

export async function requireAdmin(): Promise<{ userId: string }> {
  const admin = await getAdminIdentity();
  if (!admin) throw new AccessDeniedError();
  return admin;
}
