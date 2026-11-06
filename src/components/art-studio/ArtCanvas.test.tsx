import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ArtCanvasDefault, { ArtScene, artContentFor, drawBackdrop, scrimColorStops,
  BACKDROP_BLUR } from './ArtCanvas';
import { layoutArt, scrimAlphaAt, type ArtContent, type ArtLayout } from './art-layout';
import { createArchivoMeasure } from './measure-archivo';
import { artBadges } from './templates';
import { BRAND } from '@/data/brand';

/**
 * O contrato de **medição e de desenho** do ArtCanvas.
 *
 * Os dois primeiros testes (`o ArtCanvas mede o que desenha`) nasceram na revisão das Tarefas 1-4 e
 * sobreviveram à reescrita da Tarefa 7 de propósito: as varreduras que o brief da Tarefa 7 planejou
 * (`/fontStyle=["'{]?\s*['"]?bold/` e `/\b(700|800)\b/`) **não pegam** o defeito que eles pegam,
 * porque a string `'bold'` do `measureText` não casa com nenhuma das duas.
 *
 * O defeito: a Archivo entra por `next/font/google` como fonte variável 400-900, então `bold` no
 * atalho `font` do canvas instancia **wght 700**, enquanto a fixture que os testes usam foi
 * extraída do `Archivo-Black.ttf` (**900**). As duas instâncias diferem 6% na largura, e agora que
 * o desenho é em 900 a sub-medição seria o erro perigoso: um título de 936 px desenharia 995, ou
 * seja 59 px fora da área segura — o objetivo nº 1 do spec.
 *
 * O resto do arquivo é desenho. O happy-dom não dá contexto 2D e o Konva não monta sem ele, mas
 * isso **não** obriga a varrer texto do fonte: `ArtScene`, `drawBackdrop`, `scrimColorStops` e
 * `artContentFor` são puros e exportados exatamente para que a ordem do palco, o desfoque, a rampa
 * do véu e as regras de situação do cadastro sejam afirmadas por comportamento. As varreduras ficam
 * só onde não há como observar: as linhas do arquivo que o §7 do spec manda não regredir.
 */

const measure = createArchivoMeasure();
const fonte = () => readFileSync('src/components/art-studio/ArtCanvas.tsx', 'utf8');

/** Uma imagem de verdade não é necessária: o palco só precisa do objeto e da proporção. */
const imagem = (width: number, height: number) =>
  ({ width, height }) as unknown as HTMLImageElement;

const FOTO_4_3 = imagem(1600, 1200);
const LOGO = imagem(800, 376);

function conteudo(overrides: Partial<ArtContent> = {}): ArtContent {
  return {
    title: 'Honda CG 160 Titan',
    meta: '2019 · 42.380 km · Preta',
    badge: 'RECÉM-CHEGADO',
    priceLabel: 'PREÇO DO ANÚNCIO',
    price: 'R$ 18.900,00',
    phone: '(85) 99636-5664',
    note: 'Consulte disponibilidade e condições',
    status: 'published',
    photoAspect: 1600 / 1200,
    logoAspect: 800 / 376,
    ...overrides,
  };
}

const deitar = (overrides: Partial<ArtContent> = {}): ArtLayout =>
  layoutArt('story', conteudo(overrides), measure);

type Elemento = { type: unknown; props: Record<string, unknown> };

const ehElemento = (valor: unknown): valor is Elemento =>
  typeof valor === 'object' && valor !== null && '$$typeof' in valor && 'props' in valor;

/**
 * Achata a árvore de elementos na ordem em que o Konva vai desenhá-la, expandindo os componentes
 * puros como o React faria. É o que torna a ordem do palco observável sem renderizador — e se
 * algum dia um componente do palco passar a usar hooks, isto estoura em vez de mentir.
 */
