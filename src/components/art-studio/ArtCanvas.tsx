'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import { artFormats, artTemplates, ART_THEMES, type ArtFormat, type ArtTemplate } from './templates';
import { ART_FONT_FAMILY, layoutArt, type ArtContent, type Measure, type Placed } from './art-layout';

// O palco já tem 1080 px de largura. Em celulares HiDPI, duplicar a resolução
// interna dos dois canvas do Konva gastaria memória sem melhorar o arquivo final.
Konva.pixelRatio = 1;

/**
 * Mede com a mesma família e o mesmo peso que o Konva vai usar ao desenhar, mais 3% de folga para
 * diferenças de rasterização. Medir tudo como negrito, como a versão anterior fazia, superestimava
 * a linha de dados e a observação e as encolhia à toa.
 */
let measureContext: CanvasRenderingContext2D | null = null;
const measureText: Measure = (text, size, weight) => {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return text.length * size * 0.62;
  measureContext.font = `${weight >= 600 ? 'bold' : 'normal'} ${size}px ${ART_FONT_FAMILY}`;
  return Math.ceil(measureContext.measureText(text).width * 1.03);
};

function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    // O Konva quebra o texto uma única vez e não refaz quando a fonte chega (font-display: swap).
    void Promise.all([document.fonts.load(`bold 48px ${ART_FONT_FAMILY}`), document.fonts.ready])
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

/** Um bloco de texto já medido pelo layout: posição, corpo e linhas prontas. */
function Block({ at, fill, weight = 400, leading = 1.06, letterSpacing = 0 }: {
  at: Placed; fill: string; weight?: number; leading?: number; letterSpacing?: number;
}) {
  return <Text x={at.x} y={at.y} width={at.width} text={at.lines.join('\n')} fill={fill}
    fontFamily={ART_FONT_FAMILY} fontSize={at.size} lineHeight={leading} letterSpacing={letterSpacing}
    fontStyle={weight >= 600 ? 'bold' : 'normal'} />;
}

