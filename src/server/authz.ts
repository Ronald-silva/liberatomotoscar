import { cache } from 'react';
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

// Toda função administrativa chama requireAdmin() por si — é a barreira real, e isso custava
// duas consultas (sessão e concessão) a cada chamada. cache() memoriza por passagem de
// renderização: numa tela que chama o serviço várias vezes, as duas consultas acontecem uma vez.
// Fora de uma renderização (Server Action, rota, script, teste) o invólucro não faz nada e cada
// chamada roda, então a autorização nunca fica presa a um resultado velho.
// Ver node_modules/next/dist/docs/01-app/02-guides/authentication.md.
export const getAdminIdentity = cache(async (): Promise<{ userId: string } | null> => {
  if (!isAdminAuthConfigured()) return null;
  const session = await getAuth().auth();
  const userId = session?.user?.id;
  if (!userId || !(await hasAdminGrant(userId))) return null;
  return { userId };
});

export async function requireAdmin(): Promise<{ userId: string }> {
  const admin = await getAdminIdentity();
  if (!admin) throw new AccessDeniedError();
  return admin;
}
