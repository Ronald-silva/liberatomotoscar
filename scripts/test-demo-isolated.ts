/** Executa o ensaio HTTP real apenas após confirmar uma branch Neon isolada. */
import { execFileSync, spawnSync } from 'node:child_process';
import { loadEnvConfig } from '@next/env';
import postgres from 'postgres';

loadEnvConfig(process.cwd());

async function main() {
  const execute = process.argv.includes('--execute-local');
  const vehicles = process.argv.includes('--integration-vehicles');
  if (!execute && !vehicles && !process.argv.includes('--preflight-only')) {
    throw new Error('Use --preflight-only, --execute-local ou --integration-vehicles.');
  }

  const projectId = process.env.NEON_PROJECT_ID?.trim();
  const branchId = process.env.ISOLATED_NEON_TEST_BRANCH_ID?.trim();
  const sharedBranchId = process.env.NEON_DEVELOPMENT_BRANCH_ID?.trim();
  const cli = process.env.NEON_CLI_PATH?.trim() || 'neonctl';
  if (!projectId || !/^br-[a-z0-9-]+$/.test(branchId ?? '') ||
      !/^br-[a-z0-9-]+$/.test(sharedBranchId ?? '') || branchId === sharedBranchId) {
    throw new Error('Informe projeto, branch de teste e branch compartilhada distinta antes do ensaio.');
  }
  if (execute && !process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY ausente.');

  const connection = (pooled: boolean) => execFileSync(cli, [
    'connection-string', branchId!, '--project-id', projectId!, ...(pooled ? ['--pooled'] : []),
    '--no-analytics',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const directUrl = connection(false);
  const pooledUrl = connection(true);
  const direct = new URL(directUrl);
  const pooled = new URL(pooledUrl);
  const sharedUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!sharedUrl) throw new Error('URL da branch compartilhada ausente para a comparação de segurança.');
  if (direct.protocol !== 'postgresql:' || pooled.protocol !== 'postgresql:' ||
      direct.hostname === pooled.hostname ||
      direct.hostname !== pooled.hostname.replace(/-pooler(?=\.)/, '') ||
      direct.hostname === new URL(sharedUrl).hostname) {
    throw new Error('As conexões de teste não formam um par Neon isolado.');
  }

  const sharedDb = postgres(sharedUrl, { max: 1, prepare: false });
  try {
    const [row] = await sharedDb`SELECT current_setting('neon.branch_id', true) AS id`;
    if (row?.id !== sharedBranchId) {
      throw new Error('O ID informado para a branch compartilhada não coincide com o banco local.');
    }
  } finally {
    await sharedDb.end();
  }

  const branch = JSON.parse(execFileSync(cli, [
    'branches', 'get', branchId!, '--project-id', projectId!, '--output', 'json', '--no-analytics',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  if (branch.id !== branchId || branch.parent_id !== sharedBranchId) {
    throw new Error('A branch de teste não é filha da branch compartilhada neste projeto.');
  }

  const db = postgres(directUrl, { max: 1, prepare: false });
  try {
    const [row] = await db`SELECT current_setting('neon.branch_id', true) AS id`;
    if (row?.id !== branchId) throw new Error('O banco consultado não pertence à branch de teste informada.');
    const [table] = await db`SELECT to_regclass('public.demo_ai_usage') IS NOT NULL AS ready`;
    if (!table?.ready) throw new Error('A migration demo_ai_usage não existe na branch de teste.');
  } finally {
    await db.end();
  }

  console.log(`Branch isolada verificada: ${branchId}.`);
  if (!execute && !vehicles) return;
  if (vehicles) {
    console.log('Aplicando migrations pendentes somente na branch isolada.');
    const migration = spawnSync('npm', ['run', 'db:migrate'], {
      cwd: process.cwd(), stdio: 'inherit', env: {
        ...process.env, DATABASE_URL: pooledUrl, DATABASE_URL_DIRECT: directUrl,
      },
    });
    if (migration.error) throw migration.error;
    if (migration.status !== 0) throw new Error('Migration isolada falhou.');
  }
  console.log(vehicles ? 'Iniciando integração do estoque.' : 'Iniciando ensaio HTTP real.');
  const child = spawnSync('npm', ['test', '--', vehicles ? 'src/server/vehicles/service.integration.test.ts' : 'src/app/api/demo-ia/route.live.test.ts'], {
    cwd: process.cwd(), stdio: 'inherit', env: {
      ...process.env,
      DATABASE_URL: pooledUrl,
      DATABASE_URL_DIRECT: directUrl,
      ISOLATED_NEON_TEST_BRANCH_ID: branchId,
      ...(vehicles ? { TEST_DATABASE_URL: pooledUrl, R2_BUCKET: 'liberato-vehicle-integration-fake' } : { RUN_LIVE_OPENROUTER: 'true' }),
    },
  });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha ao iniciar ensaio isolado.');
  process.exitCode = 1;
});
