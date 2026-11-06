import { describe, expect, it } from 'vitest';
import { ART_DESTINATIONS, DESTINATION_ORDER, destinationSpec } from './destinations';

describe('os quatro destinos', () => {
  it('tem as quatro dimensões exatas e nenhum quadrado', () => {
    expect(DESTINATION_ORDER).toEqual(['feed', 'story', 'whatsapp', 'tiktok']);
    expect(ART_DESTINATIONS.feed).toMatchObject({ width: 1080, height: 1350 });
    for (const id of ['story', 'whatsapp', 'tiktok'] as const) {
      expect(ART_DESTINATIONS[id]).toMatchObject({ width: 1080, height: 1920 });
    }
  });

  it('as áreas seguras são as do spec', () => {
    expect(ART_DESTINATIONS.feed.safe).toEqual({ top: 150, right: 72, bottom: 150, left: 72 });
    expect(ART_DESTINATIONS.story.safe).toEqual({ top: 250, right: 72, bottom: 340, left: 72 });
    expect(ART_DESTINATIONS.whatsapp.safe).toEqual({ top: 220, right: 72, bottom: 260, left: 72 });
    expect(ART_DESTINATIONS.tiktok.safe).toEqual({ top: 150, right: 180, bottom: 500, left: 120 });
  });

  it('o TikTok reserva a coluna de ícones e o rodapé da legenda', () => {
    expect(ART_DESTINATIONS.tiktok.safe.right).toBeGreaterThan(ART_DESTINATIONS.story.safe.right);
    expect(ART_DESTINATIONS.tiktok.safe.bottom).toBeGreaterThan(ART_DESTINATIONS.story.safe.bottom);
  });

  it('no Feed a área segura cabe no recorte 1:1 da grade do perfil', () => {
    const { safe, width, height } = ART_DESTINATIONS.feed;
    const recorte = { top: (height - width) / 2, bottom: height - (height - width) / 2 };
    expect(safe.top).toBeGreaterThanOrEqual(recorte.top);
    expect(height - safe.bottom).toBeLessThanOrEqual(recorte.bottom);
  });

  it('cada forma do fantasma fica fora da área segura do seu destino', () => {
    // O fantasma representa o que a rede desenha por cima. Se ele invadir a área
    // segura, ou a área está errada ou o fantasma está — e a prévia mentiria.
    for (const id of DESTINATION_ORDER) {
      const { safe, width, height, chrome } = ART_DESTINATIONS[id];
      for (const forma of chrome) {
        const invade = forma.x + forma.width > safe.left && forma.x < width - safe.right
          && forma.y + forma.height > safe.top && forma.y < height - safe.bottom;
        expect(invade, `${id}: ${forma.kind}`).toBe(false);
      }
    }
  });

  it('o fantasma cobre as faixas de cima e de baixo que a área segura reserva', () => {
    // Sem isto, o teste de não-invasão acima é satisfeito por um fantasma vazio — e um fantasma
    // vazio é justamente a prévia mentindo, porque ele é o instrumento de conferir a área segura.
    for (const id of DESTINATION_ORDER) {
      const { safe, height, chrome } = ART_DESTINATIONS[id];
      expect(chrome.some((forma) => forma.y < safe.top), `${id}: topo`).toBe(true);
      expect(chrome.some((forma) => forma.y + forma.height > height - safe.bottom), `${id}: base`)
        .toBe(true);
    }
  });

  it('cada forma do fantasma é grande o bastante para ser vista na prévia', () => {
    // Pendência registrada nas revisões anteriores: com as formas encolhidas a 1×1, os testes de
    // não-invasão e de cobertura das faixas continuavam passando — um fantasma de pontinhos passa
    // por "cobre o topo" e não mostra nada a quem confere. A prévia no celular sai por volta de um
    // terço da peça, então o que tem 6 px aqui tem 2 px na tela: abaixo disso o fantasma deixa de
    // ser instrumento e vira enfeite invisível.
    for (const id of DESTINATION_ORDER) {
      const { chrome, width, height } = ART_DESTINATIONS[id];
      for (const forma of chrome) {
        const rotulo = `${id}: ${forma.kind}`;
        expect(Math.min(forma.width, forma.height), `${rotulo} espessura`).toBeGreaterThanOrEqual(6);
        expect(Math.max(forma.width, forma.height), `${rotulo} extensão`).toBeGreaterThanOrEqual(24);
        expect(forma.width * forma.height / (width * height), `${rotulo} área`).toBeGreaterThan(0.001);
      }
    }
  });

  it('o fantasma do TikTok ocupa a coluna de ícones que a área segura reserva à direita', () => {
    const { chrome, width, safe } = ART_DESTINATIONS.tiktok;
    expect(chrome.some((forma) => forma.kind === 'rail' && forma.x >= width - safe.right)).toBe(true);
  });

  it('cada destino tem sufixo de arquivo próprio', () => {
    const sufixos = DESTINATION_ORDER.map((id) => ART_DESTINATIONS[id].fileSuffix);
    expect(new Set(sufixos).size).toBe(4);
  });

  it('cada destino tem o nome da ficha e o rótulo do botão que o spec fixa', () => {
    // O Step 3 do brief da Tarefa 2 fixa estas oito strings, e elas são texto de interface: a
    // fileira de fichas e o botão primário da Tarefa 11 leem daqui. Sem teste, um erro aqui só
    // aparece na tela do operador.
    expect(DESTINATION_ORDER.map((id) => ART_DESTINATIONS[id].label))
      .toEqual(['Feed', 'Stories', 'Status', 'TikTok']);
    expect(DESTINATION_ORDER.map((id) => ART_DESTINATIONS[id].actionLabel))
      .toEqual(['Publicar no Feed', 'Publicar no Stories', 'Publicar no Status', 'Publicar no TikTok']);
  });

  it('o rótulo do botão é o nome da ficha, para os dois nunca divergirem', () => {
    // É a relação, não as strings: trocar o nome da ficha sem trocar o do botão põe a prévia a
    // dizer "Stories" e o botão a prometer outro destino.
    for (const id of DESTINATION_ORDER) {
      const { label, actionLabel } = ART_DESTINATIONS[id];
      expect(actionLabel).toBe(`Publicar no ${label}`);
    }
  });

  it('nenhum nome de destino se repete nem vem vazio', () => {
    const nomes = DESTINATION_ORDER.map((id) => ART_DESTINATIONS[id].label);
    expect(new Set(nomes).size).toBe(4);
    for (const nome of nomes) expect(nome.trim()).not.toBe('');
  });

  it('destinationSpec devolve a ficha do destino pedido', () => {
    for (const id of DESTINATION_ORDER) expect(destinationSpec(id)).toBe(ART_DESTINATIONS[id]);
  });
});
