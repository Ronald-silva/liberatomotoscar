'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Stage, Layer, Rect, Text, Shape, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import PlatformChrome from './PlatformChrome';
import { artBadges, type ArtBadge } from './templates';
import { destinationSpec, type ArtDestination } from './destinations';
import { ART_FONT_FAMILY, BADGE_TRACKING, PRICE_LABEL_TRACKING, layoutArt,
  type ArtContent, type ArtLayout, type Frame, type Measure, type Placed, type Scrim } from './art-layout';
import type { BrandKit } from '@/data/brand';

// O palco já tem a largura cheia do destino. Em celulares HiDPI, duplicar a resolução interna dos
// dois canvas do Konva gastaria memória sem melhorar o arquivo final (§7 do spec).
Konva.pixelRatio = 1;

/** Os dois únicos pesos da arte, porque são as duas únicas instâncias da Archivo em disco. */
const WEIGHT = { regular: 400, black: 900 } as const;

/**
 * Mede com a mesma família e o mesmo peso que o Konva vai usar ao desenhar, mais 3% de folga para
 * diferenças de rasterização. Medir tudo como negrito, como a versão anterior fazia, superestimava
 * a linha de dados e a observação e as encolhia à toa.
 */
let measureContext: CanvasRenderingContext2D | null = null;
const measureText: Measure = (text, size, weight) => {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return text.length * size * 0.62;
  // Peso **numérico**, nunca o atalho `bold`. A Archivo entra como fonte variável 400-900, e o
  // atalho instancia um peso intermediário que não existe em disco — nem é o que a arte desenha,
  // nem o que a fixture dos testes mede. Medir numa instância que não é a desenhada é exatamente o
  // defeito que a medição fiel existe para matar, e ele vale 6% de largura: num título de 936 px,
  // 59 px fora da área segura.
  measureContext.font = `${weight} ${size}px ${ART_FONT_FAMILY}`;
  return Math.ceil(measureContext.measureText(text).width * 1.03);
};

/** Quanto o fundo é desfocado. Abaixo de uns 24 px o fundo lê como foto duplicada, não como leito. */
export const BACKDROP_BLUR = 48;
/** O recuo: a redução antes de reampliar, quando o contexto não tem filtro. */
const BACKDROP_DOWNSCALE = 24;

type DrawImage = {
  (image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  (image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number): void;
};

/** O pouco que o desfoque precisa de um contexto 2D — e só isso, para poder ser testado. */
export type BackdropContext = { drawImage: DrawImage; filter?: string; imageSmoothingEnabled?: boolean };
export type BackdropScratch = {
  width: number;
  height: number;
  getContext: (id: '2d') => { drawImage: DrawImage; imageSmoothingEnabled?: boolean } | null;
};

/** Um canvas de rascunho só para o recuo. Fora do navegador, não existe — e o recuo fica sem ele. */
let scratch: BackdropScratch | null | undefined;
function scratchCanvas(): BackdropScratch | null {
  if (scratch !== undefined) return scratch;
  try {
    scratch = document.createElement('canvas') as unknown as BackdropScratch;
  } catch {
    scratch = null;
  }
  return scratch;
}

/**
 * O fundo da peça: a própria foto, ampliada até sangrar nas quatro bordas e desfocada.
 *
 * O desfoque é o do navegador (`context.filter`), que é acelerado. **Nunca o filtro de desfoque do
 * próprio Konva**: é stack blur em JavaScript e custa segundos num iPhone nesta dimensão — e é o
 * tempo em que o toque de publicar ficaria esperando, que é o que o estúdio inteiro existe para
 * não fazer. Onde não houver filtro no contexto, a foto é reduzida num rascunho e reampliada: o
 * reamostrador do próprio navegador faz as vezes do desfoque. Sem nem isso, a foto nítida cobrindo
 * a peça ainda é melhor que um retângulo vazio.
 */
export function drawBackdrop({ context, image, frame, scratch: rascunho }: {
  context: BackdropContext; image: CanvasImageSource; frame: Frame; scratch: BackdropScratch | null;
}): void {
  if (typeof context.filter === 'string') {
    context.filter = `blur(${BACKDROP_BLUR}px)`;
    context.drawImage(image, frame.x, frame.y, frame.width, frame.height);
    // Devolve o contexto sem filtro: o que vem depois no palco é desenhado nítido.
    context.filter = 'none';
    return;
  }
  const reduzida = rascunho ? reduzir(rascunho, image, frame) : null;
  if (reduzida && rascunho) {
    context.imageSmoothingEnabled = true;
    context.drawImage(rascunho as unknown as CanvasImageSource, 0, 0, reduzida.width, reduzida.height,
      frame.x, frame.y, frame.width, frame.height);
    return;
  }
  context.drawImage(image, frame.x, frame.y, frame.width, frame.height);
}

function reduzir(rascunho: BackdropScratch, image: CanvasImageSource, frame: Frame) {
  const width = Math.max(1, Math.round(frame.width / BACKDROP_DOWNSCALE));
  const height = Math.max(1, Math.round(frame.height / BACKDROP_DOWNSCALE));
  rascunho.width = width;
  rascunho.height = height;
  const context = rascunho.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, width, height);
  return { width, height };
}

