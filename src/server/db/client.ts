import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseUrl } from '@/server/env';
import * as schema from './schema';

type Database = ReturnType<typeof makeDatabase>;
let singleton: Database | undefined;

function makeDatabase() {
  // Node runtime + pooled Neon TCP URL: postgres.js supports real transactions.
  // Use a separate direct URL for drizzle-kit migrations.
  const client = postgres(getDatabaseUrl(), { max: 5, connect_timeout: 10, idle_timeout: 20, prepare: false });
  return drizzle(client, { schema, logger: false });
}

export function getDb(): Database {
  return singleton ??= makeDatabase();
}

export async function closeDb(): Promise<void> {
  if (singleton) {
    await singleton.$client.end();
    singleton = undefined;
  }
}
