import { describe, expect, it, vi } from 'vitest';
import { checkVersion, deliverArt, runArtDelivery } from './share-art';

const blob = new Blob(['x'], { type: 'image/jpeg' });
const falha = (name: string) => Object.assign(new Error('x'), { name });

describe('entrega da arte', () => {
  it('compartilha quando o aparelho aceita arquivos', async () => {
    const share = vi.fn().mockResolvedValue(undefined); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', title: 'Honda Titan', text: 'Legenda #HondaTitan',
      share, canShare: () => true, download })).resolves.toBe('shared');
    expect(download).not.toHaveBeenCalled();
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files?.[0].name).toBe('arte.jpg');
    expect(data.files?.[0].type).toBe('image/jpeg');
    expect(data.text).toBe('Legenda #HondaTitan');
    expect(data.title).toBe('Honda Titan');
  });
  it('envia só a imagem se o aparelho não aceitar legenda junto do arquivo', async () => {
    const share = vi.fn().mockResolvedValue(undefined); const download = vi.fn();
    const canShare = vi.fn((data: ShareData) => !data.text);
    await expect(deliverArt({ blob, filename: 'arte.jpg', text: 'Legenda', share, canShare, download }))
      .resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)] });
  });
  it('baixa quando o aparelho nao compartilha arquivo', async () => {
    const share = vi.fn(); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => false, download })).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith(blob, 'arte.jpg');
  });
  it('não abre a janela de salvar quando a pessoa pediu Compartilhar', async () => {
    const share = vi.fn(); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => false,
      download, fallback: 'none' })).resolves.toBe('unavailable');
    expect(share).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
  it('baixa quando a verificação de compartilhamento do navegador falha', async () => {
    const share = vi.fn(); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share,
      canShare: () => { throw new Error('Web Share indisponível'); }, download })).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledOnce();
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
  it('falha que nao e cancelamento cai no download e deixa rastro', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const share = vi.fn().mockRejectedValue(falha('NotAllowedError')); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => true, download })).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledWith(blob, 'arte.jpg');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('recusado'), expect.objectContaining({ name: 'NotAllowedError' }));
    warn.mockRestore();
  });
});

describe('entrega: prepara arte e versão, depois entrega', () => {
  const montar = (over: Partial<Parameters<typeof runArtDelivery>[0]> = {}) => {
    const calls: string[] = [];
    const render = vi.fn(async () => { calls.push('render'); return blob as Blob | null; });
    const check = vi.fn(async () => { calls.push('check'); return { ok: true } as const; });
    const deliver = vi.fn(async () => { calls.push('deliver'); return 'shared' as const; });
    return { calls, render, check, deliver, run: () => runArtDelivery({ mode: 'share', render, check, deliver, ...over }) };
  };

  it('prepara arte e versão antes de entregar', async () => {
    const t = montar();
    await expect(t.run()).resolves.toBe('Arte entregue ao menu do aparelho. Conclua e confira a publicação no aplicativo.');
    expect(t.calls).toEqual(['render', 'check', 'deliver']);
    expect(t.deliver).toHaveBeenCalledWith(blob);
  });
  it('conferencia recusada: nada e entregue e a pessoa le o motivo', async () => {
    const t = montar({ check: async () => ({ ok: false, error: 'Este anúncio foi alterado.' }) });
    await expect(t.run()).resolves.toBe('Este anúncio foi alterado.');
    expect(t.deliver).not.toHaveBeenCalled();
  });
  it('conferencia que lanca: nada e entregue e a mensagem e do painel', async () => {
    const t = montar({ check: async () => { throw new TypeError('Failed to fetch'); } });
    await expect(t.run()).resolves.toBe('Não foi possível conferir o anúncio. Tente de novo.');
    expect(t.deliver).not.toHaveBeenCalled();
  });
  it('imagem nao gerada: confere em paralelo, mas não entrega', async () => {
    const t = montar({ render: async () => null });
    await expect(t.run()).resolves.toMatch(/gerar a arte/);
    expect(t.check).toHaveBeenCalledOnce();
    expect(t.deliver).not.toHaveBeenCalled();
  });
  it('cancelar a folha do sistema nao produz mensagem', async () => {
    const t = montar({ deliver: async () => 'cancelled' });
    await expect(t.run()).resolves.toBeNull();
  });
  it('baixou por falta de envio: avisa; baixar direto tem texto proprio', async () => {
    await expect(montar({ deliver: async () => 'downloaded' }).run()).resolves.toMatch(/não abriu o envio/);
    await expect(montar({ mode: 'download', deliver: async () => 'downloaded' }).run()).resolves.toMatch(/pronta para baixar/);
    await expect(montar({ deliver: async () => 'unavailable' }).run()).resolves.toMatch(/não conseguiu abrir os aplicativos/);
  });
});

describe('conferencia de versao', () => {
  it('rede fora vira frase do painel, nao Failed to fetch', async () => {
    const r = await checkVersion(async () => { throw new TypeError('Failed to fetch'); });
    expect(r).toEqual({ ok: false, error: 'Sem conexão para conferir o anúncio. Confira o sinal e tente de novo.' });
  });
  it('corpo que nao e JSON (502 em HTML) vira o texto generico', async () => {
    const r = await checkVersion(async () => new Response('<html>Bad Gateway</html>', { status: 502 }));
    expect(r).toEqual({ ok: false, error: 'Não foi possível conferir o anúncio. Tente de novo.' });
  });
  it('repassa o erro do servidor e aceita 200', async () => {
    expect(await checkVersion(async () => Response.json({ error: 'Este anúncio foi alterado.' }, { status: 409 })))
      .toEqual({ ok: false, error: 'Este anúncio foi alterado.' });
    expect(await checkVersion(async () => Response.json({ ok: true }))).toEqual({ ok: true });
  });
});