function achatar(no: unknown, saida: Elemento[] = []): Elemento[] {
  if (Array.isArray(no)) { for (const filho of no) achatar(filho, saida); return saida; }
  if (!ehElemento(no)) return saida;
  saida.push(no);
  if (typeof no.type === 'function') {
    achatar((no.type as (props: Record<string, unknown>) => unknown)(no.props), saida);
    return saida;
  }
  achatar((no.props as { children?: unknown }).children, saida);
  return saida;
}

const cenario = (layout: ArtLayout, opcoes: { photo?: HTMLImageElement | null; logo?: HTMLImageElement | null } = {}) =>
  achatar(ArtScene({ layout, brand: BRAND,
    photo: opcoes.photo === undefined ? FOTO_4_3 : opcoes.photo,
    logo: opcoes.logo === undefined ? LOGO : opcoes.logo }));

/** As formas que de fato entram no palco: os primitivos do Konva, sem os invólucros. */
const palco = (layout: ArtLayout, opcoes: { photo?: HTMLImageElement | null; logo?: HTMLImageElement | null } = {}) =>
  cenario(layout, opcoes).filter((no) => typeof no.type === 'string');

const nomes = (elementos: Elemento[]) =>
  elementos.map((no) => no.props.name).filter((nome): nome is string => typeof nome === 'string');

const acharNo = (elementos: Elemento[], nome: string) =>
  elementos.find((no) => no.props.name === nome);