/** `#rrggbb` mais opacidade. A paleta da marca guarda cor; o véu precisa de cor **com** opacidade. */
function rgba(hex: string, alpha: number): string {
  const limpo = hex.replace('#', '');
  const r = parseInt(limpo.slice(0, 2), 16);
  const g = parseInt(limpo.slice(2, 4), 16);
  const b = parseInt(limpo.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * A rampa do véu, do jeito que o Konva pede: offset, cor, offset, cor.
 *
 * As paradas vêm do layout e não daqui porque é assim que o piso de 0,82 do §4.4 do spec deixa de
 * ser aposta e passa a ser conta conferida. Esta função só traduz opacidade em cor.
 */
export function scrimColorStops(scrim: Scrim, color: string): (number | string)[] {
  return scrim.stops.flatMap((stop) => [stop.offset, rgba(color, stop.alpha)]);
}

/** Um bloco de texto já medido pelo layout: posição, corpo e linhas prontas. */
function Block({ name, at, fill, weight = WEIGHT.regular, leading = 1.06, letterSpacing = 0, align }: {
  name: string; at: Placed; fill: string; weight?: number; leading?: number;
  letterSpacing?: number; align?: 'left' | 'center';
}) {
  return <Text name={name} x={at.x} y={at.y} width={at.width} text={at.lines.join('\n')} fill={fill}
    fontFamily={ART_FONT_FAMILY} fontSize={at.size} lineHeight={leading} letterSpacing={letterSpacing}
    align={align} fontStyle={String(weight)} listening={false} />;
}

/**
 * O conteúdo da peça a partir do cadastro.
 *
 * Mora fora do componente de propósito: são as regras comerciais do §7 do spec — **veículo vendido
 * não anuncia preço** e a placa troca de rótulo — e dentro do componente elas não teriam como ser
 * afirmadas por teste nenhum. Era assim que viviam até aqui.
 */
export function artContentFor({ title, meta, price, phone, note, status, badge, photoAspect, logoAspect }: {
  title: string; meta: string; price: string; phone: string; note: string; status: string;
  badge: ArtBadge; photoAspect: number | null; logoAspect: number | null;
}): ArtContent {
  const escolhido = artBadges.find((item) => item.id === badge) ?? artBadges[0];
  const vendido = status === 'sold';
  const reservado = status === 'reserved';
  return {
    title,
    meta,
    badge: vendido ? 'VENDIDO' : reservado ? 'RESERVADO' : escolhido.heading,
    // Trava comercial: o que saiu do estoque não volta à vitrine com preço em destaque.
    priceLabel: vendido ? 'ESTOQUE LIBERATO' : 'PREÇO DO ANÚNCIO',
    price: vendido ? 'VEJA OUTRAS OPÇÕES' : price,
    phone,
    note: note.trim() || (vendido ? 'Peça opções semelhantes no WhatsApp'
      : reservado ? 'Consulte a disponibilidade no WhatsApp'
        : 'Consulte disponibilidade e condições'),
    status,
    photoAspect,
    logoAspect,
  };
}

/**
 * O palco, na ordem em que o Konva desenha: fundo desfocado, foto inteira, tarja de situação, véu,
 * logo, pílula do selo, título, linha de dados, placa de preço, telefone, observação, marca d'água.
 *
 * É uma função pura, separada do componente, porque a ordem do palco é o contrato visual da peça —
 * foto sobre o fundo, texto sobre o véu — e dentro de um componente com hooks ela só poderia ser
 * conferida por varredura de texto do fonte.
 */
export function ArtScene({ layout, brand, photo, logo }: {
  layout: ArtLayout; brand: BrandKit; photo: HTMLImageElement | null; logo: HTMLImageElement | null;
}) {
  const { spec, fit, scrim, column } = layout;
  const ink = brand.palette;
  return <>
    <Rect name="fundo" x={0} y={0} width={spec.width} height={spec.height} fill={ink.background} listening={false} />

    {photo && fit.backdrop
      ? <Shape name="fundo-desfocado" x={0} y={0} width={spec.width} height={spec.height} listening={false}
        sceneFunc={(context) => drawBackdrop({ context: context as unknown as BackdropContext,
          image: photo, frame: fit.backdrop!, scratch: scratchCanvas() })} />
      : null}

    {photo
      ? <KonvaImage name="foto" image={photo} x={fit.photo.x} y={fit.photo.y}
        width={fit.photo.width} height={fit.photo.height} listening={false} />
      : <Text name="foto-ausente" x={0} y={spec.height / 2 - 20} width={spec.width} align="center"
        text="A foto aparecerá aqui" fill={ink.dim} fontFamily={ART_FONT_FAMILY} fontSize={32}
        fontStyle={String(WEIGHT.regular)} listening={false} />}

    {/* A tarja fica **sobre a foto** e sob o véu: é trava comercial, não linha de rodapé (§3.3.11). */}
    {layout.statusBand ? <>
      <Rect name="tarja" x={layout.statusBand.frame.x} y={layout.statusBand.frame.y}
        width={layout.statusBand.frame.width} height={layout.statusBand.frame.height}
        fill={rgba(ink.scrim, 0.88)} listening={false} />
      <Block name="tarja-texto" at={layout.statusBand.text} fill={ink.ink} weight={WEIGHT.black} align="center" />
    </> : null}

    <Rect name="veu" x={0} y={scrim.y} width={spec.width} height={scrim.height}
      fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{ x: 0, y: scrim.height }}
      fillLinearGradientColorStops={scrimColorStops(scrim, ink.scrim)} listening={false} />

    {logo
      ? <KonvaImage name="logo" image={logo} x={layout.logo.x} y={layout.logo.y}
        width={layout.logo.width} height={layout.logo.height} listening={false} />
      : <Text name="logo-reserva" x={column.x} y={layout.logo.y + 30} width={column.width}
        text={brand.name.toUpperCase()} fill={ink.ink} fontFamily={ART_FONT_FAMILY} fontSize={38}
        fontStyle={String(WEIGHT.black)} listening={false} />}

    <Rect name="selo-pilula" x={layout.badgePill.x} y={layout.badgePill.y} width={layout.badgePill.width}
      height={layout.badgePill.height} fill={ink.chip} cornerRadius={layout.badgePill.height / 2}
      listening={false} />
    <Block name="selo" at={layout.badge} fill={ink.chipInk} weight={WEIGHT.black} letterSpacing={BADGE_TRACKING} />
    <Block name="titulo" at={layout.title} fill={ink.ink} weight={WEIGHT.black} leading={1.04} />
    {layout.meta ? <Block name="dados" at={layout.meta} fill={ink.dim} /> : null}

    <Rect name="placa" x={layout.pricePlate.x} y={layout.pricePlate.y} width={layout.pricePlate.width}
      height={layout.pricePlate.height} fill={ink.chip} cornerRadius={14} listening={false} />
    <Block name="preco-rotulo" at={layout.priceLabel} fill={rgba(ink.chipInk, 0.84)}
      weight={WEIGHT.black} letterSpacing={PRICE_LABEL_TRACKING} />
    <Block name="preco" at={layout.price} fill={ink.chipInk} weight={WEIGHT.black} leading={1.02} />

    {/* Telefone e observação são um rodapé só: o preço já ganhou na placa. */}
    <Block name="telefone" at={layout.phone} fill={ink.ink} weight={WEIGHT.black} />
    {layout.note ? <Block name="observacao" at={layout.note} fill={ink.dim} leading={1.3} /> : null}

    {/* Rascunho e arquivado não geram peça comercial (§7): a marca d'água é a última coisa a entrar. */}
    {layout.watermark ? <>
      <Rect name="marca-dagua" x={layout.watermark.frame.x} y={layout.watermark.frame.y}
        width={layout.watermark.frame.width} height={layout.watermark.frame.height}
        fill={rgba(ink.scrim, 0.88)} listening={false} />
      <Block name="marca-dagua-texto" at={layout.watermark.text} fill={ink.ink} weight={WEIGHT.black} align="center" />
    </> : null}
  </>;
}

function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    // O Konva quebra o texto uma única vez e não refaz quando a fonte chega (font-display: swap).
    // Os dois pesos que a arte usa, os dois carregados: a linha de dados e a observação são
    // desenhadas no peso normal, e sem ele o Konva as quebra com a métrica da fonte de reserva e
    // não refaz (§7 do spec).
    void Promise.all([
      document.fonts.load(`400 48px ${ART_FONT_FAMILY}`),
      document.fonts.load(`900 48px ${ART_FONT_FAMILY}`),
      document.fonts.ready,
    ])
      .catch(() => undefined).then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  return ready;
}

