import { describe, expect, it, vi } from 'vitest';
import { deliverArt } from './share-art';

const blob = new Blob(['x'], { type: 'image/jpeg' });
const falha = (name: string) => Object.assign(new Error('x'), { name });

describe('entrega da arte', () => {
  it('compartilha quando o aparelho aceita arquivos', async () => {
    const share = vi.fn().mockResolvedValue(undefined); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => true, download })).resolves.toBe('shared');
    expect(download).not.toHaveBeenCalled();
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files?.[0].name).toBe('arte.jpg');
    expect(data.files?.[0].type).toBe('image/jpeg');
  });
  it('baixa quando o aparelho nao compartilha arquivo', async () => {
    const share = vi.fn(); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => false, download })).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith(blob, 'arte.jpg');
  });
  it('baixa quando o aparelho nem tem compartilhamento', async () => {
    const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', download })).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledOnce();
  });
  it('cancelar a folha do sistema nao e erro', async () => {
    const share = vi.fn().mockRejectedValue(falha('AbortError')); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => true, download })).resolves.toBe('cancelled');
    expect(download).not.toHaveBeenCalled();
  });
  it('falha que nao e cancelamento cai no download', async () => {
    const share = vi.fn().mockRejectedValue(falha('NotAllowedError')); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => true, download })).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledWith(blob, 'arte.jpg');
  });
});