describe('o ArtCanvas mede o que desenha', () => {
  it('mede no peso numérico pedido, não no atalho "bold"', () => {
    const linha = fonte().match(/measureContext\.font = .*/)?.[0] ?? '';
    expect(linha).not.toBe('');
    expect(linha).not.toMatch(/bold|normal/);
    expect(linha).toContain('${weight}');
  });

  it('carrega explicitamente os dois pesos que a arte usa', () => {
    // §7 do spec, "Remedição quando a fonte chega": antes só `bold 48px` era carregado, e a linha
    // de dados e a observação são desenhadas no peso normal — que o Konva quebra com a métrica
    // errada se a fonte ainda não chegou.
    const texto = fonte();
    expect(texto).toMatch(/fonts\.load\(`400 /);
    expect(texto).toMatch(/fonts\.load\(`900 /);
  });
});

describe('a ordem do palco', () => {
  it('põe o fundo embaixo, o véu entre a foto e o texto, e o texto por último', () => {
    // A ordem inteira, não um par solto: é ela que faz a foto aparecer sobre o fundo desfocado e
    // o texto sobre o véu. Qualquer troca de dois elementos quebra este teste.
    expect(nomes(palco(deitar()))).toEqual([
      'fundo', 'fundo-desfocado', 'foto', 'veu', 'veu-logo', 'logo',
      'selo-pilula', 'selo', 'titulo', 'dados',
      'placa', 'preco-rotulo', 'preco', 'telefone', 'observacao',
    ]);
  });

  it('a tarja de situação fica sob o véu e sobre a foto', () => {
    const ordem = nomes(palco(deitar({ status: 'sold' })));
    expect(ordem.indexOf('tarja')).toBeGreaterThan(ordem.indexOf('foto'));
    expect(ordem.indexOf('tarja-texto')).toBeGreaterThan(ordem.indexOf('tarja'));
    expect(ordem.indexOf('veu')).toBeGreaterThan(ordem.indexOf('tarja-texto'));
  });

  it('a marca d\'água de prévia é o último elemento do palco', () => {
    const ordem = nomes(palco(deitar({ status: 'draft' })));
    expect(ordem.at(-2)).toBe('marca-dagua');
    expect(ordem.at(-1)).toBe('marca-dagua-texto');
  });

  it('publicado não ganha tarja nem marca d\'água', () => {
    const ordem = nomes(palco(deitar()));
    for (const nome of ['tarja', 'tarja-texto', 'marca-dagua', 'marca-dagua-texto']) {
      expect(ordem).not.toContain(nome);
    }
  });

  it('o palco é feito só de formas do Konva — o fantasma não entra nele', () => {
    // O fantasma é overlay de DOM: dentro do palco ele vazaria para o JPEG publicado.
    const componentes = cenario(deitar())
      .filter((no) => typeof no.type === 'function')
      .map((no) => (no.type as { name: string }).name);
    expect(componentes).not.toContain('PlatformChrome');
    for (const no of palco(deitar())) {
      expect(['Rect', 'Text', 'Shape', 'Image'], String(no.props.name)).toContain(no.type as string);
    }
  });
});

describe('o desenho usa o que o layout mediu', () => {
  it('cada bloco de texto sai na posição, no corpo e com as linhas medidas', () => {
    const layout = deitar();
    const pares: [string, keyof ArtLayout][] = [
      ['selo', 'badge'], ['titulo', 'title'], ['dados', 'meta'],
      ['preco-rotulo', 'priceLabel'], ['preco', 'price'], ['telefone', 'phone'], ['observacao', 'note'],
    ];
    const elementos = palco(layout);
    for (const [nome, campo] of pares) {
      const no = acharNo(elementos, nome);
      const bloco = layout[campo] as { x: number; y: number; width: number; size: number; lines: readonly string[] };
      expect(no, nome).toBeDefined();
      expect(no!.props.x, nome).toBe(bloco.x);
      expect(no!.props.y, nome).toBe(bloco.y);
      expect(no!.props.width, nome).toBe(bloco.width);
      expect(no!.props.fontSize, nome).toBe(bloco.size);
      expect(no!.props.text, nome).toBe(bloco.lines.join('\n'));
    }
  });

  it('desenha somente nos pesos 400 e 900, que são os dois que existem em disco', () => {
    // A afirmação de comportamento: todo texto do palco, em toda situação do cadastro. A varredura
    // de fonte mais abaixo é o cinto; esta é a suspensória.
    for (const status of ['published', 'reserved', 'sold', 'draft', 'archived']) {
      const textos = palco(deitar({ status })).filter((no) => no.type === 'Text');
      expect(textos.length, status).toBeGreaterThan(5);
      for (const texto of textos) {
        expect(['400', '900'], `${status}/${String(texto.props.text).slice(0, 12)}`)
          .toContain(String(texto.props.fontStyle));
      }
    }
  });

  it('a pílula e a placa saem com a caixa que o layout calculou', () => {
    const layout = deitar();
    const pilula = acharNo(palco(layout), 'selo-pilula')!;
    expect([pilula.props.x, pilula.props.y, pilula.props.width, pilula.props.height])
      .toEqual([layout.badgePill.x, layout.badgePill.y, layout.badgePill.width, layout.badgePill.height]);
    const placa = acharNo(palco(layout), 'placa')!;
    expect([placa.props.x, placa.props.y, placa.props.width, placa.props.height])
      .toEqual([layout.pricePlate.x, layout.pricePlate.y, layout.pricePlate.width, layout.pricePlate.height]);
  });

  it('o que o teto de altura descartou não é desenhado', () => {
    // Sem isto, a nulidade de `meta` e `note` (Tarefas 4 e 5) sairia como texto "null" na peça — ou
    // estouraria a prévia. Os dois conteúdos abaixo são os de `art-layout.test.ts`: o primeiro
    // derruba a observação, o segundo derruba também a linha de dados. O Feed é o único destino em
    // que o teto morde, e o segundo título está acima de qualquer dado real de propósito.
    const META_LONGA = '2016 · 189.000 km · Branca com banco vermelho e teto preto';
    const NOTA_LONGA = 'Entrada facilitada, parcelas que cabem no bolso e avaliação do seu usado na hora';
    const TITULO_MAX = 'Chevrolet S10 High Country Cabine Dupla Turbo Diesel Automatica Couro Multimidia Teto Solar';
    const TITULO_ABSURDO = `${TITULO_MAX} Unico Dono Revisado Garantia de Fabrica Pneus Novos`;
    const exercitados = new Set<string>();
    for (const title of [TITULO_MAX, TITULO_ABSURDO]) {
      const apertado = layoutArt('feed', conteudo({ title, meta: META_LONGA, note: NOTA_LONGA }), measure);
      expect(apertado.dropped.length, title.length.toString()).toBeGreaterThan(0);
      const ordem = nomes(palco(apertado));
      for (const descartado of apertado.dropped) {
        exercitados.add(descartado);
        expect(ordem, descartado).not.toContain(descartado === 'note' ? 'observacao' : 'dados');
      }
      // O que não cede continua na peça: título, preço e telefone não cedem nunca.
      for (const nome of ['titulo', 'preco', 'telefone']) expect(ordem, nome).toContain(nome);
    }
    // Os dois descartes possíveis foram exercitados. Sem esta linha, o teste provaria um só e o
    // outro poderia ser desenhado nulo sem ninguém notar.
    expect([...exercitados].sort()).toEqual(['meta', 'note']);
  });

  it('a tarja e a marca d\'água saem na caixa medida, não em pixel cravado', () => {
    for (const [status, campo] of [['sold', 'statusBand'], ['draft', 'watermark']] as const) {
      const layout = deitar({ status });
      const faixa = layout[campo]!;
      const elementos = palco(layout);
      const moldura = acharNo(elementos, status === 'sold' ? 'tarja' : 'marca-dagua')!;
      const texto = acharNo(elementos, status === 'sold' ? 'tarja-texto' : 'marca-dagua-texto')!;
      expect([moldura.props.x, moldura.props.y, moldura.props.width, moldura.props.height])
        .toEqual([faixa.frame.x, faixa.frame.y, faixa.frame.width, faixa.frame.height]);
      expect(texto.props.text).toBe(faixa.text.lines.join('\n'));
      expect(texto.props.fontSize).toBe(faixa.text.size);
    }
  });
});

describe('a foto é a protagonista', () => {
  it('o fundo desfocado sangra até as quatro bordas e a foto inteira vem sobre ele', () => {
    const layout = deitar();
    expect(layout.fit.mode).toBe('contain');
    const elementos = palco(layout);
    const fundo = acharNo(elementos, 'fundo-desfocado')!;
    expect([fundo.props.x, fundo.props.y, fundo.props.width, fundo.props.height])
      .toEqual([0, 0, layout.spec.width, layout.spec.height]);
    const foto = acharNo(elementos, 'foto')!;
    expect([foto.props.x, foto.props.y, foto.props.width, foto.props.height])
      .toEqual([layout.fit.photo.x, layout.fit.photo.y, layout.fit.photo.width, layout.fit.photo.height]);
    expect(foto.props.image).toBe(FOTO_4_3);
  });

  it('quando a proporção já é a da peça, não há fundo desfocado para desenhar', () => {
    const layout = deitar({ photoAspect: 1080 / 1920 });
    expect(layout.fit.mode).toBe('cover');
    expect(nomes(palco(layout))).not.toContain('fundo-desfocado');
  });

  it('sem foto carregada, a peça avisa em vez de desenhar vazio', () => {
    const elementos = palco(deitar(), { photo: null });
    expect(nomes(elementos)).not.toContain('foto');
    expect(nomes(elementos)).not.toContain('fundo-desfocado');
    const aviso = acharNo(elementos, 'foto-ausente')!;
    expect(String(aviso.props.text)).toMatch(/foto/i);
  });

  it('sem a logo carregada, a marca sai escrita e não desaparece', () => {
    const elementos = palco(deitar(), { logo: null });
    expect(nomes(elementos)).not.toContain('logo');
    const reserva = acharNo(elementos, 'logo-reserva')!;
    expect(String(reserva.props.text).toUpperCase()).toContain('LIBERATO');
    expect(String(reserva.props.fontStyle)).toBe('900');
  });

  // O §4.2 pede "um véu suave e curto no topo dá leito à logo", e a logo é a versão **negativa**
  // (branca): sem véu ela desaparecia sobre céu claro ou lataria branca. Quando a marca sai escrita
  // em vez de desenhada, aquilo é linha de texto e vale a Global Constraint do véu ≥ 0,82 — o que o
  // layout entrega como opacidade maior, e aqui se confere que o desenho usa as paradas dele.
  // O componente não monta sob happy-dom (não há contexto 2D), e `dropped` só existe dentro dele:
  // esta é uma das poucas linhas que não há como observar por comportamento. O outro lado — a tela
  // mostrando o aviso — é afirmado em `ArtEditor.test.tsx`.
  it('devolve a quem chama o que o teto de altura deixou de fora', () => {
    const texto = fonte();
    expect(texto).toMatch(/onDropped\?:/);
    expect(texto).toMatch(/const descartados = L\.dropped\.join\(','\)/);
    expect(texto).toMatch(/onDropped\?\.\(descartados\)/);
  });

  it('o véu do topo usa as paradas que o layout calculou, e cobre a linha da marca escrita', () => {
    const layout = deitar();
    const veu = acharNo(palco(layout), 'veu-logo')!;
    expect(veu.props.fillLinearGradientColorStops)
      .toEqual(scrimColorStops(layout.logoScrim, BRAND.palette.scrim));
    expect(veu.props.y).toBe(layout.logoScrim.y);
    expect(veu.props.height).toBe(layout.logoScrim.height);
    // Largura cheia: o fundo da marca não é uma caixinha em volta da logo.
    expect(veu.props.width).toBe(layout.spec.width);

    const semLogo = layoutArt('story', conteudo({ logoAspect: null }), measure);
    const reserva = acharNo(palco(semLogo, { logo: null }), 'logo-reserva')!;
    expect(scrimAlphaAt(semLogo.logoScrim, Number(reserva.props.y))).toBeGreaterThanOrEqual(0.82);
  });
});

describe('o véu', () => {
  it('vai do transparente ao quase-preto da marca, com as paradas que o layout calculou', () => {
    const layout = deitar();
    const veu = acharNo(palco(layout), 'veu')!;
    const paradas = veu.props.fillLinearGradientColorStops as (number | string)[];
    expect(paradas).toEqual(scrimColorStops(layout.scrim, BRAND.palette.scrim));
    // Uma parada por `offset` do layout, na ordem, e cada cor é o quase-preto da marca com a
    // opacidade medida. Rampa cravada no desenho não passa daqui.
    expect(paradas.filter((item) => typeof item === 'number'))
      .toEqual(layout.scrim.stops.map((parada) => parada.offset));
    expect(paradas.at(-1)).toBe('rgba(10,14,19,1)');
    expect(paradas[1]).toBe('rgba(10,14,19,0)');
  });

  it('cobre a peça de ponta a ponta na horizontal e só a altura que o layout pediu', () => {
    const layout = deitar();
    const veu = acharNo(palco(layout), 'veu')!;
    expect([veu.props.x, veu.props.y, veu.props.width, veu.props.height])
      .toEqual([0, layout.scrim.y, layout.spec.width, layout.scrim.height]);
    expect(veu.props.fillLinearGradientStartPoint).toEqual({ x: 0, y: 0 });
    expect(veu.props.fillLinearGradientEndPoint).toEqual({ x: 0, y: layout.scrim.height });
  });

  it('converte opacidade em cor sem inventar hexadecimal', () => {
    expect(scrimColorStops({ y: 0, height: 100, stops: [{ offset: 0, alpha: 0 }, { offset: 1, alpha: 0.82 }] }, '#112233'))
      .toEqual([0, 'rgba(17,34,51,0)', 1, 'rgba(17,34,51,0.82)']);
  });
});

describe('o fundo desfocado', () => {
  const moldura = { x: 0, y: 0, width: 1080, height: 1920 };
  const foto = imagem(1600, 1200);

  /** Um contexto de mentira que registra a sequência exata de chamadas. */
  function contextoFalso({ comFiltro }: { comFiltro: boolean }) {
    const chamadas: string[] = [];
    const alvo: Record<string, unknown> = {
      drawImage: (...args: unknown[]) => { chamadas.push(`drawImage(${args.slice(1).join(',')})`); },
      set imageSmoothingEnabled(valor: boolean) { chamadas.push(`smoothing=${valor}`); },
    };
    if (comFiltro) {
      let filtro = 'none';
      Object.defineProperty(alvo, 'filter', {
        get: () => filtro,
        set: (valor: string) => { filtro = valor; chamadas.push(`filter=${valor}`); },
      });
    }
    return { contexto: alvo as never, chamadas };
  }

  function rascunhoFalso() {
    const chamadas: string[] = [];
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({
        drawImage: (...args: unknown[]) => { chamadas.push(`drawImage(${args.slice(1).join(',')})`); },
        imageSmoothingEnabled: false,
      }),
    };
    return { canvas: canvas as never, chamadas };
  }

  it('desfoca pelo filtro do contexto e devolve o contexto sem filtro', () => {
    const { contexto, chamadas } = contextoFalso({ comFiltro: true });
    drawBackdrop({ context: contexto, image: foto, frame: moldura, scratch: null });
    expect(chamadas).toEqual([
      `filter=blur(${BACKDROP_BLUR}px)`,
      'drawImage(0,0,1080,1920)',
      'filter=none',
    ]);
  });

  it('o desfoque é forte o bastante para a foto não se reconhecer no fundo', () => {
    // 48 px num 1080 de largura é ~4,4% da peça. Abaixo de uns 24 px o fundo lê como foto
    // duplicada e borrada, que é o visual de erro, não de profundidade.
    expect(BACKDROP_BLUR).toBeGreaterThanOrEqual(24);
  });

  it('sem filtro no contexto, reduz e reamplia em vez de entregar foto nítida', () => {
    const { contexto, chamadas } = contextoFalso({ comFiltro: false });
    const { canvas, chamadas: noRascunho } = rascunhoFalso();
    drawBackdrop({ context: contexto, image: foto, frame: moldura, scratch: canvas });
    // A foto entra no rascunho pequena…
    expect(noRascunho).toHaveLength(1);
    const reduzida = noRascunho[0].match(/drawImage\(0,0,(\d+),(\d+)\)/)!;
    expect(Number(reduzida[1])).toBeLessThan(moldura.width / 4);
    expect(Number(reduzida[2])).toBeLessThan(moldura.height / 4);
    // …e volta ampliada, cobrindo a peça inteira. Nenhuma chamada desenha a foto 1:1.
    const ampliacao = chamadas.find((chamada) => chamada.startsWith('drawImage'))!;
    expect(ampliacao).toBe(`drawImage(0,0,${reduzida[1]},${reduzida[2]},0,0,1080,1920)`);
    expect(chamadas.some((chamada) => chamada === 'drawImage(0,0,1080,1920)')).toBe(false);
    expect(chamadas).toContain('smoothing=true');
  });

  it('sem filtro e sem rascunho, ainda cobre a peça — fundo vazio é pior que fundo nítido', () => {
    const { contexto, chamadas } = contextoFalso({ comFiltro: false });
    drawBackdrop({ context: contexto, image: foto, frame: moldura, scratch: null });
    expect(chamadas).toContain('drawImage(0,0,1080,1920)');
  });

  it('não usa o blur em JavaScript do Konva', () => {
    // `Konva.Filters.Blur` é stack blur em JavaScript e custa segundos num iPhone sobre 1080×1920.
    const texto = fonte();
    expect(texto).not.toContain('Konva.Filters');
    expect(texto).toContain('context.filter');
  });
});

