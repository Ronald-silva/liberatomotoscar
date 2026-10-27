/** Reconciliação executável apenas em branch Neon e bucket R2 de teste separados. */
import { loadEnvConfig } from '@next/env';
import { execFileSync } from 'node:child_process';
import postgres from 'postgres';
import { closeDb } from '@/server/db/client';
import { queueOldR2Orphans, retryPendingR2Cleanup } from '@/server/storage/cleanup';
import { createR2Storage } from '@/server/storage/r2';

loadEnvConfig(process.cwd());

async function main() {
  const scan = process.argv.includes('--scan');
  const retry = process.argv.includes('--retry');
  if (!process.argv.includes('--execute-test-bucket') || (!scan && !retry)) {
    throw new Error('Use --execute-test-bucket com --scan e/ou --retry.');
  }
  const testBucket = process.env.R2_TEST_BUCKET?.trim();
  const testAccount = process.env.R2_TEST_ACCOUNT_ID?.trim();
  const testAccessKey = process.env.R2_TEST_ACCESS_KEY_ID?.trim();
  const testSecretKey = process.env.R2_TEST_SECRET_ACCESS_KEY?.trim();
  const currentBucket = process.env.R2_BUCKET?.trim();
  const testBranch = process.env.ISOLATED_NEON_TEST_BRANCH_ID?.trim();
  const sharedBranch = process.env.NEON_DEVELOPMENT_BRANCH_ID?.trim();
  const projectId = process.env.NEON_PROJECT_ID?.trim();
  if (!testBucket || !testAccount || !testAccessKey || !testSecretKey || !currentBucket ||
      testBucket === currentBucket || testAccessKey === process.env.R2_ACCESS_KEY_ID || !testBranch ||
      !sharedBranch || testBranch === sharedBranch || !projectId) {
    throw new Error('Configure bucket/credenciais R2 de teste distintos e branch Neon isolada.');
  }
  const cli = process.env.NEON_CLI_PATH?.trim() || 'neonctl';
  const branch = JSON.parse(execFileSync(cli, [
    'branches', 'get', testBranch, '--project-id', projectId, '--output', 'json', '--no-analytics',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  if (branch.id !== testBranch || branch.parent_id !== sharedBranch) {
    throw new Error('A branch de teste não é filha da branch compartilhada no projeto informado.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL ausente.');
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [row] = await client`SELECT current_setting('neon.branch_id', true) AS id`;
    if (row?.id !== testBranch) throw new Error('O banco conectado não pertence à branch Neon isolada.');
  } finally {
    await client.end();
  }
  // A troca só ocorre depois da validação: o storage criado abaixo recebe o bucket de teste.
  process.env.R2_ACCOUNT_ID = testAccount;
  process.env.R2_BUCKET = testBucket;
  process.env.R2_ACCESS_KEY_ID = testAccessKey;
  process.env.R2_SECRET_ACCESS_KEY = testSecretKey;
  const storage = createR2Storage();
  try {
    if (scan) console.log(JSON.stringify({ scan: await queueOldR2Orphans(storage) }));
    if (retry || scan) console.log(JSON.stringify({ cleanup: await retryPendingR2Cleanup(storage) }));
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha ao reconciliar R2.');
  process.exitCode = 1;
});
