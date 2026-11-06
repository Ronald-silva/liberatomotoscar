/**
 * Onde cada coisa fica na arte — calculado, nunca cravado.
 *
 * A versão anterior era uma lista de coordenadas absolutas por formato, e o conteúdo é variável:
 * título de tamanho imprevisível, preço de cinco ou seis dígitos, foto em pé ou deitada. Quando o
 * texto não cabia na caixa fixa, as únicas saídas eram encolher a fonte até o ilegível ou cortar a
 * frase. Pior: o mesmo conjunto de números servia Stories e TikTok, que têm interfaces diferentes
 * por cima da imagem.
 *
 * Aqui os blocos são empilhados em fluxo e medidos de verdade. **A foto é o bloco elástico**: ela
 * absorve o que sobra. Um título de duas linhas não corta nada — ele toma 60 px da foto. É a
 * inversão que importa: o texto nunca perde, porque quem cede é a imagem.
 */

import { artFormats, type ArtFormat } from './templates';

/**
 * A Archivo variável mais a "Archivo Fallback" com métrica compensada que o next/font gera. O
 * Konva só põe aspas em família com espaço e sem aspas, então as que já vêm aspeadas passam
 * intactas.
 */
export const ART_FONT_FAMILY = '"Archivo", "Archivo Fallback"';

/** Mede o texto como o Konva vai desenhá-lo. O peso importa: medir tudo como negrito superestima. */
export type Measure = (text: string, size: number, weight: number) => number;

export type SafeArea = { top: number; right: number; bottom: number; left: number };
export type FormatSpec = { width: number; height: number; safe: SafeArea };

/** As medidas do arquivo continuam em `templates.ts`; aqui mora só o que a interface da rede ocupa. */
export const ART_SAFE: Record<ArtFormat, SafeArea> = {
  story: { top: 250, right: 72, bottom: 300, left: 72 },
  tiktok: { top: 150, right: 180, bottom: 500, left: 72 },
  feed: { top: 56, right: 72, bottom: 56, left: 72 },
  // Mesmo post, mesma interface do feed: a margem larga que havia aqui era gosto, não segurança,
  // e só espremia o título numa tela que já é a mais baixa das quatro.
  square: { top: 56, right: 72, bottom: 56, left: 72 },
};

export function formatSpec(format: ArtFormat): FormatSpec {
  return { width: artFormats[format].width, height: artFormats[format].height, safe: ART_SAFE[format] };
}

/**
 * Área livre da interface de cada rede, para **publicação orgânica**.
 *
 * Nenhuma das plataformas publica mapa oficial em pixels: o que existe são guias de terceiros que
 * divergem entre si. Estes valores ficam na faixa em que as fontes concordam, com folga. São dados
 * de propósito — corrigir depois é trocar número, não reescrever layout.
 *
 * - Stories e status: topo com a foto do perfil, base com a caixa de resposta.
 * - TikTok: a coluna de curtir/comentar/compartilhar fica à direita, e o rodapé cresce com a
 *   legenda — por isso é a margem inferior mais generosa das três.
 * - Feed: não há interface sobreposta; a margem é estética, não de segurança.
 *
 * Anúncio pago pede bem mais espaço embaixo (o botão de CTA). Se a loja passar a impulsionar,
 * é aqui que se acrescenta a variante, sem tocar no resto.
 */

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
 * todas as linhas** — o texto sai inteiro e quem paga a conta é a foto, que é elástica. Em nenhuma
 * hipótese esta função descarta palavra.
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
};

export type Placed = { x: number; y: number; width: number; height: number; size: number; lines: readonly string[] };
export type Frame = { x: number; y: number; width: number; height: number };

export type ArtLayout = {
  spec: FormatSpec;
  column: { x: number; width: number };
  logo: Frame;
  /** Fundo sólido do selo. O selo sem pílula vira legenda da logo em vez de etiqueta do anúncio. */
  kickerPill: Frame;
  kicker: Placed;
  title: Placed;
  meta: Placed;
  /** Painel atrás da foto, na largura da coluna. A foto é centralizada dentro dele. */
  photoPanel: Frame;
  photo: Frame;
  /** Placa do preço. É o que faz o preço vencer o telefone sem precisar de corpo maior. */
  pricePlate: Frame;
  priceLabel: Placed;
  price: Placed;
  phone: Placed;
  note: Placed;
};

