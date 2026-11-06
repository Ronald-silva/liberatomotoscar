import { describe, expect, it } from 'vitest';
import { DESTINATION_ORDER, destinationSpec } from './destinations';
import { createArchivoMeasure } from './measure-archivo';
import { buildMetaLine, fitLines, layoutArt, scrimAlphaAt, KICKER_TRACKING, PRICE_LABEL_TRACKING,
  type ArtContent, type ArtLayout, type Measure } from './art-layout';
import { artBadges } from './templates';

/**
 * Mede com a métrica real da Archivo, igual à produção (Tarefa 1). O modelo anterior era
 * `length × size × 0,62` — outro modelo, e foi por isso que 674 testes verdes conviveram com um
 * rodapé estourando a área segura.
 */
const measure = createArchivoMeasure();

/** O corpus é o estoque real (§13 do spec), não invenção. */
const CORPUS = [
  { title: 'Volkswagen Saveiro', meta: '2024 · 56.000 km · Branca', price: 'R$ 69.999,00' },
  { title: 'Yamaha Lander 250', meta: '2023 · 23.218 km · Vermelho', price: 'R$ 25.300,00' },
  { title: 'Honda Pop', meta: '660 km · Branca com banco vermelho', price: 'R$ 13.700,00' },
  { title: 'Yamaha Crosser', meta: 'Vermelha e preta', price: 'R$ 17.500,00' },
  { title: 'Fiat Strada', meta: '2016 · 89.000 km · Cinza-escuro', price: 'R$ 460.000,00' },
];

/** Retrato, quadrada, paisagem, panorâmica — e `null`, que é o que 9 das 16 fotos do estoque dão. */
const PROPORCOES = [4 / 3, 3 / 4, 1, 16 / 9, 2, null];

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
    logoAspect: null,
    ...overrides,
  };
}

/** Todos os blocos de texto da arte, para varrer invariantes de uma vez. */
function blocos(l: ArtLayout) {
  // A observação é o primeiro bloco a cair sob aperto, e aí ela vem `null`.
  return [l.badge, l.title, l.meta, l.priceLabel, l.price, l.phone, l.note].filter((b) => b !== null);
}

/**
 * Cada bloco com o peso e o espaçamento com que ele é de fato desenhado.
 *
 * Existe porque `Placed.width` é a largura **declarada** do bloco (a da coluna, ou a da placa), não
 * a do texto medido — então toda asserção de área segura feita sobre `x + width` é uma identidade
 * aritmética e não prova nada. O que prova é comparar o texto desenhado contra a caixa que ele diz
 * ocupar, e é isso que esta lista permite.
 */
function blocosMedidos(l: ArtLayout) {
  return [
    { nome: 'selo', bloco: l.badge, weight: 900, tracking: KICKER_TRACKING },
    { nome: 'titulo', bloco: l.title, weight: 900, tracking: 0 },
    { nome: 'dados', bloco: l.meta, weight: 400, tracking: 0 },
    { nome: 'rotulo do preco', bloco: l.priceLabel, weight: 900, tracking: PRICE_LABEL_TRACKING },
    { nome: 'preco', bloco: l.price, weight: 900, tracking: 0 },
    { nome: 'telefone', bloco: l.phone, weight: 900, tracking: 0 },
    ...(l.note ? [{ nome: 'observacao', bloco: l.note, weight: 400, tracking: 0 }] : []),
  ];
}

/** A largura que o Konva vai de fato desenhar para este bloco, tracking incluído. */
function larguraDesenhada({ bloco, weight, tracking }: ReturnType<typeof blocosMedidos>[number]) {
  return Math.max(...bloco.lines.map((linha) => measure(linha, bloco.size, weight) + tracking * linha.length));
}

/** Os blocos sólidos desenhados atrás do texto: pílula do selo e placa do preço. */
function fundos(l: ArtLayout) {
  return [l.badgePill, l.pricePlate];
}

/** `a` cabe inteiro dentro de `b`. */
function dentro(a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }) {
  return a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
}

