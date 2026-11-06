import { describe, expect, it } from 'vitest';
import { renderDestinations, type RenderedArt } from './art-render';
import { ART_DESTINATIONS, DESTINATION_ORDER, type ArtDestination } from './destinations';

/**
 * A renderização dos quatro arquivos, fora da prévia.
 *
 * Até aqui `stageRef` apontava para a prévia visível, então só era possível exportar o formato que
 * estava na tela — e o toque em publicar esperava por canvas. Este módulo é **puro de propósito**:
 * quem chama injeta `renderOne` com o palco oculto, e é lá que o palco é liberado entre destinos.
 * O que se prova aqui é o laço: sequencial, tolerante a falha, entregando cada destino assim que
 * ele fica pronto, e parando quando é abortado.
 */

const jpeg = () => new Blob(['x'], { type: 'image/jpeg' });
const nomeDe = (d: ArtDestination) => `liberato-honda-cg-${ART_DESTINATIONS[d].fileSuffix}.jpg`;

describe('renderDestinations', () => {
  it('renderiza em sequência, nunca em paralelo', async () => {
    let vivos = 0;
    let maximo = 0;
    await renderDestinations({
      order: DESTINATION_ORDER, onReady: () => {}, filename: nomeDe,
      renderOne: async () => {
        vivos += 1;
        maximo = Math.max(maximo, vivos);
        await Promise.resolve();
        vivos -= 1;
        return jpeg();
      },
    });
    expect(maximo).toBe(1);
  });

  it('entrega cada destino assim que ele fica pronto, e não todos no fim', async () => {
    // A ordem da lista de prontos sozinha não prova isto: um laço que renderiza os quatro e só
    // depois entrega produz exatamente a mesma lista. O que prova é a intercalação.
    const diario: string[] = [];
    await renderDestinations({
      order: DESTINATION_ORDER, filename: nomeDe,
      onReady: (art) => diario.push(`pronto:${art.destination}`),
      renderOne: async (d) => { diario.push(`desenha:${d}`); return jpeg(); },
    });
    expect(diario).toEqual(DESTINATION_ORDER.flatMap((d) => [`desenha:${d}`, `pronto:${d}`]));
  });

  it('percorre a ordem que recebeu, não a ordem padrão', async () => {
    const prontos: ArtDestination[] = [];
    await renderDestinations({
      order: ['tiktok', 'feed'], filename: nomeDe,
      onReady: (art) => prontos.push(art.destination),
      renderOne: async () => jpeg(),
    });
    expect(prontos).toEqual(['tiktok', 'feed']);
  });

  it('um destino que falha não impede os outros', async () => {
    const prontos: ArtDestination[] = [];
    await renderDestinations({
      order: DESTINATION_ORDER, filename: nomeDe,
      onReady: (art) => prontos.push(art.destination),
      renderOne: async (d) => (d === 'story' ? null : jpeg()),
    });
    expect(prontos).toEqual(['feed', 'whatsapp', 'tiktok']);
  });

  it('um destino que lança não impede os outros', async () => {
    // O Step 3 exige que `renderOne` que **lança** não interrompa o laço, e nenhum teste do plano
    // cobria isso: um `toBlob` que estoura a memória do aparelho lança, não devolve `null`.
    const prontos: ArtDestination[] = [];
    await renderDestinations({
      order: DESTINATION_ORDER, filename: nomeDe,
      onReady: (art) => prontos.push(art.destination),
      renderOne: async (d) => {
        if (d === 'whatsapp') throw new Error('Este aparelho não conseguiu gerar a imagem.');
        return jpeg();
      },
    });
    expect(prontos).toEqual(['feed', 'story', 'tiktok']);
  });

  it('para de renderizar quando é abortado', async () => {
    const controller = new AbortController();
    let chamadas = 0;
    const prontos: ArtDestination[] = [];
    await renderDestinations({
      order: DESTINATION_ORDER, filename: nomeDe, signal: controller.signal,
      onReady: (art) => prontos.push(art.destination),
      renderOne: async () => { chamadas += 1; controller.abort(); return jpeg(); },
    });
    expect(chamadas).toBe(1);
    // E o destino abortado **não** é entregue: quem aborta é a tela porque o cadastro mudou, e
    // entregar uma peça desenhada com o dado anterior é publicar arte vencida (§7 do spec, a
    // conferência de versão). Trabalho jogado fora é mais barato que anúncio errado.
    expect(prontos).toEqual([]);
  });

  it('não começa nada quando já chega abortado', async () => {
    const controller = new AbortController();
    controller.abort();
    let chamadas = 0;
    await renderDestinations({
      order: DESTINATION_ORDER, filename: nomeDe, signal: controller.signal,
      onReady: () => { throw new Error('não deveria entregar nada'); },
      renderOne: async () => { chamadas += 1; return jpeg(); },
    });
    expect(chamadas).toBe(0);
  });

  it('o nome do arquivo chega em quem recebe a arte', async () => {
    // O quinto teste do brief media `ART_DESTINATIONS[...].fileSuffix`, ou seja `destinations.ts`,
    // que `destinations.test.ts` já cobre — e não prova nada deste módulo. O que importa aqui é
    // que o nome calculado por quem chama chegue **inteiro** a `RenderedArt.filename`, porque é
    // ele que o aparelho mostra no menu de compartilhar.
    const entregues: RenderedArt[] = [];
    await renderDestinations({
      order: DESTINATION_ORDER, filename: nomeDe,
      onReady: (art) => entregues.push(art),
      renderOne: async () => jpeg(),
    });
    expect(entregues.map((art) => art.filename)).toEqual(DESTINATION_ORDER.map(nomeDe));
    expect(new Set(entregues.map((art) => art.filename)).size).toBe(DESTINATION_ORDER.length);
  });

  it('entrega o blob que o renderizador devolveu, sem trocar nem refazer', async () => {
    const porDestino = new Map<ArtDestination, Blob>();
    const entregues: RenderedArt[] = [];
    await renderDestinations({
      order: DESTINATION_ORDER, filename: nomeDe,
      onReady: (art) => entregues.push(art),
      renderOne: async (d) => { const blob = jpeg(); porDestino.set(d, blob); return blob; },
    });
    for (const art of entregues) expect(art.blob).toBe(porDestino.get(art.destination));
  });

  it('uma ordem vazia não desenha nem entrega nada', async () => {
    let chamadas = 0;
    await renderDestinations({
      order: [], filename: nomeDe, onReady: () => { throw new Error('não deveria entregar nada'); },
      renderOne: async () => { chamadas += 1; return jpeg(); },
    });
    expect(chamadas).toBe(0);
  });
});