export default function ArtCanvas({ format, template, photoUrl, photoRetry, title, meta, price, phone, status, note,
  stageRef, onPhotoLoad }: {
  format: ArtFormat; template: ArtTemplate; photoUrl: string | null; title: string; meta: string;
  price: string; phone: string; status: string; note: string;
  photoRetry: number; stageRef: RefObject<Konva.Stage | null>;
  onPhotoLoad: (state: 'loading' | 'ready' | 'error', error?: string) => void;
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const fontsReady = useFontsReady();
  const photoState = useVehiclePhoto(photoUrl, photoRetry);
  const photo = photoState?.image ?? null;
  const { width, height } = artFormats[format];
  const choice = artTemplates.find((item) => item.id === template)!;
  const theme = ART_THEMES[template];
  const logo = useLoadedImage(theme.logo);
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

  const vertical = format === 'story' || format === 'tiktok';
  // A prévia cabe inteira na janela, enquanto o Stage exportado mantém a medida do formato.
  const previewHeight = Math.min(1080, Math.max(600, viewportHeight - 200));
  const scale = Math.min(1, (availableWidth || 360) / width, vertical ? previewHeight / height : 1);

  const unavailable = status === 'sold' || status === 'reserved';
  const content: ArtContent = {
    title,
    meta,
    kicker: status === 'sold' ? 'VENDIDO' : status === 'reserved' ? 'RESERVADO' : choice.heading,
    priceLabel: status === 'sold' ? 'ESTOQUE LIBERATO' : 'PREÇO DO ANÚNCIO',
    price: status === 'sold' ? 'VEJA OUTRAS OPÇÕES' : price,
    phone,
    note: note || (status === 'sold' ? 'Peça opções semelhantes no WhatsApp'
      : status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp'
        : 'Consulte disponibilidade e condições'),
    photoAspect: photo ? photo.width / photo.height : null,
  };
  const L = layoutArt(format, content, measureText);
  const logoWidth = logo ? Math.round(L.logo.height * (logo.width / logo.height)) : 0;
  const priceInk = theme.pricePlate ? '#ffffff' : theme.ink;

  return <div ref={setContainer} style={{ width: '100%' }}>
    <div style={{ width: width * scale, height: height * scale, marginInline: 'auto', overflow: 'hidden' }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <Stage width={width} height={height} ref={stageRef}>
          {/* A chave força o Konva a remedir quando a fonte termina de carregar. */}
          <Layer key={String(fontsReady)}>
            <Rect width={width} height={height} fill={theme.background} />
            <Rect width={width} height={10} fill={theme.accent} />

            {logo ? <KonvaImage image={logo} x={L.logo.x} y={L.logo.y} width={logoWidth} height={L.logo.height} />
              : <Text x={L.logo.x} y={L.logo.y + 30} text="LIBERATO MOTOS CAR" fill={theme.ink}
                fontFamily={ART_FONT_FAMILY} fontSize={38} fontStyle="bold" />}

            <Block at={L.kicker} fill={theme.accent} weight={700} letterSpacing={2.2} />
            <Block at={L.title} fill={theme.ink} weight={700} leading={1.04} />
            <Block at={L.meta} fill={theme.dim} />

            {photo ? <KonvaImage image={photo} x={L.photo.x} y={L.photo.y}
              width={L.photo.width} height={L.photo.height} cornerRadius={10} />
              : <>
                <Rect x={L.photo.x} y={L.photo.y} width={L.photo.width} height={L.photo.height}
                  fill={theme.pricePlate ? '#161d25' : '#161d25'} cornerRadius={10} />
                <Text x={L.photo.x} y={L.photo.y + L.photo.height / 2 - 20} width={L.photo.width}
                  align="center" text="A foto aparecerá aqui" fill={theme.dim}
                  fontFamily={ART_FONT_FAMILY} fontSize={32} />
              </>}
            {theme.photoStroke ? <Rect x={L.photo.x} y={L.photo.y} width={L.photo.width} height={L.photo.height}
              stroke={theme.photoStroke} strokeWidth={4} cornerRadius={10} listening={false} /> : null}
            {unavailable ? <>
              <Rect x={L.photo.x} y={L.photo.y + L.photo.height / 2 - 56} width={L.photo.width} height={112}
                fill={status === 'sold' ? 'rgba(9,12,17,0.86)' : 'rgba(84,58,18,0.88)'} />
              <Text x={L.photo.x} y={L.photo.y + L.photo.height / 2 - 30} width={L.photo.width} align="center"
                text={status === 'sold' ? 'VENDIDO' : 'RESERVADO'} fill="#ffffff"
                fontFamily={ART_FONT_FAMILY} fontSize={60} fontStyle="bold" />
            </> : null}

            {theme.pricePlate ? <Rect x={L.priceRule.x} y={L.priceLabel.y - 20}
              width={L.column.width} height={L.priceLabel.lines.length * L.priceLabel.size + L.price.size * 1.02 + 38}
              fill={theme.pricePlate} cornerRadius={10} />
              : <Rect x={L.priceRule.x} y={L.priceRule.y} width={L.priceRule.width}
                height={L.priceRule.height} fill={theme.accent} />}
            <Block at={theme.pricePlate ? { ...L.priceLabel, x: L.priceLabel.x + 20 } : L.priceLabel}
              fill={theme.pricePlate ? 'rgba(255,255,255,0.82)' : theme.dim} weight={700} letterSpacing={1.6} />
            <Block at={theme.pricePlate ? { ...L.price, x: L.price.x + 20 } : L.price}
              fill={priceInk} weight={700} leading={1.02} />

            <Block at={L.phone} fill={theme.ink} weight={700} />
            <Block at={L.note} fill={theme.dim} leading={1.3} />

            {status === 'draft' || status === 'archived' ? <Text x={0} y={height / 2 - 70} width={width}
              text="PRÉVIA · NÃO PUBLICAR" align="center" fill="#ffffff" shadowColor="#000000"
              shadowBlur={10} fontFamily={ART_FONT_FAMILY} fontSize={56} fontStyle="bold" /> : null}
          </Layer>
        </Stage>
      </div>
    </div>
  </div>;
}
