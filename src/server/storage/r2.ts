import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Config } from '@/server/env';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export type PhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';
// 15 min: a página fica aberta numa conversa e as fotos carregam sob demanda; 60 s quebrava a galeria. A URL é credencial ao portador.
export const SIGNED_READ_SECONDS = 900;
export type StoredPhoto = { key: string; mimeType: PhotoMime; sizeBytes: number };
export interface PhotoStorage {
  put(vehicleId: string, body: Uint8Array, mimeType: string): Promise<StoredPhoto>;
  delete(key: string): Promise<void>;
  signedReadUrl?(key: string): Promise<string>;
}

export function checkPhoto(body: Uint8Array, mimeType: string): asserts mimeType is PhotoMime {
  if (body.byteLength === 0 || body.byteLength > MAX_PHOTO_BYTES) throw new Error('Foto vazia ou maior que 10 MB.');
  const jpeg = body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  const png = body.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => body[i] === value);
  const webp = body.length >= 12 && String.fromCharCode(...body.slice(0, 4)) === 'RIFF' && String.fromCharCode(...body.slice(8, 12)) === 'WEBP';
  if (!((mimeType === 'image/jpeg' && jpeg) || (mimeType === 'image/png' && png) || (mimeType === 'image/webp' && webp))) {
    throw new Error('Formato de foto inválido.');
  }
}

type Config = ReturnType<typeof getR2Config>;
let cached: { key: string; client: S3Client } | undefined;

// Um cliente por processo: a galeria assina várias fotos na mesma tela e cada S3Client novo
// remonta credenciais e cadeia de middleware sem necessidade. A chave inclui a conta e a
// credencial, então mudar de configuração continua gerando um cliente novo.
function s3Client(cfg: Config): S3Client {
  const key = `${cfg.accountId}/${cfg.accessKeyId}`;
  if (cached?.key !== key) {
    cached = { key, client: new S3Client({
      region: 'auto', endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    }) };
  }
  return cached.client;
}

export function createR2Storage(): PhotoStorage {
  const cfg = getR2Config();
  const client = s3Client(cfg);
  return {
    async put(vehicleId, body, mimeType) {
      checkPhoto(body, mimeType);
      const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
      const key = `drafts/${vehicleId}/${randomUUID()}.${extension}`;
      await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: mimeType }));
      return { key, mimeType, sizeBytes: body.byteLength };
    },
    async delete(key) {
      if (!/^drafts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) throw new Error('Chave de foto inválida.');
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
    async signedReadUrl(key) {
      if (!/^drafts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) throw new Error('Chave de foto inválida.');
      return getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: SIGNED_READ_SECONDS });
    },
  };
}
