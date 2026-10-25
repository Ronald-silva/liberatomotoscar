import { closeDb } from '@/server/db/client';
import { importLegacyVehicles } from '@/server/vehicles/import-legacy';

async function main() {
  const address = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (process.argv[2] !== '--execute-local' || !address || !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) {
    console.error('Importação permitida apenas com --execute-local e DATABASE_URL local. Nenhum dado foi alterado.');
    process.exitCode = 1;
    return;
  }
  try {
    console.log(JSON.stringify(await importLegacyVehicles()));
  } catch {
    console.error('Importação interrompida sem confirmar o lote. Verifique conflitos de slug, imagem ou integridade no banco local.');
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
