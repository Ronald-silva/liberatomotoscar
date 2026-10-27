/** Repete somente exclusões R2 já registradas no banco configurado. */
import { loadEnvConfig } from '@next/env';
import { closeDb } from '@/server/db/client';
import { retryPendingR2Cleanup } from '@/server/storage/cleanup';
import { createR2Storage } from '@/server/storage/r2';

loadEnvConfig(process.cwd());

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--retry') {
    throw new Error('Use --retry para processar apenas as exclusões R2 pendentes.');
  }
  try {
    const result = await retryPendingR2Cleanup(createR2Storage());
    console.log(JSON.stringify(result));
    if (result.failed || result.stillReferenced) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha ao reconciliar R2.');
  process.exitCode = 1;
});
