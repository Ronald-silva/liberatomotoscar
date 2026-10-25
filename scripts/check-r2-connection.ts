import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { createR2Storage } from '@/server/storage/r2';

loadEnvConfig(process.cwd());

// PNG 1x1 válido, gerado em memória: assinatura + IHDR + IDAT + IEND.
const PNG_1X1 = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
));

async function main() {
  const result = { put: false, signedRead: false, delete: false };
  let key: string | undefined;
  try {
    const storage = createR2Storage();
    if (!storage.signedReadUrl) throw new Error('Armazenamento sem leitura assinada.');
    key = (await storage.put(randomUUID(), PNG_1X1, 'image/png')).key;
    result.put = true;
    const response = await fetch(await storage.signedReadUrl(key));
    const bytes = new Uint8Array(await response.arrayBuffer());
    result.signedRead = response.ok && bytes.byteLength === PNG_1X1.byteLength;
    await storage.delete(key);
    key = undefined;
    result.delete = true;
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
    console.error(code === 'ZodError' ? 'Configure R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.' : `Falha na verificação do armazenamento de fotos${code ? ` (${code})` : ''}.`);
    process.exitCode = 1;
  }
  if (key) console.error('Objeto de teste pode ter permanecido no bucket; apague-o manualmente em drafts/.');
  console.log(JSON.stringify(result));
  if (!result.put || !result.signedRead || !result.delete) process.exitCode = 1;
}

void main();