function useLoadedImage(src: string | null) {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!src) return;
    const node = new window.Image();
    node.onload = () => setLoaded({ src, image: node });
    node.onerror = () => setLoaded(null);
    node.src = src;
    return () => { node.onload = null; node.onerror = null; };
  }, [src]);
  return loaded?.src === src ? loaded.image : null;
}

function useVehiclePhoto(src: string | null, retry: number) {
  const [state, setState] = useState<{ src: string; retry: number; image?: HTMLImageElement; error?: string } | null>(null);
  useEffect(() => {
    if (!src) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    let image: HTMLImageElement | null = null;
    void (async () => {
      try {
        let blob: Blob | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await fetch(src, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
            if (!response.ok) {
              if (response.status >= 500 && attempt === 0) continue;
              throw new Error(response.status === 403 ? 'Sua sessão expirou. Entre novamente no painel.'
                : response.status === 502 ? 'A foto não está disponível no armazenamento. Tente recarregar.'
                  : `Não foi possível carregar a foto (erro ${response.status}).`);
            }
            blob = await response.blob();
            break;
          } catch (error) {
            if (controller.signal.aborted) return;
            if (error instanceof TypeError && attempt === 0) continue;
            if (error instanceof TypeError) throw new Error('Falha de rede ao buscar a foto. Confira a conexão e tente novamente.');
            throw error;
          }
        }
        if (!blob || !blob.type.startsWith('image/')) throw new Error('O arquivo recebido não é uma imagem.');
        objectUrl = URL.createObjectURL(blob);
        image = new window.Image();
        const node = image;
        await new Promise<void>((resolve, reject) => {
          node.onload = () => resolve();
          node.onerror = () => reject(new Error('Este aparelho não conseguiu abrir a foto. Escolha outra foto.'));
          node.src = objectUrl!;
        });
        if (!controller.signal.aborted) setState({ src, retry, image: node });
      } catch (error) {
        if (!controller.signal.aborted) setState({ src, retry,
          error: error instanceof Error ? error.message : 'Não foi possível carregar a foto.' });
      }
    })();
    return () => {
      controller.abort();
      if (image) { image.onload = null; image.onerror = null; }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, retry]);
  return state?.src === src && state.retry === retry ? state : null;
}