describe('a situação do cadastro decide o que a peça promete', () => {
  const base = { title: 'Honda CG 160 Titan', meta: '2019 · 42.380 km · Preta',
    price: 'R$ 18.900,00', phone: '(85) 99636-5664', note: '',
    photoAspect: null, logoAspect: null } as const;

  it('vendido não anuncia preço e a placa troca de rótulo', () => {
    // §7 do spec: nada aqui pode voltar a oferecer um veículo que já saiu. Estas duas linhas
    // viviam soltas dentro do desenho, sem teste nenhum segurando.
    const c = artContentFor({ ...base, status: 'sold', badge: 'sold' });
    expect(c.priceLabel).toBe('ESTOQUE LIBERATO');
    expect(c.price).not.toContain('18.900');
    expect(c.price).toBe('VEJA OUTRAS OPÇÕES');
    expect(c.badge).toBe('VENDIDO');
  });

  it('reservado mantém o preço e avisa que a disponibilidade é de outro', () => {
    const c = artContentFor({ ...base, status: 'reserved', badge: 'reserved' });
    expect(c.price).toBe('R$ 18.900,00');
    expect(c.priceLabel).toBe('PREÇO DO ANÚNCIO');
    expect(c.badge).toBe('RESERVADO');
    expect(c.note.toLowerCase()).toContain('disponibilidade');
  });

  it('publicado leva o rótulo do selo escolhido, e só ele', () => {
    for (const selo of artBadges) {
      const c = artContentFor({ ...base, status: 'published', badge: selo.id });
      expect(c.badge).toBe(selo.heading);
      expect(c.price).toBe('R$ 18.900,00');
    }
  });

  it('a observação digitada vence o texto de reserva', () => {
    const c = artContentFor({ ...base, note: 'Troco por moto menor', status: 'published', badge: 'new' });
    expect(c.note).toBe('Troco por moto menor');
  });

  it('a proporção da foto e a da logo atravessam intactas', () => {
    const c = artContentFor({ ...base, photoAspect: 4 / 3, logoAspect: 2, status: 'published', badge: 'new' });
    expect(c.photoAspect).toBe(4 / 3);
    expect(c.logoAspect).toBe(2);
  });
});

