import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function resolveEncryptionKey(explicitHexKey?: string): Buffer {
  const hex = explicitHexKey ?? process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('WHATSAPP_TOKEN_ENCRYPTION_KEY deve conter 64 caracteres hexadecimais (32 bytes).');
  }
  return Buffer.from(hex, 'hex');
}

/** Criptografa o access_token da WABA em repouso no formato iv:authTag:ciphertext (hex). */
export function encryptAccessToken(plainToken: string, explicitHexKey?: string): string {
  if (!plainToken) throw new Error('Token vazio não pode ser criptografado.');
  const key = resolveEncryptionKey(explicitHexKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainToken, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Descriptografa o access_token salvo no banco apenas no momento do envio outbound. */
export function decryptAccessToken(payload: string, explicitHexKey?: string): string {
  const [ivHex, authTagHex, encryptedHex] = payload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Formato de token criptografado inválido.');
  }
  const key = resolveEncryptionKey(explicitHexKey);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Valida obrigatoriamente o cabeçalho X-Hub-Signature-256 enviado pela Meta Cloud API. */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  explicitSecret?: string,
): boolean {
  const appSecret = explicitSecret ?? process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const receivedHex = signatureHeader.slice('sha256='.length).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(receivedHex)) return false;

  const expectedHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const receivedBuf = Buffer.from(receivedHex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (receivedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(receivedBuf, expectedBuf);
}

/** Converte um ID de mensagem do WhatsApp (wamid.*) em UUID v5 determinístico para idempotência no banco. */
export function deterministicUuidFromWaMessageId(waMessageId: string): string {
  const hex = createHash('sha256').update(`wamid:${waMessageId}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