/**
 * Respiro entre blocos, por hierarquia e não por régua única. O que separa assuntos respira mais;
 * o que pertence ao mesmo assunto cola. Telefone e observação são um rodapé só, por isso o 6.
 * Espaçamento uniforme é o que faz uma peça parecer montada em vez de desenhada.
 */
const GAP = { kicker: 20, title: 14, meta: 14, photo: 34, plate: 34, price: 4, phone: 28, note: 6 } as const;
/** `price` mora dentro da placa; os demais separam blocos e são eles que cedem no aperto. */
const OUTER_GAPS = (['kicker', 'title', 'meta', 'photo', 'plate', 'phone', 'note'] as const);
const LOGO_HEIGHT = 108;
/** Abaixo disto a foto deixa de comunicar o veículo; antes de encolher mais, os respiros cedem. */
const MIN_PHOTO_HEIGHT = 260;
const KICKER_PAD = { x: 20, y: 11 } as const;
const PLATE_PAD = { x: 26, y: 22 } as const;
/** Margem do painel ao redor da foto, como o passe-partout de um quadro. */
const PHOTO_MAT = 14;
/** O Konva soma o espaçamento depois de cada caractere; o cálculo da pílula tem de somar também. */
export const KICKER_TRACKING = 2.2;
export const PRICE_LABEL_TRACKING = 1.6;

const tracked = (lines: readonly string[], size: number, weight: number, tracking: number, measure: Measure) =>
  Math.max(...lines.map((line) => measure(line, size, weight) + tracking * line.length));