export default function ArtCanvas({ destination, badge, brand, showChrome, photoUrl, photoRetry,
  title, meta, price, phone, status, note, stageRef, onPhotoLoad }: {
  destination: ArtDestination; badge: ArtBadge; brand: BrandKit; showChrome: boolean;
  photoUrl: string | null; title: string; meta: string;
  price: string; phone: string; status: string; note: string;
  photoRetry: number; stageRef: RefObject<Konva.Stage | null>;
  onPhotoLoad: (state: 'loading' | 'ready' | 'error', error?: string) => void;
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  // Um palpite de altura de janela de celular, só até o primeiro `resize` responder.
  const [viewportHeight, setViewportHeight] = useState(812);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const fontsReady = useFontsReady();
  const photoState = useVehiclePhoto(photoUrl, photoRetry);
  const photo = photoState?.image ?? null;
  // A dimensão é propriedade do destino: escolher "Stories" já escolhe o tamanho do arquivo.
  const { width, height } = destinationSpec(destination);
  const logo = useLoadedImage(brand.logoNegative);
  useEffect(() => { onPhotoLoad(photo && fontsReady ? 'ready' : photoState?.error ? 'error' : 'loading', photoState?.error); },
    [photo, fontsReady, photoState?.error, onPhotoLoad]);
  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(() => setAvailableWidth(container.clientWidth));
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);
  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // A prévia cabe inteira na janela, enquanto o Stage exportado mantém a medida do destino.
  const previewHeight = Math.max(600, viewportHeight - 200);
  const scale = Math.min(1, (availableWidth || 360) / width, previewHeight / height);

  const content = artContentFor({ title, meta, price, phone, note, status, badge,
    photoAspect: photo ? photo.width / photo.height : null,
    logoAspect: logo ? logo.width / logo.height : null });
  const L = layoutArt(destination, content, measureText);

  return <div ref={setContainer} style={{ width: '100%' }}>
    <div style={{ width: width * scale, height: height * scale, marginInline: 'auto',
      overflow: 'hidden', position: 'relative' }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <Stage width={width} height={height} ref={stageRef}>
          {/* A chave força o Konva a remedir quando a fonte termina de carregar. */}
          <Layer key={String(fontsReady)}>
            <ArtScene layout={L} brand={brand} photo={photo} logo={logo} />
          </Layer>
        </Stage>
      </div>
      {/* Fora do palco de propósito: dentro de uma camada, o fantasma iria para o JPEG publicado. */}
      {showChrome ? <PlatformChrome destination={destination} /> : null}
    </div>
  </div>;
}
