export type Delivery = 'shared' | 'cancelled' | 'downloaded' | 'unavailable';

// Entrega a arte já gerada: pela folha de compartilhamento do aparelho (o dono manda direto ao WhatsApp, sem
// procurar o arquivo em Downloads) ou, onde não houver, baixando. Quem chama injeta `share`/`canShare`/`download`
// para o teste não depender do navegador; sem `share` o aparelho simplesmente não compartilha.
export async function deliverArt({ blob, filename, title, text, share, canShare, download, fallback = 'download' }: {
  blob: Blob; filename: string; title?: string; text?: string; fallback?: 'download' | 'none';
  share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean;
  download: (blob: Blob, filename: string) => void;
}): Promise<Delivery> {
  const files = [new File([blob], filename, { type: blob.type })];
  const withText: ShareData = { files, ...(title ? { title } : {}), ...(text ? { text } : {}) };
  const accepted = (payload: ShareData) => {
    try { return canShare?.(payload) ?? false; } catch { return false; }
  };
  const data: ShareData | null = accepted(withText) ? withText : accepted({ files }) ? { files } : null;
  if (share && data) {
    try {
      await share(data);
      return 'shared';
    } catch (error) {
      // Fechar a folha do sistema é uma decisão da pessoa, não uma falha: nada a avisar nem a baixar.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      // Qualquer outra recusa (ativação expirada no iOS, tipo não aceito) cai no download, mas deixa rastro:
      // sem ele, um aparelho que recusa o envio e um que nem tem envio seriam indistinguíveis na conferência.
      console.warn('Compartilhamento recusado; caiu no download', error instanceof Error ? { name: error.name, message: error.message } : error);
    }
  }
  if (fallback === 'none') return 'unavailable';
  download(blob, filename);
  return 'downloaded';
}

export type VersionCheck = { ok: true } | { ok: false; error: string };
export const CHECK_FAILED = 'Não foi possível conferir o anúncio. Tente de novo.';
export const OFFLINE = 'Sem conexão para conferir o anúncio. Confira o sinal e tente de novo.';

// Confere se a versão do anúncio ainda é a da tela. Rede ruim é o normal no celular: falha de rede e corpo que não
// é JSON (um 502 em HTML) viram frases do painel, nunca a mensagem crua do navegador.
export async function checkVersion(fetcher: () => Promise<Response>): Promise<VersionCheck> {
  let response: Response;
  try { response = await fetcher(); } catch { return { ok: false, error: OFFLINE }; }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* corpo ilegível: vale o texto genérico */ }
  if (response.ok) return { ok: true };
  const error = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : '';
  return { ok: false, error: error || CHECK_FAILED };
}

// Imagem e versão são preparadas em paralelo para abrir o menu nativo enquanto o toque ainda está ativo.
// A entrega só acontece depois de ambas terminarem; uma versão antiga nunca é compartilhada. Devolve a mensagem para
// a pessoa, ou null quando não há o que dizer (cancelar a folha do sistema é decisão, não resultado).
export async function runArtDelivery({ mode, render, check, deliver }: {
  mode: 'share' | 'download';
  render: () => Promise<Blob | null>;
  check: () => Promise<VersionCheck>;
  deliver: (blob: Blob) => Promise<Delivery>;
}): Promise<string | null> {
  try {
    const [blob, checked] = await Promise.all([
      render(),
      Promise.resolve().then(check).catch(() => ({ ok: false, error: CHECK_FAILED } as VersionCheck)),
    ]);
    if (!blob) return 'Não foi possível gerar a arte neste aparelho.';
    if (!checked.ok) return checked.error;
    const outcome = await deliver(blob);
    if (outcome === 'shared') return 'Arte entregue ao menu do aparelho. Conclua e confira a publicação no aplicativo.';
    if (outcome === 'cancelled') return null;
    if (outcome === 'unavailable') return 'Este navegador não conseguiu abrir os aplicativos. Use Baixar ou tente no celular com HTTPS.';
    return mode === 'share'
      ? 'Este aparelho não abriu o envio, então a arte foi baixada. Confira antes de publicar.'
      : 'Arte pronta para baixar. Confira antes de publicar.';
  } catch {
    return 'Não foi possível gerar a arte. Tente de novo.';
  }
}
