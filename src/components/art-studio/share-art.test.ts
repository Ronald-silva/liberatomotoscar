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
  it('chama o compartilhamento no mesmo ciclo do toque, sem esperar uma Promise', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const result = deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => true,
      download: vi.fn(), fallback: 'none' });
    expect(share).toHaveBeenCalledOnce();
    await expect(result).resolves.toBe('shared');
  });
  it('envia só a imagem se o aparelho não aceitar legenda junto do arquivo', async () => {
    const share = vi.fn().mockResolvedValue(undefined); const download = vi.fn();
    const canShare = vi.fn((data: ShareData) => !data.text);
    await expect(deliverArt({ blob, filename: 'arte.jpg', text: 'Legenda', share, canShare, download }))
      .resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)] });
  });
  it('tenta compartilhar mesmo quando canShare falha neste navegador', async () => {
    const share = vi.fn().mockResolvedValue(undefined); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => false,
      download, fallback: 'none' })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });
  it('baixa quando o aparelho recusa compartilhar o arquivo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const share = vi.fn().mockRejectedValue(falha('TypeError')); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => false, download })).resolves.toBe('downloaded');
    expect(share).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith(blob, 'arte.jpg');
    warn.mockRestore();
  });
  it('não abre a janela de salvar quando a pessoa pediu Compartilhar', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const share = vi.fn().mockRejectedValue(falha('TypeError')); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => false,
      download, fallback: 'none' })).resolves.toBe('unavailable');
    expect(share).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('baixa quando a verificação de compartilhamento do navegador falha', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const share = vi.fn().mockRejectedValue(falha('TypeError')); const download = vi.fn();
    await expect(deliverArt({ blob, filename: 'arte.jpg', share,
      canShare: () => { throw new Error('Web Share indisponível'); }, download })).resolves.toBe('downloaded');
    expect(share).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledOnce();
    warn.mockRestore();
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

describe('entrega: a legenda viaja no mesmo toque', () => {
  it('dispara a cópia da legenda antes de compartilhar, sem esperar por ela', async () => {
    const ordem: string[] = [];
    let resolverCopia: () => void = () => {};
    await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download: vi.fn(),
      copyText: () => { ordem.push('copiar'); return new Promise((r) => { resolverCopia = r; }); },
      share: async () => { ordem.push('compartilhar'); },
    });
    // Se houvesse `await` na cópia, 'compartilhar' não teria acontecido ainda.
    expect(ordem).toEqual(['copiar', 'compartilhar']);
    resolverCopia();
  });

  it('não há volta do laço de eventos entre copiar e compartilhar', async () => {
    // O teste de ordem acima NÃO pega um `await` de microtarefa entre os dois, e é exatamente isso
    // que a Global Constraint proíbe: no WebKit o `await` consome a ativação do usuário e o menu
    // nativo não abre. Aqui a cópia deixa um marcador numa microtarefa própria: se ele cair ANTES
    // de 'compartilhar', houve volta do laço no meio.
    const ordem: string[] = [];
    await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download: vi.fn(),
      canShare: () => true,
      copyText: () => { ordem.push('copiar'); return Promise.resolve().then(() => { ordem.push('microtarefa da cópia'); }); },
      share: async () => { ordem.push('compartilhar'); },
    });
    expect(ordem).toEqual(['copiar', 'compartilhar', 'microtarefa da cópia']);
  });

  it('com legenda, ainda chama o compartilhamento no mesmo ciclo do toque', async () => {
    // Extensão do teste de ativação do usuário para o caminho com cópia: uma cópia que nunca
    // resolve não pode atrasar o `share` nem por uma volta do laço.
    const share = vi.fn().mockResolvedValue(undefined);
    const resultado = deliverArt({ blob, filename: 'arte.jpg', caption: 'legenda',
      copyText: () => new Promise<void>(() => {}), share, canShare: () => true,
      download: vi.fn(), fallback: 'none' });
    expect(share).toHaveBeenCalledOnce();
    await expect(resultado).resolves.toBe('shared');
  });

  it('falha de cópia não aborta o compartilhamento', async () => {
    const resultado = await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download: vi.fn(),
      copyText: () => Promise.reject(new Error('sem permissão')),
      share: async () => {} });
    expect(resultado).toBe('shared');
  });

  it('cópia que estoura na hora também não aborta o compartilhamento', async () => {
    // `navigator.clipboard` ausente lança na chamada, não devolve promessa recusada.
    const share = vi.fn().mockResolvedValue(undefined);
    const resultado = await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download: vi.fn(),
      copyText: () => { throw new Error('sem área de transferência'); }, share });
    expect(resultado).toBe('shared');
    expect(share).toHaveBeenCalledOnce();
  });

  it('a legenda também viaja no ShareData', async () => {
    let recebido: ShareData | null = null;
    await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download: vi.fn(),
      canShare: () => true, share: async (d) => { recebido = d; } });
    expect(recebido!.text).toBe('legenda');
  });

  it('a legenda do destino tem precedência sobre o texto genérico', async () => {
    let recebido: ShareData | null = null;
    await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda do destino', text: 'texto antigo',
      download: vi.fn(), canShare: () => true, share: async (d) => { recebido = d; } });
    expect(recebido!.text).toBe('legenda do destino');
  });

  it('sem legenda, nada é copiado', async () => {
    let copiou = false;
    await deliverArt({ blob, filename: 'x.jpg', download: vi.fn(),
      copyText: async () => { copiou = true; }, share: async () => {} });
    expect(copiou).toBe(false);
  });

  it('copia a legenda mesmo quando o aparelho não compartilha', async () => {
    // Quem baixa a arte também vai colar a legenda; condicionar a cópia ao `share` deixaria a área
    // de transferência vazia justamente no aparelho que não compartilha.
    const copiado: string[] = [];
    await expect(deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download: vi.fn(),
      copyText: async (t) => { copiado.push(t); } })).resolves.toBe('downloaded');
    expect(copiado).toEqual(['legenda']);
  });

  it('a legenda copiada é a mesma que vai na folha do sistema', async () => {
    const copiado: string[] = [];
    let recebido: ShareData | null = null;
    await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda única', download: vi.fn(),
      copyText: async (t) => { copiado.push(t); }, canShare: () => true,
      share: async (d) => { recebido = d; } });
    expect(copiado).toEqual([recebido!.text]);
  });

  it('a legenda não some do envio quando o aparelho recusa texto junto do arquivo', async () => {
    // O recuo que manda só a imagem é comportamento real de WebView; a legenda, nesse caso, vive
    // só na área de transferência — e é por isso que a cópia não pode depender do `canShare`.
    const copiado: string[] = [];
    const share = vi.fn().mockResolvedValue(undefined);
    await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download: vi.fn(),
      copyText: async (t) => { copiado.push(t); }, canShare: (d: ShareData) => !d.text, share });
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)] });
    expect(copiado).toEqual(['legenda']);
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
