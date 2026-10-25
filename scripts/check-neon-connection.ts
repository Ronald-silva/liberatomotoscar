import { loadEnvConfig } from '@next/env';
import { sql as drizzleSql } from 'drizzle-orm';
import postgres from 'postgres';
import { closeDb, getDb } from '@/server/db/client';
import { getDatabaseUrl, getMigrationDatabaseUrl } from '@/server/env';

loadEnvConfig(process.cwd());

function failureKind(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code) : '';
  if (code === '28P01') return 'autenticação recusada';
  if (code === '3D000') return 'banco não encontrado';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'resolução de endereço';
  if (['ETIMEDOUT', 'ECONNREFUSED', 'CONNECT_TIMEOUT'].includes(code)) return 'rede ou tempo limite';
  if (code.startsWith('ERR_SSL') || code.includes('CERT')) return 'TLS';
  return 'falha de conexão não classificada';
}

async function main() {
  let directClient: ReturnType<typeof postgres> | undefined;
  try {
    const pooled = new URL(getDatabaseUrl());
    const directValue = getMigrationDatabaseUrl();
    if (!directValue) throw new Error('DATABASE_URL_DIRECT não configurada.');
    const direct = new URL(directValue);
    const endpoint = direct.hostname.split('.')[0];
    const expectedEndpoint = process.env.NEON_DEVELOPMENT_ENDPOINT_ID?.trim();
    const expectedBranch = process.env.NEON_DEVELOPMENT_BRANCH_ID?.trim();
    const sameEndpoint = pooled.hostname.replace(/-pooler(?=\.)/, '') === direct.hostname;
    const validPair = sameEndpoint && pooled.hostname.includes('-pooler.') &&
      !direct.hostname.includes('-pooler.') && pooled.pathname === direct.pathname &&
      pooled.username === direct.username && endpoint.startsWith('ep-') &&
      direct.hostname.endsWith('.neon.tech');
    if (!validPair) throw new Error('As URLs não representam o mesmo endpoint Neon com pooling e conexão direta.');
    if (expectedEndpoint && expectedEndpoint !== endpoint) {
      throw new Error('O endpoint não coincide com o compute informado para development. Nenhuma consulta foi executada.');
    }

    directClient = postgres(directValue, { max: 1, connect_timeout: 20, idle_timeout: 5, prepare: false });
    const [runtime, migration] = await Promise.allSettled([
      getDb().execute(drizzleSql`SELECT 1 AS ok`),
      directClient`SELECT 1 AS ok`,
    ]);
    const runtimeOk = runtime.status === 'fulfilled' && Number(runtime.value[0]?.ok) === 1;
    const directOk = migration.status === 'fulfilled' && Number(migration.value[0]?.ok) === 1;
    let sameBranchId = false;
    let branchIdAvailable = false;
    let branchMatchesExpected = false;
    if (runtimeOk && directOk) {
      const [runtimeBranch, directBranch] = await Promise.all([
        getDb().execute(drizzleSql`SELECT current_setting('neon.branch_id', true) AS branch_id`),
        directClient`SELECT current_setting('neon.branch_id', true) AS branch_id`,
      ]);
      const first = String(runtimeBranch[0]?.branch_id ?? '');
      const second = String(directBranch[0]?.branch_id ?? '');
      branchIdAvailable = /^br-[a-z0-9-]+$/.test(first) && /^br-[a-z0-9-]+$/.test(second);
      sameBranchId = branchIdAvailable && first === second;
      branchMatchesExpected = Boolean(expectedBranch && sameBranchId && first === expectedBranch);
      if (expectedBranch && !branchMatchesExpected) {
        throw new Error('O ID da branch Neon não coincide com development. Nenhuma alteração foi executada.');
      }
    }
    console.log(JSON.stringify({
      runtimeSelect1: runtimeOk,
      directSelect1: directOk,
      sameEndpoint,
      branchIdAvailable,
      sameBranchId,
      pooledRuntime: true,
      directUnpooled: true,
      regionSaoPaulo: direct.hostname.includes('sa-east-1'),
      branchDevelopmentVerified: branchMatchesExpected || Boolean(expectedEndpoint && expectedEndpoint === endpoint),
    }));
    if (runtime.status === 'rejected') console.error(`DATABASE_URL: ${failureKind(runtime.reason)}.`);
    if (migration.status === 'rejected') console.error(`DATABASE_URL_DIRECT: ${failureKind(migration.reason)}.`);
    if (!runtimeOk || !directOk || (branchIdAvailable && !sameBranchId)) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha ao validar configuração Neon.');
    process.exitCode = 1;
  } finally {
    await closeDb();
    if (directClient) await directClient.end();
  }
}

void main();
