import { describe, expect, it } from 'vitest';
import { ART_SAFE, buildMetaLine, fitLines, formatSpec, layoutArt, type ArtContent, type Measure } from './art-layout';
import { artFormats, type ArtFormat } from './templates';

/** Medida determinística: largura proporcional ao texto, sem depender de fonte nem de DOM. */
const measure: Measure = (text, size, weight) => text.length * size * (weight >= 600 ? 0.62 : 0.55);

const FORMATOS = Object.keys(artFormats) as ArtFormat[];

function conteudo(overrides: Partial<ArtContent> = {}): ArtContent {
  return {
    title: 'Honda CG 160 Titan',
    meta: '2019 · 42.380 km · Preta',
    kicker: 'RECÉM-CHEGADO',
    priceLabel: 'PREÇO DO ANÚNCIO',
    price: 'R$ 18.900,00',
    phone: '(85) 99636-5664',
    note: 'Consulte disponibilidade e condições',
    photoAspect: 3 / 4,
    ...overrides,
  };
}

/** Todos os blocos de texto da arte, para varrer invariantes de uma vez. */
function blocos(l: ReturnType<typeof layoutArt>) {
  return [l.kicker, l.title, l.meta, l.priceLabel, l.price, l.phone, l.note];
}

/** Os blocos sólidos desenhados atrás do texto: pílula do selo, painel da foto, placa do preço. */
function fundos(l: ReturnType<typeof layoutArt>) {
  return [l.kickerPill, l.photoPanel, l.pricePlate];
}

/** `a` cabe inteiro dentro de `b`. */
function dentro(a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }) {
  return a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
}

describe('fitLines nunca descarta palavra', () => {
  it('devolve o texto inteiro mesmo quando nem o menor corpo cabe nas linhas pedidas', () => {
    const texto = 'Chevrolet S10 High Country 2.8 Turbo Diesel 4x4 Automatica Couro Multimidia';
    const { lines } = fitLines({ text: texto, maxWidth: 300, maxLines: 2, sizes: [60, 40], weight: 700, measure });
    expect(lines.join(' ')).toBe(texto);
    expect(lines.length).toBeGreaterThan(2);
  });

  it('não acrescenta reticências em hipótese nenhuma', () => {
    const { lines } = fitLines({ text: 'Palavra '.repeat(40).trim(), maxWidth: 200, maxLines: 1, sizes: [40, 20], weight: 700, measure });
    expect(lines.join(' ')).not.toContain('…');
  });

  it('usa o maior corpo que couber nas linhas pedidas', () => {
    const curto = fitLines({ text: 'Honda CG', maxWidth: 900, maxLines: 2, sizes: [76, 68, 60], weight: 700, measure });
    expect(curto.size).toBe(76);
    const longo = fitLines({ text: 'Volkswagen Saveiro Robust', maxWidth: 400, maxLines: 2, sizes: [76, 68, 60], weight: 700, measure });
    expect(longo.size).toBeLessThan(76);
  });

  it('parte palavra que sozinha não cabe, em vez de estourar a largura', () => {
    const { lines } = fitLines({ text: 'Supercalifragilisticoexpialidoso', maxWidth: 120, maxLines: 9, sizes: [40], weight: 700, measure });
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line, 40, 700)).toBeLessThanOrEqual(120);
  });
});

describe('o conteúdo respeita a área segura de cada plataforma', () => {
  for (const format of FORMATOS) {
    it(`${format}: nenhum bloco de texto sai da área livre da interface`, () => {
      const spec = formatSpec(format);
      const l = layoutArt(format, conteudo(), measure);
      const direita = spec.width - spec.safe.right;
      const base = spec.height - spec.safe.bottom;
      for (const bloco of blocos(l)) {
        expect(bloco.x).toBeGreaterThanOrEqual(spec.safe.left);
        expect(bloco.x + bloco.width).toBeLessThanOrEqual(direita);
        expect(bloco.y).toBeGreaterThanOrEqual(spec.safe.top);
        expect(bloco.y + bloco.height).toBeLessThanOrEqual(base);
      }
      for (const fundo of fundos(l)) {
        expect(fundo.x).toBeGreaterThanOrEqual(spec.safe.left);
        expect(fundo.x + fundo.width).toBeLessThanOrEqual(direita);
        expect(fundo.y).toBeGreaterThanOrEqual(spec.safe.top);
        expect(fundo.y + fundo.height).toBeLessThanOrEqual(base);
      }
      expect(l.photo.x).toBeGreaterThanOrEqual(spec.safe.left);
      expect(l.photo.x + l.photo.width).toBeLessThanOrEqual(direita);
      expect(l.photo.y + l.photo.height).toBeLessThanOrEqual(base);
    });

    it(`${format}: o texto segue dentro da área segura com título e observação longos`, () => {
      const spec = formatSpec(format);
      const l = layoutArt(format, conteudo({
        title: 'Chevrolet S10 High Country Turbo Diesel',
        note: 'Entrada a partir de 20% e parcelas que cabem no seu bolso, consulte',
      }), measure);
      const base = spec.height - spec.safe.bottom;
      for (const bloco of blocos(l)) {
        expect(bloco.x + bloco.width).toBeLessThanOrEqual(spec.width - spec.safe.right);
        expect(bloco.y + bloco.height).toBeLessThanOrEqual(base);
      }
    });
  }

  it('o TikTok reserva a coluna de ícones à direita e o rodapé da legenda', () => {
    // É o que impede a arte de competir com curtir, comentar e compartilhar.
    expect(ART_SAFE.tiktok.right).toBeGreaterThan(ART_SAFE.story.right);
    expect(ART_SAFE.tiktok.bottom).toBeGreaterThan(ART_SAFE.story.bottom);
    const tiktok = layoutArt('tiktok', conteudo(), measure);
    const story = layoutArt('story', conteudo(), measure);
    expect(tiktok.column.width).toBeLessThan(story.column.width);
    expect(tiktok.note.y + tiktok.note.height).toBeLessThan(story.note.y + story.note.height);
  });
});

