import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';
import { getMigrationDatabaseUrl } from './src/server/env';

loadEnvConfig(process.cwd());
const directUrl = getMigrationDatabaseUrl();

// Generation works offline; migration requires DATABASE_URL_DIRECT.
export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  ...(directUrl ? { dbCredentials: { url: directUrl } } : {}),
  verbose: true,
  strict: true,
});
