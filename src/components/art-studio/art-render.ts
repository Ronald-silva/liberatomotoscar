import type { ArtDestination } from './destinations';

/**
 * A renderização dos quatro arquivos, fora da prévia.
 *
 * Até aqui `stageRef` apontava para a prévia visível: só era possível exportar o formato que estava
 * na tela, e trocar de destino era re-renderizar e esperar. O toque em publicar esperava por canvas
 * — e Safari e outros encerram a ativação do usuário quando o compartilhamento espera (§7 do spec).
 * Daí este módulo: os quatro são preparados em segundo plano, **antes** do toque.
 *
 * Ele é **puro de propósito**. Qual palco usar, quando liberá-lo e como exportar o JPEG não está
 * aqui: quem chama injeta `renderOne`, e é lá que o palco oculto é reaproveitado e liberado entre
 * destinos. O que vive aqui é o laço, e o laço tem três garantias que o §3.2 do spec pede:
 *
 * - **Sequencial.** Um `for ... of` com `await` por iteração. `Promise.all` manteria quatro palcos
 *   de 1080 px vivos ao mesmo tempo num celular, que é memória que o aparelho da loja não tem.
 * - **Tolerante.** Um destino que devolve `null` ou que **lança** não interrompe os outros: três
 *   arquivos entregues valem mais que nenhum, e quem chama vê quais chegaram.
 * - **Interrompível.** Com `signal` abortado, o laço para — e o destino em curso não é entregue.
 */

export type RenderedArt = {
  destination: ArtDestination;
  blob: Blob;
  /** O nome que o aparelho mostra no menu de compartilhar; vem de quem chama. */
  filename: string;
};

export async function renderDestinations({ order, renderOne, onReady, filename, signal }: {
  order: readonly ArtDestination[];
  renderOne: (destination: ArtDestination) => Promise<Blob | null>;
  onReady: (art: RenderedArt) => void;
  filename: (destination: ArtDestination) => string;
  signal?: AbortSignal;
}): Promise<void> {
  for (const destination of order) {
    if (signal?.aborted) return;

    let blob: Blob | null = null;
    try {
      blob = await renderOne(destination);
    } catch {
      // Um aparelho que não dá conta de um destino costuma dar conta dos outros: o 9:16 do TikTok
      // é mais pesado que o 4:5 do Feed. Falhar em silêncio neste destino e seguir é o que entrega
      // o máximo possível; quem chama sabe quais chegaram porque só esses passam por `onReady`.
      continue;
    }
    if (!blob) continue;

    // Abortado durante a renderização: a peça pronta é descartada em vez de entregue. Quem aborta
    // é a tela, porque o cadastro mudou ou a prévia saiu do ar, e entregar uma arte desenhada com
    // o dado anterior é publicar anúncio vencido — exatamente o que a conferência de versão do §7
    // existe para impedir. Trabalho jogado fora é mais barato que preço errado publicado.
    if (signal?.aborted) return;

    onReady({ destination, blob, filename: filename(destination) });
  }
}
