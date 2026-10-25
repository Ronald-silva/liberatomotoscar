import { loadEnvConfig } from '@next/env';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '@/server/db/client';
import { importLegacyVehicles } from '@/server/vehicles/import-legacy';

loadEnvConfig(process.cwd());
const DEVELOPMENT_BRANCH_ID = 'br-dry-star-b6ma37vq';

function databaseHost(): string | null {
  try {
    return process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : null;
  } catch {
    return null;
  }
}

async function main() {
  const host = databaseHost();
  const mode = process.argv[2];
  const expectedBranch = process.env.NEON_DEVELOPMENT_BRANCH_ID?.trim();
  const local = mode === '--execute-local' && host !== null && ['localhost', '127.0.0.1', '[::1]'].includes(host);
  const development = mode === '--execute-development' && expectedBranch === DEVELOPMENT_BRANCH_ID &&
    process.argv[3] === DEVELOPMENT_BRANCH_ID && host !== null && host.endsWith('.neon.tech');
  if (!local && !development) {
    console.error('Informe --execute-local com DATABASE_URL local, ou --execute-development <ID da branch> com NEON_DEVELOPMENT_BRANCH_ID e DATABASE_URL do Neon. Nenhum dado foi alterado.');
    process.exitCode = 1;
    return;
  }
  try {
    if (development) {
      // Mesma conexão (getDb) que importLegacyVehicles usa para escrever.
      const branch = await getDb().execute(sql`SELECT current_setting('neon.branch_id', true) AS branch_id`);
      if (branch[0]?.branch_id !== DEVELOPMENT_BRANCH_ID) {
        console.error('Branch Neon divergente. Nenhum dado foi alterado.');
        process.exitCode = 1;
        return;
      }
    }
    console.log(JSON.stringify(await importLegacyVehicles()));
  } catch {
    console.error('Importação interrompida sem confirmar o lote. Verifique conflitos de slug, imagem ou integridade no banco.');
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
