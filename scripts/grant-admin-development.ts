import { loadEnvConfig } from '@next/env';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { accountsTable, adminGrants, usersTable } from '../src/server/db/schema';
import { getMigrationDatabaseUrl } from '../src/server/env';

loadEnvConfig(process.cwd());
const DEVELOPMENT_BRANCH_ID = 'br-dry-star-b6ma37vq';

async function main() {
  const expectedBranch = process.env.NEON_DEVELOPMENT_BRANCH_ID?.trim();
  const allowedEmail = process.env.ADMIN_GOOGLE_EMAIL?.trim().toLowerCase();
  const url = getMigrationDatabaseUrl();
  if (process.argv[2] !== '--execute-development' || expectedBranch !== DEVELOPMENT_BRANCH_ID ||
      process.argv[3] !== DEVELOPMENT_BRANCH_ID ||
      !allowedEmail || !url) {
    console.error('Informe --execute-development <ID da branch>, NEON_DEVELOPMENT_BRANCH_ID, ADMIN_GOOGLE_EMAIL e DATABASE_URL_DIRECT.');
    process.exitCode = 1;
    return;
  }
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith('.neon.tech') || parsed.hostname.includes('-pooler.')) {
    console.error('A concessão exige a conexão direta do Neon.');
    process.exitCode = 1;
    return;
  }
  const client = postgres(url, { max: 1, connect_timeout: 20, prepare: false });
  const db = drizzle(client);
  try {
    const branch = await db.execute(sql`SELECT current_setting('neon.branch_id', true) AS branch_id`);
    if (branch[0]?.branch_id !== expectedBranch) throw new Error('Branch Neon divergente. Nenhuma concessão foi feita.');
    const users = await db.select({ userId: usersTable.id }).from(usersTable)
      .innerJoin(accountsTable, eq(accountsTable.userId, usersTable.id))
      .where(and(sql`lower(${usersTable.email}) = ${allowedEmail}`, eq(accountsTable.provider, 'google')))
      .limit(2);
    if (users.length !== 1) throw new Error('Conta Google autorizada não encontrada ou ambígua. Nenhuma concessão foi feita.');
    await db.insert(adminGrants).values({ userId: users[0].userId }).onConflictDoUpdate({
      target: adminGrants.userId, set: { grantedAt: new Date(), revokedAt: null },
    });
    console.log('Acesso administrativo concedido à conta Google previamente autenticada.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha no provisionamento.');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
