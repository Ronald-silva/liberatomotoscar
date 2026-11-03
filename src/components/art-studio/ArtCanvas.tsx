'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group } from 'react-konva';
import Konva from 'konva';
import { artFormats, artTemplates, type ArtFormat, type ArtTemplate } from './templates';
import { ART_FONT_FAMILY, fitTitle } from './title-fit';
import { VerticalArt } from './VerticalArt';

// O palco já tem 1080 px de largura. Em celulares HiDPI, duplicar a resolução
// interna dos dois canvas do Konva gastaria memória sem melhorar o arquivo final.
Konva.pixelRatio = 1;

// Altura da caixa do título e corpos tentados (do maior para o menor) em cada formato.
const titleBox: Record<ArtFormat, { height: number; candidates: readonly number[] }> = {
  feed: { height: 120, candidates: [66, 55, 48] },
  square: { height: 120, candidates: [59, 55, 48] },
  story: { height: 108, candidates: [52, 46, 40] },
  tiktok: { height: 108, candidates: [52, 46, 40] },
};
const TITLE_LINE_HEIGHT = 1.02;

let measureContext: CanvasRenderingContext2D | null = null;
// Mesma fonte e mesmo peso que o Konva usa no Text do título, para a medida bater com o desenho.
function measureTitle(text: string, size: number) {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return text.length * size * 0.6;
  measureContext.font = `bold ${size}px ${ART_FONT_FAMILY}`;
  return measureContext.measureText(text).width;
}

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

