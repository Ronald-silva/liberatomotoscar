import { describe, expect, it } from 'vitest';
import { checkPhoto, isR2PhotoKey, MAX_PHOTO_BYTES } from './r2';

describe('validação de fotos', () => {
  it('aceita assinatura compatível e bloqueia MIME falso', () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() => checkPhoto(png, 'image/png')).not.toThrow();
    expect(() => checkPhoto(png, 'image/jpeg')).toThrow();
    expect(() => checkPhoto(png, 'image/svg+xml')).toThrow();
  });
  it('rejeita arquivo vazio e acima do limite', () => {
    expect(() => checkPhoto(new Uint8Array(), 'image/png')).toThrow();
    expect(() => checkPhoto(new Uint8Array(MAX_PHOTO_BYTES + 1), 'image/png')).toThrow();
  });
});

it('reconhece apenas chaves de fotos geradas sob drafts', () => {
  const key = 'drafts/38c8ed42-741d-4194-b25b-740601fa3527/5b9ee7d5-38d4-4bf8-a660-e69bb7d91fc2.png';
  expect(isR2PhotoKey(key)).toBe(true);
  expect(isR2PhotoKey('/fotos/legado.png')).toBe(false);
  expect(isR2PhotoKey('drafts/../../outra-conta.png')).toBe(false);
});
