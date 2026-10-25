import { and, eq, isNull } from 'drizzle-orm';
import { closeDb, getDb } from '@/server/db/client';
import { adminGrants, usersTable } from '@/server/db/schema';

async function main() {
  const address = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  const userId = process.argv[3];
  if (process.argv[2] !== '--execute-local' || !userId || !address || !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) {
    console.error('Uso: grant-admin --execute-local <id de usuário Auth.js>, com DATABASE_URL local.');
    process.exitCode = 1;
    return;
  }
  try {
    const [user] = await getDb().select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) throw new Error('Usuário Auth.js não encontrado. Nenhuma conta foi criada.');
    const [active] = await getDb().select({ userId: adminGrants.userId }).from(adminGrants)
      .where(and(eq(adminGrants.userId, userId), isNull(adminGrants.revokedAt))).limit(1);
    if (active) {
      console.log('Concessão administrativa já ativa.');
    } else {
      await getDb().insert(adminGrants).values({ userId }).onConflictDoUpdate({ target: adminGrants.userId, set: { grantedAt: new Date(), revokedAt: null } });
      console.log('Concessão administrativa ativada para o ID informado.');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha no provisionamento.');
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