describe('fitLines nunca descarta palavra', () => {
  it('devolve o texto inteiro mesmo quando nem o menor corpo cabe nas linhas pedidas', () => {
    const texto = 'Chevrolet S10 High Country 2.8 Turbo Diesel 4x4 Automatica Couro Multimidia';
    const { lines } = fitLines({ text: texto, maxWidth: 300, maxLines: 2, sizes: [60, 40], weight: 900, measure });
    expect(lines.join(' ')).toBe(texto);
    expect(lines.length).toBeGreaterThan(2);
  });

  it('não acrescenta reticências em hipótese nenhuma', () => {
    const { lines } = fitLines({ text: 'Palavra '.repeat(40).trim(), maxWidth: 200, maxLines: 1, sizes: [40, 20], weight: 900, measure });
    expect(lines.join(' ')).not.toContain('…');
  });

  it('usa o maior corpo que couber nas linhas pedidas', () => {
    const curto = fitLines({ text: 'Honda CG', maxWidth: 900, maxLines: 2, sizes: [76, 68, 60], weight: 900, measure });
    expect(curto.size).toBe(76);
    const longo = fitLines({ text: 'Volkswagen Saveiro Robust', maxWidth: 400, maxLines: 2, sizes: [76, 68, 60], weight: 900, measure });
    expect(longo.size).toBeLessThan(76);
  });

  it('parte palavra que sozinha não cabe, em vez de estourar a largura', () => {
    const { lines } = fitLines({ text: 'Supercalifragilisticoexpialidoso', maxWidth: 120, maxLines: 9, sizes: [40], weight: 900, measure });
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line, 40, 900)).toBeLessThanOrEqual(120);
  });
});

