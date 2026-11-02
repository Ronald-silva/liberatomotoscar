export type Delivery = 'shared' | 'cancelled' | 'downloaded';

// Entrega a arte já gerada: pela folha de compartilhamento do aparelho (o dono manda direto ao WhatsApp, sem
// procurar o arquivo em Downloads) ou, onde não houver, baixando. Quem chama injeta `share`/`canShare`/`download`
// para o teste não depender do navegador; sem `share` o aparelho simplesmente não compartilha.
export async function deliverArt({ blob, filename, share, canShare, download }: {
  blob: Blob; filename: string;
  share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean;
  download: (blob: Blob, filename: string) => void;
}): Promise<Delivery> {
  const data: ShareData = { files: [new File([blob], filename, { type: blob.type })] };
  if (share && canShare?.(data)) {
    try {
      await share(data);
      return 'shared';
    } catch (error) {
      // Fechar a folha do sistema é uma decisão da pessoa, não uma falha: nada a avisar nem a baixar.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      // Qualquer outra recusa (ativação expirada no iOS, tipo não aceito) cai no comportamento de sempre.
    }
  }
  download(blob, filename);
  return 'downloaded';
}
