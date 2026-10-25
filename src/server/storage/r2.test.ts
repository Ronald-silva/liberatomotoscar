import { describe, expect, it } from 'vitest';
import { checkPhoto, MAX_PHOTO_BYTES } from './r2';

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
