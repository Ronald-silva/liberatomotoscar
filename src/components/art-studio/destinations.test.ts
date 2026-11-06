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

  it('cada destino tem sufixo de arquivo próprio', () => {
    const sufixos = DESTINATION_ORDER.map((id) => ART_DESTINATIONS[id].fileSuffix);
    expect(new Set(sufixos).size).toBe(4);
  });

  it('destinationSpec devolve a ficha do destino pedido', () => {
    for (const id of DESTINATION_ORDER) expect(destinationSpec(id)).toBe(ART_DESTINATIONS[id]);
  });
});
