/**
 * Onde cada coisa fica na arte — calculado, nunca cravado.
 *
 * **A foto deixou de ser o bloco elástico.** A versão anterior declarava que "quem cede é a
 * imagem, nunca o texto": o texto era empilhado do topo para baixo e a foto ficava com a sobra.
 * A regra protegia o texto, e isso era um ganho real contra as coordenadas fixas, mas a conta
 * medida na auditoria de 05/11 foi de 3,5% a 27,6% de foto numa arte de veículo — uma parede de
 * texto com um selo no meio.
 *
 * Aqui a prioridade se inverte uma segunda vez, e agora quem absorve a sobra **é o véu**: a foto
 * aparece inteira e do tamanho que a peça permite, sobre uma ampliação desfocada de si mesma que
 * sangra até as quatro bordas, e o bloco de texto é ancorado na base da área segura e cresce para
 * cima. Um título de duas linhas não tira nada da foto — ele escurece algumas dezenas de pixels a
 * mais de uma foto que já estava ali. Gradiente não custa nada; produto, sim.
 *
 * O que não mudou é a garantia de sempre: nenhuma palavra é descartada e nada vira reticências.
 */

import type { ArtDestination, DestinationSpec, SafeArea } from './destinations';
import { destinationSpec } from './destinations';

/**
 * A Archivo variável mais a "Archivo Fallback" com métrica compensada que o next/font gera. O
 * Konva só põe aspas em família com espaço e sem aspas, então as que já vêm aspeadas passam
 * intactas.
 */
export const ART_FONT_FAMILY = '"Archivo", "Archivo Fallback"';

/** Mede o texto como o Konva vai desenhá-lo. O peso importa: medir tudo como negrito superestima. */
export type Measure = (text: string, size: number, weight: number) => number;

/**
 * A área segura agora é propriedade do destino e mora em `destinations.ts`, junto do fantasma
 * que a desenha — uma fonte só, para que as duas não divirjam na primeira correção. Fica aqui o
 * reexport, porque quem já importava o tipo daqui não tem motivo para mudar.
 */
export type { SafeArea };

/**
 * Os dois únicos pesos que a arte usa, porque são as duas únicas instâncias da Archivo em disco
 * (`Archivo-Regular.ttf` e `Archivo-Black.ttf`). O layout anterior pedia 700 e 800, que o Konva
 * resolvia como `bold` — ou seja, desenhava num peso que a medição não conhecia. Medir o que não
 * se desenha foi a causa de 674 testes verdes conviverem com texto estourando a área segura.
 */
const WEIGHT = { regular: 400, black: 900 } as const;

export type FitInput = {
  text: string;
  maxWidth: number;
  /** Acima disto o corpo diminui. Nunca é motivo para cortar. */
  maxLines: number;
  /** Do maior para o menor. */
  sizes: readonly number[];
  weight: number;
  measure: Measure;
};