export default function ArtCanvas({ format, template, photoUrl, photoRetry, title, year, price, phone, status, note,
  focalX, focalY, stageRef, onPhotoLoad }: {
  format: ArtFormat; template: ArtTemplate; photoUrl: string | null; title: string; year: number | null;
  price: string; phone: string; status: string; note: string; focalX: number; focalY: number;
  photoRetry: number; stageRef: RefObject<Konva.Stage | null>;
  onPhotoLoad: (state: 'loading' | 'ready' | 'error', error?: string) => void;
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const fontsReady = useFontsReady();
  const photoState = useVehiclePhoto(photoUrl, photoRetry);
  const photo = photoState?.image ?? null;
  const logo = useLoadedImage('/logo-liberato-negativo.png');
  const { width, height } = artFormats[format];
  const choice = artTemplates.find((item) => item.id === template)!;
  useEffect(() => { onPhotoLoad(photo ? 'ready' : photoState?.error ? 'error' : 'loading', photoState?.error); },
    [photo, photoState?.error, onPhotoLoad]);
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
  // No vertical, reservamos o topo e a base para a interface das plataformas;
  // a faixa direita também fica livre para os controles do TikTok.
  const vertical = format === 'story' || format === 'tiktok';
  // A prévia cabe inteira na janela, enquanto o Stage exportado mantém 1080 × 1920.
  const previewHeight = Math.min(1080, Math.max(600, viewportHeight - 200));
  const scale = Math.min(1, (availableWidth || 360) / width, vertical ? previewHeight / height : 1);
  const inset = vertical ? 80 : 70;
  const contentWidth = vertical ? 800 : width - inset * 2;
  const footerTop = vertical ? 892 : height - (format === 'square' ? 395 : 470);
  const classic = template === 'classic';
  const highlighted = template === 'highlight';
  const priceFeature = template === 'offer';
  const unavailable = status === 'sold' || status === 'reserved';
  const photoTop = vertical ? 420 : classic && format === 'square' ? 200 : height * 0.16;
  const photoHeight = vertical ? 470 : classic ? footerTop - photoTop - 80
    : highlighted ? footerTop - photoTop - 55 : height * 0.58;
  const photoBox = { x: vertical ? inset : classic || highlighted ? 56 : 0, y: photoTop,
    width: vertical ? contentWidth : classic || highlighted ? width - 112 : width, height: photoHeight };
  const containPhoto = classic || vertical;
  const containRatio = photo ? Math.min(photoBox.width / photo.width, photoBox.height / photo.height) : 1;
  const containedPhoto = photo ? {
    x: photoBox.x + (photoBox.width - photo.width * containRatio) / 2,
    y: photoBox.y + (photoBox.height - photo.height * containRatio) / 2,
    width: photo.width * containRatio,
    height: photo.height * containRatio,
  } : photoBox;
  const cropRatio = photo ? Math.min(photo.width / photoBox.width, photo.height / photoBox.height) : 1;
  const cropWidth = photoBox.width * cropRatio;
  const cropHeight = photoBox.height * cropRatio;
  const crop = photo ? { x: (photo.width - cropWidth) * focalX / 100,
    y: (photo.height - cropHeight) * focalY / 100, width: cropWidth, height: cropHeight } : undefined;
  const badge = status === 'sold' ? 'VENDIDO' : status === 'reserved' ? 'RESERVADO' : choice.heading;
  const ink = classic ? '#111820' : '#ffffff';
  const muted = classic ? '#49505a' : '#d0d4dc';
  const { height: titleHeight, candidates } = titleBox[format];
  // Mede com a fonte já carregada; antes disso a quebra seria a da fonte de reserva.
  const fittedTitle = fitTitle({ text: title.toLocaleUpperCase('pt-BR'), maxWidth: contentWidth,
    maxHeight: titleHeight, lineHeight: TITLE_LINE_HEIGHT, candidates, measure: measureTitle });
  const priceY = vertical ? 1070 : footerTop + (format === 'square' ? 191 : 203);
  const footerNote = note || (status === 'sold' ? 'Peça opções semelhantes no WhatsApp' :
    status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp' : 'Consulte disponibilidade e condições');

  return <div ref={setContainer} style={{ width: '100%' }}>
    <div style={{ width: width * scale, height: height * scale, marginInline: 'auto', overflow: 'hidden' }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <Stage width={width} height={height} ref={stageRef}>
          <Layer key={String(fontsReady)}>
            {vertical ? <VerticalArt format={format as 'story' | 'tiktok'} template={template}
              photo={photo} logo={logo} title={title} year={year} price={price} phone={phone}
              status={status} note={note} measure={measureTitle} /> : <>
            <Rect width={width} height={height} fill={classic ? '#eee9df' : '#090c11'} />
            {classic ? <Rect width={width} height={photoTop} fill="#090c11" /> : null}
            {photo && crop ? <KonvaImage image={photo} {...(containPhoto ? containedPhoto : photoBox)}
              {...(containPhoto ? {} : { crop })} /> :
              <Text x={inset} y={photoTop + photoHeight / 2 - 20} width={width - inset * 2}
                text="A foto aparecerá aqui" fill="#b8bec8" align="center" fontSize={36} />}
            {!classic ? <Rect x={0} y={photoTop + photoHeight * 0.65} width={width} height={photoHeight * 0.35}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: photoHeight * 0.35 }}
              fillLinearGradientColorStops={[0, 'rgba(9,12,17,0)', 1, '#090c11']} /> : null}
            {highlighted ? <>
              <Rect x={photoBox.x} y={photoBox.y} width={photoBox.width} height={photoBox.height}
                stroke="#eee9df" strokeWidth={5} listening={false} />
              <Rect x={vertical ? photoBox.x + photoBox.width - 34 : width - 90}
                y={photoTop + 30} width={34} height={170} fill={choice.accent} />
              {!vertical ? <Text x={width - 520} y={50} width={450} align="right" text="DESTAQUE DA SEMANA"
                fontFamily={ART_FONT_FAMILY} fontSize={24} fontStyle="bold" fill="#d0d4dc" />
                : null}
            </> : null}
            {classic ? <>
              <Rect x={photoBox.x} y={photoBox.y} width={photoBox.width} height={photoBox.height}
                stroke="#090c11" strokeWidth={4} listening={false} />
              <Rect x={0} y={vertical ? footerTop - 2 : footerTop - 80}
                width={width} height={8} fill={choice.accent} />
            </> : null}
            {unavailable && !classic ? <>
              <Rect {...photoBox} fill={status === 'sold' ? 'rgba(9,12,17,0.2)' : 'rgba(32,25,10,0.26)'} />
              <Rect x={vertical ? inset : 0} y={photoTop + photoHeight * 0.42}
                width={vertical ? contentWidth : width} height={138}
                fill={status === 'sold' ? 'rgba(9,12,17,0.88)' : 'rgba(98,67,20,0.9)'} />
              <Text x={inset} y={photoTop + photoHeight * 0.42 + 24} width={contentWidth}
                align="center" text={badge} fill="#ffffff" fontFamily={ART_FONT_FAMILY}
                fontSize={77} fontStyle="bold" />
            </> : null}
            <Rect x={0} y={0} width={width} height={16} fill={choice.accent} />
            {logo ? <KonvaImage image={logo} x={inset} y={vertical ? 280 : 45}
              width={vertical ? 250 : 300} height={vertical ? 118 : 141} /> :
              <Text x={inset} y={vertical ? 300 : 54} text="LIBERATO MOTOS CAR" fill="#ffffff" fontSize={38} fontStyle="bold" />}
            {(!unavailable || classic) ? <Group x={inset} y={footerTop - 68}>
              <Rect width={Math.min(600, badge.length * 29 + 80)} height={64}
                fill={classic ? '#090c11' : choice.accent} cornerRadius={classic ? 0 : 8} />
              <Text x={26} y={15} text={badge} fill="#ffffff" fontFamily={ART_FONT_FAMILY} fontSize={31} fontStyle="bold" />
            </Group> : null}
            <Text x={inset} y={footerTop + 16} width={contentWidth} height={titleHeight}
              text={fittedTitle.lines.join('\n')} fill={ink} fontFamily={ART_FONT_FAMILY}
              fontSize={fittedTitle.size} fontStyle="bold" lineHeight={TITLE_LINE_HEIGHT} wrap="word" ellipsis />
            <Text x={inset} y={vertical ? 1024 : footerTop + (format === 'square' ? 147 : 154)}
              text={year ? `ANO ${year}` : 'ANO NÃO INFORMADO'} fill={muted} fontFamily={ART_FONT_FAMILY} fontSize={31} />
            {priceFeature ? <Rect x={inset - 18} y={priceY - 8} width={contentWidth + 36}
              height={vertical || format === 'square' ? 88 : 100} fill={choice.accent} cornerRadius={8} /> : null}
            <Text x={inset} y={priceY} width={contentWidth}
              text={status === 'sold' ? 'VEJA OUTRAS OPÇÕES' : price} fill={priceFeature ? '#ffffff' : ink}
              fontFamily={ART_FONT_FAMILY} fontSize={status === 'sold' ? 52 : vertical ? 68 : format === 'square' ? 66 : 80}
              fontStyle="bold" />
            {!vertical ? <Rect x={inset} y={height - 126} width={contentWidth} height={2}
              fill={classic ? '#8b918f' : '#57606c'} />
              : null}
            <Text x={inset} y={vertical ? 1160 : height - 112} text={footerNote}
              width={contentWidth} height={vertical ? 32 : 40} ellipsis fill={muted}
              fontFamily={ART_FONT_FAMILY} fontSize={vertical ? 27 : 32} />
            <Text x={inset} y={vertical ? 1194 : height - 61} text={phone} fill={ink}
              fontFamily={ART_FONT_FAMILY} fontSize={vertical ? 40 : 42} fontStyle="bold" />
            {status === 'draft' || status === 'archived' ? <Text x={0} y={height / 2 - 70} width={width}
              text="PRÉVIA · NÃO PUBLICAR" align="center" fill="#ffffff" shadowColor="#000000"
              shadowBlur={10} fontSize={56} fontStyle="bold" /> : null}
            </>}
          </Layer>
        </Stage>
      </div>
    </div>
  </div>;
}