describe('a foto aparece inteira e o fundo sangra', () => {
  it.each(DESTINATION_ORDER)('%s: a foto aparece inteira e o fundo sangra', (id) => {
    for (const aspect of PROPORCOES) {
      const l = layoutArt(id, conteudo({ photoAspect: aspect }), measure);
      const spec = destinationSpec(id);
      if (l.fit.mode === 'contain') {
        expect(l.fit.backdrop).toEqual({ x: 0, y: 0, width: spec.width, height: spec.height });
        // "Inteira" é o ponto: a foto desenhada mantém a proporção da original.
        expect(l.fit.photo.width / l.fit.photo.height).toBeCloseTo(aspect ?? 4 / 3, 2);
        // E inteira também quer dizer dentro da peça: nada de veículo decapitado pela borda.
        expect(l.fit.photo.x).toBeGreaterThanOrEqual(0);
        expect(l.fit.photo.y).toBeGreaterThanOrEqual(0);
        expect(l.fit.photo.x + l.fit.photo.width).toBeLessThanOrEqual(spec.width);
        expect(l.fit.photo.y + l.fit.photo.height).toBeLessThanOrEqual(spec.height);
      } else {
        expect(l.fit.backdrop).toBeNull();
        expect(l.fit.photo.width).toBeGreaterThanOrEqual(spec.width);
        expect(l.fit.photo.height).toBeGreaterThanOrEqual(spec.height);
      }
    }
  });

  it('a foto 4:3 do estoque usa fundo desfocado em todo destino vertical', () => {
    // É o caso dominante: 7 de 7 fotos com dimensão no banco são 1600x1200.
    for (const id of ['story', 'whatsapp', 'tiktok'] as const) {
      expect(layoutArt(id, conteudo({ photoAspect: 4 / 3 }), measure).fit.mode).toBe('contain');
    }
  });

  it('foto de proporção próxima à da tela dispensa o desfoque', () => {
    expect(layoutArt('story', conteudo({ photoAspect: 1080 / 1920 }), measure).fit.mode).toBe('cover');
  });

  it('foto de celular em retrato nunca é recortada: é o caso difícil do spec', () => {
    // §4.2 e §11: "aparece sempre inteira, nunca cortada". Uma 3:4 num 9:16 perde 25% da largura
    // se cair em `cover`, e é exatamente o risco que o §11 chama de caso difícil. Sem esta linha,
    // afrouxar `COVER_TOLERANCE` não quebra nada.
    for (const id of ['story', 'whatsapp', 'tiktok'] as const) {
      expect(layoutArt(id, conteudo({ photoAspect: 3 / 4 }), measure).fit.mode).toBe('contain');
    }
  });

  it('a maior parte da foto fica acima do véu, não enterrada sob ele', () => {
    // A versão da invariante de herói que mede **foto visível**, não pixels de foto. A conta por
    // área bruta é satisfeita por uma foto inteira debaixo do degradê: 42% da peça "é foto" e o
    // veículo não aparece.
    for (const id of DESTINATION_ORDER) {
      const spec = destinationSpec(id);
      const l = layoutArt(id, conteudo({ photoAspect: 4 / 3 }), measure);
      const visivel = l.fit.photo.width * Math.max(0, l.scrim.y - l.fit.photo.y);
      expect(visivel / (spec.width * spec.height), `${id}: fração da peça`).toBeGreaterThan(0.30);
      expect(visivel / (l.fit.photo.width * l.fit.photo.height), `${id}: fração da foto`)
        .toBeGreaterThan(0.6);
    }
  });

  it.each(DESTINATION_ORDER)('%s: a foto é enquadrada na região livre e o clamp só empurra para dentro', (id) => {
    // O que o ruling negociou: a região entre a base da logo e o topo do véu não limita o tamanho
    // da foto, ela decide a altura em que a foto é centralizada. Sem isto, nada distingue a decisão
    // de "colar no topo" ou "colar na base".
    const spec = destinationSpec(id);
    const l = layoutArt(id, conteudo({ photoAspect: 4 / 3 }), measure);
    const { photo } = l.fit;
    const livre = { top: l.logo.y + l.logo.height, bottom: l.scrim.y };
    const ideal = (livre.top + livre.bottom) / 2 - photo.height / 2;
    if (ideal >= 0 && ideal + photo.height <= spec.height) {
      // Cabe inteira no lugar ideal: o enquadramento na região livre é simétrico.
      expect(photo.y - livre.top).toBeCloseTo(livre.bottom - (photo.y + photo.height), 0);
    } else {
      // Não cabe: encosta na borda que a prendeu, e nunca atravessa nenhuma das duas.
      expect(photo.y === 0 || photo.y + photo.height === spec.height).toBe(true);
    }
    expect(photo.y).toBeGreaterThanOrEqual(0);
    expect(photo.y + photo.height).toBeLessThanOrEqual(spec.height);
  });

  it('sem proporção de foto conhecida a peça ainda se compõe', () => {
    const l = layoutArt('story', conteudo({ photoAspect: null }), measure);
    expect(l.fit.photo.width).toBeGreaterThan(0);
    expect(l.fit.photo.height).toBeGreaterThan(0);
  });

  it('a foto ocupa muito mais da peça do que ocupava antes', () => {
    // O defeito que motivou a reescrita: 9,7% a 27,6% medidos no layout antigo.
    for (const id of DESTINATION_ORDER) {
      const spec = destinationSpec(id);
      const l = layoutArt(id, conteudo({ photoAspect: 4 / 3 }), measure);
      const fracao = (l.fit.photo.width * l.fit.photo.height) / (spec.width * spec.height);
      expect(fracao).toBeGreaterThan(0.38);
    }
  });

  it('o texto não empurra mais a foto: ela é a mesma com título curto e com título longo', () => {
    // A inversão de prioridade desta tarefa. Antes, duas linhas de título tomavam 60 px da foto;
    // agora quem absorve a sobra é o véu, que não custa nada.
    const curto = layoutArt('story', conteudo({ title: 'Honda Biz' }), measure);
    const longo = layoutArt('story', conteudo({ title: 'Volkswagen Saveiro Robust Cabine Dupla' }), measure);
    expect(longo.fit.photo.width).toBe(curto.fit.photo.width);
    expect(longo.fit.photo.height).toBe(curto.fit.photo.height);
    expect(longo.title.lines.join(' ')).toBe('Volkswagen Saveiro Robust Cabine Dupla');
  });

  it('proporção de foto degenerada não entrega peça sem veículo', () => {
    // `photoAspect` vem de `image.width / image.height` (ArtCanvas.tsx). Uma imagem que decodifica
    // com dimensão zero dá `0/0 = NaN`, e um `NaN` atravessa toda a geometria sem falhar em lugar
    // nenhum: o Konva não desenha a foto e a peça sai sem o veículo, em silêncio. Nove das dezesseis
    // fotos do estoque são importações antigas, que é justamente onde isso apareceria.
    for (const degenerado of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const l = layoutArt('story', conteudo({ photoAspect: degenerado }), measure);
      expect(Number.isFinite(l.fit.photo.width), `aspecto ${degenerado}`).toBe(true);
      expect(l.fit.photo.width).toBeGreaterThan(0);
      expect(l.fit.photo.height).toBeGreaterThan(0);
      expect(l.fit.photo.x).toBeGreaterThanOrEqual(0);
      expect(l.fit.photo.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('proporção de logo degenerada não entrega logo invertida nem invisível', () => {
    for (const degenerado of [0, -2, Number.NaN]) {
      const l = layoutArt('story', conteudo({ logoAspect: degenerado }), measure);
      expect(Number.isFinite(l.logo.width), `aspecto ${degenerado}`).toBe(true);
      expect(l.logo.width).toBeGreaterThan(0);
    }
  });
});

describe('o conteúdo respeita a área segura de cada destino', () => {
  it.each(DESTINATION_ORDER)('%s: o corpus real cabe na área segura', (id) => {
    const spec = destinationSpec(id);
    for (const caso of CORPUS) {
      const l = layoutArt(id, conteudo(caso), measure);
      for (const bloco of blocos(l)) {
        expect(bloco.x).toBeGreaterThanOrEqual(spec.safe.left);
        expect(bloco.x + bloco.width).toBeLessThanOrEqual(spec.width - spec.safe.right);
        expect(bloco.y).toBeGreaterThanOrEqual(spec.safe.top);
        expect(bloco.y + bloco.height).toBeLessThanOrEqual(spec.height - spec.safe.bottom);
      }
    }
  });

  it.each(DESTINATION_ORDER)('%s: a pílula e a placa também ficam na área segura', (id) => {
    const spec = destinationSpec(id);
    for (const caso of CORPUS) {
      const l = layoutArt(id, conteudo(caso), measure);
      for (const fundo of fundos(l)) {
        expect(fundo.x).toBeGreaterThanOrEqual(spec.safe.left);
        expect(fundo.x + fundo.width).toBeLessThanOrEqual(spec.width - spec.safe.right);
        expect(fundo.y).toBeGreaterThanOrEqual(spec.safe.top);
        expect(fundo.y + fundo.height).toBeLessThanOrEqual(spec.height - spec.safe.bottom);
      }
    }
  });

  it('a logo entra na medição e cabe na área segura', () => {
    // Hoje `logo.width` é 0 e nenhum teste confere se a marca cabe.
    for (const id of DESTINATION_ORDER) {
      const spec = destinationSpec(id);
      const l = layoutArt(id, conteudo({ logoAspect: 4.2 }), measure);
      // Derivada da proporção, não um número qualquer maior que zero: o defeito que esta tarefa
      // veio corrigir era `width: 0`, e prender só o zero deixa passar uma logo de 1 px.
      expect(l.logo.width).toBeCloseTo(l.logo.height * 4.2, 0);
      expect(l.logo.x + l.logo.width).toBeLessThanOrEqual(spec.width - spec.safe.right);
      expect(l.logo.y).toBeGreaterThanOrEqual(spec.safe.top);
    }
  });

  it('sem a proporção da logo carregada ela ainda é medida e ainda cabe', () => {
    for (const id of DESTINATION_ORDER) {
      const spec = destinationSpec(id);
      const l = layoutArt(id, conteudo({ logoAspect: null }), measure);
      // O recuo é a proporção dos arquivos em `public/`: 800×376.
      expect(l.logo.width).toBeCloseTo(l.logo.height * (800 / 376), 0);
      expect(l.logo.x + l.logo.width).toBeLessThanOrEqual(spec.width - spec.safe.right);
    }
  });

  it('as margens laterais da coluna são iguais entre si', () => {
    for (const id of DESTINATION_ORDER) {
      const spec = destinationSpec(id);
      const { column } = layoutArt(id, conteudo(), measure);
      const esquerda = column.x - spec.safe.left;
      const direita = (spec.width - spec.safe.right) - (column.x + column.width);
      expect(esquerda).toBeCloseTo(direita, 0);
    }
  });

  it.each(DESTINATION_ORDER)('%s: o texto desenhado cabe na caixa que ele diz ocupar', (id) => {
    // A asserção que as outras não fazem. `x + width` com `width` da coluna é identidade: passa com
    // o texto vazando por cima da borda. Esta compara o desenhado contra o declarado, e é a única
    // que pega tracking esquecido na conta da pílula ou largura errada alimentando o preço.
    for (const caso of CORPUS) {
      for (const selo of artBadges) {
        const l = layoutArt(id, conteudo({ ...caso, kicker: selo.heading }), measure);
        for (const alvo of blocosMedidos(l)) {
          expect(larguraDesenhada(alvo), `${id} / ${selo.id} / ${alvo.nome}`)
            .toBeLessThanOrEqual(alvo.bloco.width);
        }
      }
    }
  });

  it('o preço de carro mais alto cabe na placa do TikTok', () => {
    const l = layoutArt('tiktok', conteudo({ price: 'R$ 460.000,00' }), measure);
    expect(l.price.lines).toHaveLength(1);
    expect(l.price.x + l.price.width).toBeLessThanOrEqual(l.pricePlate.x + l.pricePlate.width);
  });

  it('o preço cabe na placa **medido**, não só declarado, mesmo acima do estoque de hoje', () => {
    // 'R$ 1.460.000,00' está de propósito acima de qualquer preço do estoque atual: a placa é a
    // caixa mais estreita da peça, e é a largura que alimenta `fitLines` que está sendo presa aqui.
    // Com a largura errada, o preço escolhe um corpo que cabe na coluna e vaza da placa vermelha.
    for (const id of DESTINATION_ORDER) {
      const l = layoutArt(id, conteudo({ price: 'R$ 1.460.000,00' }), measure);
      const alvo = blocosMedidos(l).find((b) => b.nome === 'preco')!;
      expect(larguraDesenhada(alvo), id).toBeLessThanOrEqual(l.price.width);
      expect(l.price.width).toBeLessThanOrEqual(l.pricePlate.width);
    }
  });

  it('o TikTok reserva a coluna de ícones à direita e o rodapé da legenda', () => {
    // É o que impede a arte de competir com curtir, comentar e compartilhar.
    expect(destinationSpec('tiktok').safe.right).toBeGreaterThan(destinationSpec('story').safe.right);
    expect(destinationSpec('tiktok').safe.bottom).toBeGreaterThan(destinationSpec('story').safe.bottom);
    const tiktok = layoutArt('tiktok', conteudo(), measure);
    const story = layoutArt('story', conteudo(), measure);
    expect(tiktok.column.width).toBeLessThan(story.column.width);
    expect(tiktok.note!.y + tiktok.note!.height).toBeLessThan(story.note!.y + story.note!.height);
  });
});

describe('o véu é que absorve a sobra', () => {
  it('o véu cobre toda a extensão vertical do texto', () => {
    for (const id of DESTINATION_ORDER) {
      const l = layoutArt(id, conteudo(), measure);
      const topoDoTexto = Math.min(...blocos(l).map((b) => b.y), l.badgePill.y);
      expect(l.scrim.y).toBeLessThanOrEqual(topoDoTexto);
      expect(l.scrim.y + l.scrim.height).toBeGreaterThanOrEqual(destinationSpec(id).height);
    }
  });

  it('sob qualquer linha de texto o véu chega a 0,82 de opacidade', () => {
    // §4.4 do spec: é o que mantém 4,5:1 mesmo sobre a foto mais clara do estoque.
    // Sem isto, "texto branco sobre foto" é aposta, não decisão.
    for (const id of DESTINATION_ORDER) {
      for (const caso of CORPUS) {
        const l = layoutArt(id, conteudo(caso), measure);
        for (const bloco of [...blocos(l), { y: l.badgePill.y }]) {
          expect(scrimAlphaAt(l.scrim, bloco.y)).toBeGreaterThanOrEqual(0.82);
        }
      }
    }
  });

  it('o véu cresce com o texto em vez de encolher a foto', () => {
    const curto = layoutArt('story', conteudo({ title: 'Honda Biz' }), measure);
    const longo = layoutArt('story', conteudo({ title: 'Volkswagen Saveiro Robust Cabine Dupla' }), measure);
    expect(longo.scrim.height).toBeGreaterThan(curto.scrim.height);
  });

  it('acima do véu não há escurecimento nenhum', () => {
    // O outro lado do piso de 0,82: se o véu já começasse opaco, a foto nasceria apagada.
    const l = layoutArt('story', conteudo(), measure);
    expect(scrimAlphaAt(l.scrim, l.scrim.y)).toBe(0);
    expect(scrimAlphaAt(l.scrim, l.scrim.y - 200)).toBe(0);
  });

  it('o véu termina opaco na borda de baixo', () => {
    const l = layoutArt('story', conteudo(), measure);
    expect(scrimAlphaAt(l.scrim, destinationSpec('story').height)).toBe(1);
  });
});

describe('os blocos sólidos contêm o texto que anunciam', () => {
  it.each(DESTINATION_ORDER)('%s: pílula e placa envolvem o próprio conteúdo', (id) => {
    const l = layoutArt(id, conteudo(), measure);
    // Texto estourando a pílula é pior que selo sem pílula: lê como erro, não como etiqueta.
    expect(dentro(l.badge, l.badgePill)).toBe(true);
    expect(dentro(l.priceLabel, l.pricePlate)).toBe(true);
    expect(dentro(l.price, l.pricePlate)).toBe(true);
  });

  it('a pílula acompanha o texto do selo em vez de ocupar a coluna inteira', () => {
    const curto = layoutArt('story', conteudo({ kicker: 'NOVO' }), measure);
    const longo = layoutArt('story', conteudo({ kicker: 'DESTAQUE DA SEMANA' }), measure);
    expect(curto.badgePill.width).toBeLessThan(longo.badgePill.width);
    expect(longo.badgePill.width).toBeLessThan(longo.column.width);
  });

  it('o preço domina o telefone com folga', () => {
    const l = layoutArt('story', conteudo(), measure);
    expect(l.price.size).toBeGreaterThanOrEqual(l.phone.size * 2);
  });
});

describe('a pilha de texto cresce para cima a partir da base da área segura', () => {
  it.each(DESTINATION_ORDER)('%s: a ordem de baixo para cima é a do spec', (id) => {
    const l = layoutArt(id, conteudo(), measure);
    // §4.2: observação, telefone, placa de preço, linha de dados, título, pílula do selo.
    const deBaixoParaCima = [l.note!.y, l.phone.y, l.pricePlate.y, l.meta.y, l.title.y, l.badgePill.y];
    for (let i = 1; i < deBaixoParaCima.length; i += 1) {
      expect(deBaixoParaCima[i]).toBeLessThan(deBaixoParaCima[i - 1]);
    }
  });

  it.each(DESTINATION_ORDER)('%s: o último bloco encosta na base da área segura', (id) => {
    const spec = destinationSpec(id);
    const l = layoutArt(id, conteudo(), measure);
    expect(l.note!.y + l.note!.height).toBe(spec.height - spec.safe.bottom);
  });
});

describe('somente os pesos 400 e 900', () => {
  it('nenhum bloco é medido em 700 nem em 800', () => {
    // Global Constraint do plano e §3.3.12 do spec: 400 e 900 são as duas únicas instâncias em
    // disco, e medir num peso que não é o desenhado é o defeito que a Tarefa 1 existe para matar.
    const pesos = new Set<number>();
    const espia: Measure = (text, size, weight) => { pesos.add(weight); return measure(text, size, weight); };
    for (const id of DESTINATION_ORDER) layoutArt(id, conteudo(), espia);
    expect([...pesos].sort((a, b) => a - b)).toEqual([400, 900]);
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
