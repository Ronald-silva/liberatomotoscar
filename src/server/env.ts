import { z } from 'zod';

function postgresUrl(name: 'DATABASE_URL' | 'DATABASE_URL_DIRECT'): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    const sslmode = parsed.searchParams.get('sslmode');
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname ||
      (!local && !['require', 'verify-ca', 'verify-full'].includes(sslmode ?? ''))) throw new Error();
    return value;
  } catch {
    throw new Error(`${name} precisa ser uma URL PostgreSQL válida com SSL para conexão remota.`);
  }
}

export function getDatabaseUrl(): string {
  const value = postgresUrl('DATABASE_URL');
  if (!value) throw new Error('DATABASE_URL não configurada no servidor.');
  return value;
}

export function getMigrationDatabaseUrl(): string | undefined {
  return postgresUrl('DATABASE_URL_DIRECT');
}

export function getAuthSecret(): string {
  return z.string().min(32, 'AUTH_SECRET deve ter pelo menos 32 caracteres').parse(process.env.AUTH_SECRET);
}

export function getR2Config() {
  return z.object({
    accountId: z.string().min(1),
    bucket: z.string().min(1),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  }).parse({
    accountId: process.env.R2_ACCOUNT_ID,
    bucket: process.env.R2_BUCKET,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  });
}