/** Quebra por medição, na fronteira de palavra; só parte palavra que sozinha não cabe. */
function wrapByWidth(text: string, size: number, maxWidth: number, weight: number, measure: Measure): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const attempt = current ? `${current} ${word}` : word;
    if (measure(attempt, size, weight) <= maxWidth) { current = attempt; continue; }
    if (current) { lines.push(current); current = ''; }
    if (measure(word, size, weight) <= maxWidth) { current = word; continue; }
    for (const char of word) {
      if (current && measure(current + char, size, weight) > maxWidth) { lines.push(current); current = ''; }
      current += char;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * Maior corpo em que o texto cabe em `maxLines`. Se nem o menor couber, devolve o menor **com
 * todas as linhas** — o texto sai inteiro e o véu cresce com ele. Em nenhuma hipótese esta função
 * descarta palavra.
 */
export function fitLines({ text, maxWidth, maxLines, sizes, weight, measure }: FitInput):
  { size: number; lines: readonly string[] } {
  for (const size of sizes) {
    const lines = wrapByWidth(text, size, maxWidth, weight, measure);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrapByWidth(text, size, maxWidth, weight, measure) };
}

export type ArtContent = {
  /** Marca e modelo. A versão do veículo não entra: arte de rede se lê em meio segundo. */
  title: string;
  /** Ano, quilometragem e cor numa linha só. */
  meta: string;
  kicker: string;
  priceLabel: string;
  price: string;
  phone: string;
  note: string;
  /** Largura dividida pela altura da foto escolhida; `null` quando ainda não carregou. */
  photoAspect: number | null;
  /**
   * O mesmo para a logo da loja. Entrou no conteúdo porque sem ela a logo era medida com
   * `width: 0` e nenhum teste conferia se a marca cabia na área segura.
   */
  logoAspect: number | null;
};

export type Placed = { x: number; y: number; width: number; height: number; size: number; lines: readonly string[] };
export type Frame = { x: number; y: number; width: number; height: number };

/**
 * Como a foto ocupa a peça.
 *
 * `cover` é o caminho curto: a proporção da foto já é parecida com a da tela, então ela preenche
 * tudo sem fundo nenhum e sem perder quase nada nas beiradas. `contain` é o caminho **principal**,
 * não o de exceção: todas as 7 fotos com dimensão no banco são 1600×1200, e três dos quatro
 * destinos são 9:16 — um `cover` de 4:3 num 9:16 descartaria uns 58% da largura e entregaria o
 * meio do veículo e nada mais. Então a foto aparece inteira e o `backdrop` é ela mesma, ampliada
 * e desfocada, sangrando até as bordas.
 */
export type PhotoFit = { mode: 'cover' | 'contain'; backdrop: Frame | null; photo: Frame };

/**
 * Uma parada da rampa de opacidade do véu. `offset` é a fração da altura do véu, de 0 no topo a 1
 * na borda de baixo da peça.
 *
 * As paradas saíram do componente de desenho e viraram dado porque é a única forma de o piso de
 * contraste do §4.4 do spec — 0,82 de opacidade composta sob qualquer linha de texto — ser provado
 * por teste em vez de por olho. Com a rampa escondida no `<Rect>`, "texto branco sobre foto" é
 * aposta; aqui é conta conferida.
 */
export type ScrimStop = { offset: number; alpha: number };

export type Scrim = { y: number; height: number; stops: readonly ScrimStop[] };

export type ArtLayout = {
  spec: DestinationSpec;
  column: { x: number; width: number };
  logo: Frame;
  fit: PhotoFit;
  scrim: Scrim;
  /** Fundo sólido do selo. O selo sem pílula vira legenda da logo em vez de etiqueta do anúncio. */
  badgePill: Frame;
  badge: Placed;
  title: Placed;
  meta: Placed;
  /** Placa do preço. É o que faz o preço vencer o telefone sem precisar de corpo maior. */
  pricePlate: Frame;
  priceLabel: Placed;
  price: Placed;
  phone: Placed;
  /** A observação é a linha mais dispensável da peça: sem texto, o bloco não existe. */
  note: Placed | null;
};

/**
 * Respiro acima de cada bloco, por hierarquia e não por régua única. O que separa assuntos respira
 * mais; o que pertence ao mesmo assunto cola. Telefone e observação são um rodapé só, por isso o 6.
 * Espaçamento uniforme é o que faz uma peça parecer montada em vez de desenhada.
 *
 * `price` é o único que não separa blocos: ele mora dentro da placa, entre o rótulo e o valor.
 */
const GAP = { title: 16, meta: 14, plate: 30, phone: 28, note: 6, price: 4 } as const;

const LOGO_HEIGHT = 108;
/**
 * A proporção dos arquivos em `public/` (800×376), para quando a imagem ainda não carregou. Sem
 * isto a logo seria medida com largura zero, que é como ela passava por qualquer área segura.
 */
const LOGO_ASPECT_FALLBACK = 800 / 376;

const BADGE_PAD = { x: 20, y: 11 } as const;
const PLATE_PAD = { x: 26, y: 22 } as const;

/** O Konva soma o espaçamento depois de cada caractere; o cálculo da pílula tem de somar também. */
export const KICKER_TRACKING = 2.2;
export const PRICE_LABEL_TRACKING = 1.6;

/**
 * Recuo da coluna de conteúdo dentro da caixa segura. Hoje é zero: a caixa segura já é a margem,
 * e no TikTok cada pixel de largura conta — é lá que "R$ 460.000,00" a 900 disputa a coluna mais
 * estreita das quatro. A fórmula de centralização fica explícita de propósito, porque é ela que
 * mantém as duas margens iguais se um dia a coluna encolher, e é ela que, no TikTok, desloca o
 * conteúdo para a esquerda junto com a caixa segura assimétrica (l120 r180) — contra a trilha de
 * ícones da direita.
 */
const COLUMN_INSET = 0;

/**
 * Quando a proporção da foto está a menos disto da proporção da peça, `cover` sem fundo. Fora
 * disso, a foto inteira sobre o fundo desfocado. 15% é onde uma foto de celular em retrato num
 * 9:16 cai de um lado e uma 4:3 de câmera cai do outro.
 */
export const COVER_TOLERANCE = 0.15;

/** O que o estoque real tem quando o banco não registrou dimensão: 1600×1200. */
const FALLBACK_PHOTO_ASPECT = 4 / 3;

/** Quanto o véu sobe acima do bloco de texto, em frações da altura dele (§4.2 do spec: ~1,35×). */
const SCRIM_RISE = 0.35;
/** §4.4 do spec: o piso que mantém 4,5:1 de texto branco sobre a foto mais clara do estoque. */
const SCRIM_FLOOR = 0.82;
/** O piso é alcançado estes pixels **antes** da primeira linha, não em cima dela. */
const SCRIM_LEAD = 12;

const tracked = (lines: readonly string[], size: number, weight: number, tracking: number, measure: Measure) =>
  Math.max(...lines.map((line) => measure(line, size, weight) + tracking * line.length));

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * A opacidade composta do véu na altura `y` da peça, interpolando a rampa.
 *
 * É o que torna o piso de contraste verificável: `scrimAlphaAt(l.scrim, bloco.y) >= 0.82` é uma
 * afirmação sobre o que a pessoa vê, não sobre o que o código pretendia.
 */
export function scrimAlphaAt(scrim: Scrim, y: number): number {
  const { stops } = scrim;
  if (!stops.length || scrim.height <= 0) return 0;
  const offset = clamp((y - scrim.y) / scrim.height, 0, 1);
  if (offset <= stops[0].offset) return stops[0].alpha;
  for (let i = 1; i < stops.length; i += 1) {
    const anterior = stops[i - 1];
    const atual = stops[i];
    if (offset > atual.offset) continue;
    const vao = atual.offset - anterior.offset;
    const t = vao <= 0 ? 1 : (offset - anterior.offset) / vao;
    return anterior.alpha + (atual.alpha - anterior.alpha) * t;
  }
  return stops[stops.length - 1].alpha;
}

export function layoutArt(destination: ArtDestination, content: ArtContent, measure: Measure): ArtLayout {
  const spec = destinationSpec(destination);
  const safeWidth = spec.width - spec.safe.left - spec.safe.right;
  const width = safeWidth - COLUMN_INSET * 2;
  const x = spec.safe.left + (safeWidth - width) / 2;
  const bottom = spec.height - spec.safe.bottom;
  const plateWidth = width - PLATE_PAD.x * 2;

  const badge = fitLines({ text: content.kicker, maxLines: 1, sizes: [26, 24, 22], weight: WEIGHT.black, measure,
    maxWidth: width - BADGE_PAD.x * 2 - KICKER_TRACKING * content.kicker.length });
  const title = fitLines({ text: content.title, maxWidth: width, maxLines: 2, sizes: [76, 68, 60, 54, 48], weight: WEIGHT.black, measure });
  const meta = fitLines({ text: content.meta, maxWidth: width, maxLines: 1, sizes: [27, 25, 23], weight: WEIGHT.regular, measure });
  const priceLabel = fitLines({ text: content.priceLabel, maxLines: 1, sizes: [23, 21], weight: WEIGHT.black, measure,
    maxWidth: plateWidth - PRICE_LABEL_TRACKING * content.priceLabel.length });
  const price = fitLines({ text: content.price, maxWidth: plateWidth, maxLines: 1, sizes: [92, 84, 76, 68, 60], weight: WEIGHT.black, measure });
  // O telefone recuou de 46 para 38: na placa o preço já domina, e dois blocos no mesmo corpo
  // competiam em vez de se completarem.
  const phone = fitLines({ text: content.phone, maxWidth: width, maxLines: 1, sizes: [38, 34, 30], weight: WEIGHT.black, measure });
  const note = content.note.trim()
    ? fitLines({ text: content.note, maxWidth: width, maxLines: 2, sizes: [27, 25, 23, 21], weight: WEIGHT.regular, measure })
    : null;

  const lineBox = (fit: { size: number; lines: readonly string[] }, leading = 1.06) =>
    Math.ceil(fit.lines.length * fit.size * leading);

  const h = {
    badge: lineBox(badge),
    title: lineBox(title, 1.04),
    meta: lineBox(meta),
    priceLabel: lineBox(priceLabel),
    price: lineBox(price, 1.02),
    phone: lineBox(phone),
    note: note ? lineBox(note, 1.3) : 0,
  };
  const pillHeight = h.badge + BADGE_PAD.y * 2;
  const plateHeight = h.priceLabel + GAP.price + h.price + PLATE_PAD.y * 2;

  // A pilha é montada **de baixo para cima**, a partir da base da área segura: observação,
  // telefone, placa de preço, linha de dados, título, pílula do selo. É esta direção que faz o
  // texto crescer para dentro do véu em vez de para dentro da foto.
  let y = bottom;

  let noteAt: Placed | null = null;
  if (note) {
    y -= h.note;
    noteAt = { x, y, width, height: h.note, size: note.size, lines: note.lines };
    y -= GAP.note;
  }

  y -= h.phone;
  const phoneAt: Placed = { x, y, width, height: h.phone, size: phone.size, lines: phone.lines };
  y -= GAP.phone;

  y -= plateHeight;
  const pricePlate: Frame = { x, y, width, height: plateHeight };
  const priceLabelAt: Placed = { x: x + PLATE_PAD.x, y: y + PLATE_PAD.y, width: plateWidth,
    height: h.priceLabel, size: priceLabel.size, lines: priceLabel.lines };
  const priceAt: Placed = { x: x + PLATE_PAD.x, y: priceLabelAt.y + h.priceLabel + GAP.price,
    width: plateWidth, height: h.price, size: price.size, lines: price.lines };
  y -= GAP.plate;

  y -= h.meta;
  const metaAt: Placed = { x, y, width, height: h.meta, size: meta.size, lines: meta.lines };
  y -= GAP.meta;

  y -= h.title;
  const titleAt: Placed = { x, y, width, height: h.title, size: title.size, lines: title.lines };
  y -= GAP.title;

  y -= pillHeight;
  const badgePill: Frame = { x, y, height: pillHeight,
    width: Math.ceil(tracked(badge.lines, badge.size, WEIGHT.black, KICKER_TRACKING, measure)) + BADGE_PAD.x * 2 };
  const badgeAt: Placed = { x: x + BADGE_PAD.x, y: y + BADGE_PAD.y,
    width: badgePill.width - BADGE_PAD.x * 2, height: h.badge, size: badge.size, lines: badge.lines };

  const textTop = badgePill.y;

  // A logo é ancorada no topo da área segura e agora tem largura de verdade, derivada da proporção
  // da imagem. Presa à largura da coluna para que uma logo muito deitada não vaze de lado.
  const logoWidth = Math.min(width, LOGO_HEIGHT * (content.logoAspect ?? LOGO_ASPECT_FALLBACK));
  const logo: Frame = { x, y: spec.safe.top, width: logoWidth, height: LOGO_HEIGHT };

  // O véu começa acima do topo do texto e vai até a borda de baixo da peça. O piso de 0,82 é o que
  // fixa quão cedo a rampa precisa começar; a forma dela entre o piso e a borda é escolha daqui.
  const blockHeight = bottom - textTop;
  const scrimY = Math.max(0, textTop - Math.round(SCRIM_RISE * blockHeight));
  const scrimHeight = spec.height - scrimY;
  const floorOffset = clamp((textTop - SCRIM_LEAD - scrimY) / scrimHeight, 0, 1);
  const scrim: Scrim = {
    y: scrimY,
    height: scrimHeight,
    stops: floorOffset > 0
      ? [{ offset: 0, alpha: 0 }, { offset: floorOffset, alpha: SCRIM_FLOOR }, { offset: 1, alpha: 1 }]
      // Bloco de texto tão baixo que não sobra rampa: o véu já nasce no piso.
      : [{ offset: 0, alpha: SCRIM_FLOOR }, { offset: 1, alpha: 1 }],
  };

  return { spec, column: { x, width }, logo, fit: fitPhoto(spec, content.photoAspect, logo, scrim),
    scrim, badgePill, badge: badgeAt, title: titleAt, meta: metaAt,
    pricePlate, priceLabel: priceLabelAt, price: priceAt, phone: phoneAt, note: noteAt };
}

/**
 * A geometria da foto. O tamanho dela **não depende do texto** — é a inversão que esta reescrita
 * existe para fazer. O que o texto move é só a altura em que a foto é centralizada, porque o véu
 * subiu.
 */
function fitPhoto(spec: DestinationSpec, photoAspect: number | null, logo: Frame, scrim: Scrim): PhotoFit {
  const aspect = photoAspect ?? FALLBACK_PHOTO_ASPECT;
  const canvasAspect = spec.width / spec.height;

  if (Math.abs(aspect / canvasAspect - 1) <= COVER_TOLERANCE) {
    // Proporção parecida com a da peça: preenche tudo, sem fundo e sem perder quase nada.
    const width = Math.max(spec.width, spec.height * aspect);
    const height = width / aspect;
    return { mode: 'cover', backdrop: null,
      photo: { x: (spec.width - width) / 2, y: (spec.height - height) / 2, width, height } };
  }

  // A foto inteira, na maior escala que caiba na peça — para a 4:3 do estoque isso é a largura
  // cheia, que é o que dá os ~42% de área num 9:16 e ~60% num 4:5 do §4.1 do spec.
  const width = Math.min(spec.width, spec.height * aspect);
  const height = width / aspect;
  // Centralizada na região livre entre a base da logo e o topo do véu, e **presa dentro da peça**:
  // a foto é o herói e nunca sai cortada, nem quando a região livre é menor que ela. O que fica
  // sob o véu segue sendo foto, não tarja.
  const livre = { top: logo.y + logo.height, bottom: scrim.y };
  const y = clamp((livre.top + livre.bottom) / 2 - height / 2, 0, spec.height - height);
  return {
    mode: 'contain',
    backdrop: { x: 0, y: 0, width: spec.width, height: spec.height },
    photo: { x: (spec.width - width) / 2, y, width, height },
  };
}

/** Linha única com o que o cadastro tem. Campo vazio não vira separador solto. */
export function buildMetaLine(year: number | null, mileageKm: number | null, color: string | null): string {
  const parts = [
    year ? String(year) : null,
    mileageKm !== null && mileageKm > 0 ? `${mileageKm.toLocaleString('pt-BR')} km` : null,
    color?.trim() || null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Consulte os detalhes';
}