describe('a foto é o bloco elástico: quem cede é a imagem, nunca o texto', () => {
  it('título mais longo encolhe a foto e mantém todas as palavras', () => {
    const curto = layoutArt('story', conteudo({ title: 'Honda Biz' }), measure);
    const longo = layoutArt('story', conteudo({ title: 'Volkswagen Saveiro Robust Cabine Dupla' }), measure);
    expect(longo.photo.height).toBeLessThan(curto.photo.height);
    expect(longo.title.lines.join(' ')).toBe('Volkswagen Saveiro Robust Cabine Dupla');
  });

  it('o quadro assume a proporção da foto, em retrato e em paisagem', () => {
    const retrato = layoutArt('story', conteudo({ photoAspect: 3 / 4 }), measure);
    expect(retrato.photo.width / retrato.photo.height).toBeCloseTo(3 / 4, 2);
    const paisagem = layoutArt('story', conteudo({ photoAspect: 16 / 9 }), measure);
    expect(paisagem.photo.width / paisagem.photo.height).toBeCloseTo(16 / 9, 2);
  });

  it('sem foto carregada assume 4:3 e ainda assim posiciona tudo', () => {
    const l = layoutArt('feed', conteudo({ photoAspect: null }), measure);
    expect(l.photo.width).toBeGreaterThan(0);
    expect(l.photo.height).toBeGreaterThan(0);
  });

  it('a foto nunca some, mesmo com todo o texto no tamanho máximo', () => {
    const l = layoutArt('tiktok', conteudo({
      title: 'Volkswagen Saveiro Robust Cabine Dupla Completa',
      note: 'Entrada facilitada, parcelas que cabem no bolso e avaliação do seu usado na hora',
    }), measure);
    expect(l.photo.height).toBeGreaterThanOrEqual(200);
  });
});

describe('os blocos sólidos contêm o texto que anunciam', () => {
  for (const format of FORMATOS) {
    it(`${format}: pílula, placa e painel envolvem o próprio conteúdo`, () => {
      const l = layoutArt(format, conteudo(), measure);
      // Texto estourando a pílula é pior que selo sem pílula: lê como erro, não como etiqueta.
      expect(dentro(l.kicker, l.kickerPill)).toBe(true);
      expect(dentro(l.priceLabel, l.pricePlate)).toBe(true);
      expect(dentro(l.price, l.pricePlate)).toBe(true);
      expect(dentro(l.photo, l.photoPanel)).toBe(true);
    });
  }

  it('a pílula acompanha o texto do selo em vez de ocupar a coluna inteira', () => {
    const curto = layoutArt('story', conteudo({ kicker: 'NOVO' }), measure);
    const longo = layoutArt('story', conteudo({ kicker: 'DESTAQUE DA SEMANA' }), measure);
    expect(curto.kickerPill.width).toBeLessThan(longo.kickerPill.width);
    expect(longo.kickerPill.width).toBeLessThan(longo.column.width);
  });

  it('o preço domina o telefone com folga', () => {
    const l = layoutArt('story', conteudo(), measure);
    expect(l.price.size).toBeGreaterThanOrEqual(l.phone.size * 2);
  });
});

describe('buildMetaLine', () => {
  it('junta o que existe com separador', () => {
    expect(buildMetaLine(2019, 42380, 'Preta')).toBe('2019 · 42.380 km · Preta');
  });
  it('omite o que falta sem deixar separador solto', () => {
    expect(buildMetaLine(2019, null, null)).toBe('2019');
    expect(buildMetaLine(null, 0, '  ')).toBe('Consulte os detalhes');
    expect(buildMetaLine(null, 1200, null)).toBe('1.200 km');
  });
});