export function layoutArt(format: ArtFormat, content: ArtContent, measure: Measure): ArtLayout {
  const spec = formatSpec(format);
  const x = spec.safe.left;
  const width = spec.width - spec.safe.left - spec.safe.right;
  const top = spec.safe.top;
  const bottom = spec.height - spec.safe.bottom;
  const plateWidth = width - PLATE_PAD.x * 2;

  const kicker = fitLines({ text: content.kicker, maxWidth: width - KICKER_PAD.x * 2 - KICKER_TRACKING * content.kicker.length, maxLines: 1, sizes: [26, 24, 22], weight: 700, measure });
  const title = fitLines({ text: content.title, maxWidth: width, maxLines: 2, sizes: [76, 68, 60, 54, 48], weight: 800, measure });
  const meta = fitLines({ text: content.meta, maxWidth: width, maxLines: 1, sizes: [27, 25, 23], weight: 400, measure });
  const priceLabel = fitLines({ text: content.priceLabel, maxWidth: plateWidth - PRICE_LABEL_TRACKING * content.priceLabel.length, maxLines: 1, sizes: [23, 21], weight: 700, measure });
  const price = fitLines({ text: content.price, maxWidth: plateWidth, maxLines: 1, sizes: [92, 84, 76, 68, 60], weight: 800, measure });
  // O telefone recuou de 46 para 38: na placa o preço já domina, e dois blocos no mesmo corpo
  // competiam em vez de se completarem.
  const phone = fitLines({ text: content.phone, maxWidth: width, maxLines: 1, sizes: [38, 34, 30], weight: 800, measure });
  const note = fitLines({ text: content.note, maxWidth: width, maxLines: 2, sizes: [27, 25, 23, 21], weight: 400, measure });

  const lineBox = (fit: { size: number; lines: readonly string[] }, leading = 1.06) =>
    Math.ceil(fit.lines.length * fit.size * leading);

  const textHeights = {
    kicker: lineBox(kicker),
    title: lineBox(title, 1.04),
    meta: lineBox(meta),
    priceLabel: lineBox(priceLabel),
    price: lineBox(price, 1.02),
    phone: lineBox(phone),
    note: lineBox(note, 1.3),
  };
  const pillHeight = textHeights.kicker + KICKER_PAD.y * 2;
  const plateHeight = textHeights.priceLabel + GAP.price + textHeights.price + PLATE_PAD.y * 2;

  const fixed = LOGO_HEIGHT + pillHeight + textHeights.title + textHeights.meta
    + plateHeight + textHeights.phone + textHeights.note;
  const gaps = OUTER_GAPS.reduce((sum, key) => sum + GAP[key], 0);
  const available = bottom - top;

  // A foto fica com a sobra. Se a sobra ficar menor que o mínimo, os respiros encolhem juntos
  // antes de a foto apertar mais — e o texto segue inteiro de qualquer forma.
  //
  // `MIN_PHOTO_HEIGHT` é preferência, não piso: forçá-lo com um `Math.max` empurrava a pilha para
  // fora da área segura no quadrado, que é o formato mais baixo. Preferir uma foto pequena a um
  // texto por cima da interface da rede é a mesma escolha de sempre — quem cede é a imagem.
  let photoHeight = available - fixed - gaps;
  let squeeze = 1;
  if (photoHeight < MIN_PHOTO_HEIGHT) {
    const deficit = MIN_PHOTO_HEIGHT - photoHeight;
    squeeze = Math.max(0.35, 1 - deficit / gaps);
    photoHeight = Math.max(0, available - fixed - gaps * squeeze);
  }
  const gap = (key: (typeof OUTER_GAPS)[number]) => Math.round(GAP[key] * squeeze);

  let y = top;
  const logo: Frame = { x, y, width: 0, height: LOGO_HEIGHT };
  y += LOGO_HEIGHT + gap('kicker');

  const kickerPill: Frame = { x, y, height: pillHeight,
    width: Math.ceil(tracked(kicker.lines, kicker.size, 700, KICKER_TRACKING, measure)) + KICKER_PAD.x * 2 };
  const kickerAt: Placed = { x: x + KICKER_PAD.x, y: y + KICKER_PAD.y,
    width: kickerPill.width - KICKER_PAD.x * 2, height: textHeights.kicker, size: kicker.size, lines: kicker.lines };
  y += pillHeight + gap('title');

  const titleAt: Placed = { x, y, width, height: textHeights.title, size: title.size, lines: title.lines };
  y += textHeights.title + gap('meta');
  const metaAt: Placed = { x, y, width, height: textHeights.meta, size: meta.size, lines: meta.lines };
  y += textHeights.meta + gap('photo');

  // O quadro assume a proporção da foto: sem tarja preta e sem caixa decorativa anunciando o vazio.
  // O painel **abraça** a foto em vez de ocupar a coluna inteira. Painel de largura fixa com foto
  // em pé dentro vira caixa dentro de caixa, que lê como erro de montagem; abraçando, ele é moldura
  // e cumpre o que tem de cumprir — dar borda a veículo escuro sobre fundo escuro.
  const aspect = content.photoAspect ?? 4 / 3;
  const inner = { width: width - PHOTO_MAT * 2, height: photoHeight - PHOTO_MAT * 2 };
  let photoWidth = Math.min(inner.width, inner.height * aspect);
  let drawnHeight = photoWidth / aspect;
  if (drawnHeight > inner.height) { drawnHeight = inner.height; photoWidth = drawnHeight * aspect; }
  const photo: Frame = { x: x + (width - photoWidth) / 2, y: y + (photoHeight - drawnHeight) / 2,
    width: photoWidth, height: drawnHeight };
  const photoPanel: Frame = { x: photo.x - PHOTO_MAT, y: photo.y - PHOTO_MAT,
    width: photo.width + PHOTO_MAT * 2, height: photo.height + PHOTO_MAT * 2 };
  y += photoHeight + gap('plate');

  const pricePlate: Frame = { x, y, width, height: plateHeight };
  const priceLabelAt: Placed = { x: x + PLATE_PAD.x, y: y + PLATE_PAD.y, width: plateWidth,
    height: textHeights.priceLabel, size: priceLabel.size, lines: priceLabel.lines };
  const priceAt: Placed = { x: x + PLATE_PAD.x, y: priceLabelAt.y + textHeights.priceLabel + GAP.price,
    width: plateWidth, height: textHeights.price, size: price.size, lines: price.lines };
  y += plateHeight + gap('phone');

  const phoneAt: Placed = { x, y, width, height: textHeights.phone, size: phone.size, lines: phone.lines };
  y += textHeights.phone + gap('note');
  const noteAt: Placed = { x, y, width, height: textHeights.note, size: note.size, lines: note.lines };

  return { spec, column: { x, width }, logo, kickerPill, kicker: kickerAt, title: titleAt, meta: metaAt,
    photoPanel, photo, pricePlate, priceLabel: priceLabelAt, price: priceAt, phone: phoneAt, note: noteAt };
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