describe('o que o §7 do spec manda não regredir', () => {
  it('o palco toma a dimensão do destino, sem número cravado', () => {
    const texto = fonte();
    expect(texto).toMatch(/<Stage[^>]*width=\{width\}[^>]*height=\{height\}/);
    for (const n of ['1080', '1350', '1920']) expect(texto).not.toContain(n);
  });

  it('não desenha em peso que não existe em disco', () => {
    const texto = fonte();
    expect(texto).not.toMatch(/fontStyle=["'{]?\s*['"]?bold/);
    expect(texto).not.toMatch(/\b(700|800)\b/);
  });

  it('mantém o pixelRatio em 1 e a remedição quando a fonte chega', () => {
    const texto = fonte();
    expect(texto).toMatch(/Konva\.pixelRatio = 1/);
    // `font-display: swap` faz o Konva quebrar o texto com a métrica da fonte de reserva e não
    // refazer; a chave força a camada a remontar quando a Archivo chega.
    expect(texto).toContain('key={String(fontsReady)}');
  });

  it('mantém a busca da foto em duas tentativas e as mensagens de 403 e 502', () => {
    // Commits 4bd4a77 e 3138d40. Nenhum teste de outro arquivo cobre estas frases, e elas moram
    // aqui dentro — sem esta varredura a reescrita as apaga sem alarme.
    const texto = fonte();
    expect(texto).toContain('Sua sessão expirou. Entre novamente no painel.');
    expect(texto).toContain('A foto não está disponível no armazenamento. Tente recarregar.');
    expect(texto).toMatch(/attempt < 2/);
    expect(texto).toContain("credentials: 'same-origin'");
  });

  it('o fantasma não é montado dentro de uma camada do palco', () => {
    expect(fonte()).not.toMatch(/<Layer[\s\S]*PlatformChrome[\s\S]*<\/Layer>/);
  });

  it('o componente da prévia continua sendo o padrão do módulo', () => {
    expect(typeof ArtCanvasDefault).toBe('function');
  });
});
