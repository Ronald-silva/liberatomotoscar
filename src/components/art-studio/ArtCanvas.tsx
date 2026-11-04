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
  feed: { height: 118, candidates: [62, 54, 48, 42] },
  square: { height: 102, candidates: [52, 46, 40, 36] },
  story: { height: 108, candidates: [52, 46, 40] },
  tiktok: { height: 108, candidates: [52, 46, 40] },
};
const TITLE_LINE_HEIGHT = 1.02;

let measureContext: CanvasRenderingContext2D | null = null;
// Mesma fonte e mesmo peso que o Konva usa no Text do título, com margem de segurança de 4%
// para impedir que diferenças sutis de rasterização cortem ou quebrem palavras no Konva.
function measureTitle(text: string, size: number) {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return text.length * size * 0.62;
  measureContext.font = `bold ${size}px ${ART_FONT_FAMILY}`;
  return Math.ceil(measureContext.measureText(text).width * 1.04);
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
  // No vertical, reservamos o topo e a base para a interface das plataformas;
  // a faixa direita também fica livre para os controles do TikTok.
  // No quadrado (1:1), a grade 3:4 do perfil do Instagram corta 135 px de cada lado (x < 135 e x > 945),
  // por isso usamos inset = 148 (x: 148..932) para que nenhum texto ou logo seja cortado na grade.
  const vertical = format === 'story' || format === 'tiktok';
  const isSquare = format === 'square';
  // A prévia cabe inteira na janela, enquanto o Stage exportado mantém 1080 × 1920.
  const previewHeight = Math.min(1080, Math.max(600, viewportHeight - 200));
  const scale = Math.min(1, (availableWidth || 360) / width, vertical ? previewHeight / height : 1);
  const inset = vertical ? 80 : isSquare ? 148 : 80;
  const contentWidth = vertical ? 800 : width - inset * 2;
  const footerTop = vertical ? 892 : height - (isSquare ? 414 : 494);
  const classic = template === 'classic';
  const highlighted = template === 'highlight';
  const priceFeature = template === 'offer';
  const unavailable = status === 'sold' || status === 'reserved';
  const photoTop = vertical ? 420 : isSquare ? 146 : 196;
  const photoHeight = vertical ? 470 : classic ? footerTop - photoTop - (isSquare ? 68 : 76)
    : highlighted ? footerTop - photoTop - 52 : footerTop - photoTop + 20;
  const framedInset = isSquare ? inset : 64;
  const photoBox = { x: vertical ? inset : classic || highlighted ? framedInset : 0, y: photoTop,
    width: vertical ? contentWidth : classic || highlighted ? width - framedInset * 2 : width, height: photoHeight };
  const containPhoto = classic || vertical || isSquare;
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
  const titleY = footerTop + 14;
  const yearY = vertical ? 1024 : Math.min(
    footerTop + (isSquare ? 128 : 144),
    Math.round(titleY + fittedTitle.lines.length * fittedTitle.size * TITLE_LINE_HEIGHT + (isSquare ? 10 : 14)),
  );
  const priceY = vertical ? 1070 : yearY + (isSquare ? 42 : 48);
  const priceText = status === 'sold' ? 'VEJA OUTRAS OPÇÕES' : price;
  const fittedPrice = fitTitle({
    text: priceText,
    maxWidth: priceFeature ? contentWidth - 40 : contentWidth,
    maxHeight: isSquare ? 72 : 84,
    lineHeight: 1,
    candidates: status === 'sold' ? [48, 42, 36] : isSquare ? [62, 56, 50, 44] : [76, 68, 60, 52],
    measure: measureTitle,
  });
  const footerNote = note || (status === 'sold' ? 'Peça opções semelhantes no WhatsApp' :
    status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp' : 'Consulte disponibilidade e condições');
  const fittedNote = fitTitle({ text: footerNote, maxWidth: contentWidth, maxHeight: 36,
    lineHeight: 1, candidates: isSquare ? [26, 24, 22, 20, 18] : [30, 28, 26, 24, 22, 20], measure: measureTitle });
  const badgeFontSize = isSquare ? 26 : 29;
  const badgeWidth = Math.min(contentWidth, Math.ceil(measureTitle(badge, badgeFontSize)) + 52);
  const badgeHeight = isSquare ? 52 : 58;

  return <div ref={setContainer} style={{ width: '100%' }}>
    <div style={{ width: width * scale, height: height * scale, marginInline: 'auto', overflow: 'hidden' }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <Stage width={width} height={height} ref={stageRef}>
          <Layer key={String(fontsReady)}>
            {vertical ? <VerticalArt format={format as 'story' | 'tiktok'} template={template}
              photo={photo} logo={logo} title={title} year={year} price={price} phone={phone}
              status={status} note={note} measure={measureTitle} /> : <>
            <Rect width={width} height={height} fill={classic ? '#eee9df' : '#090c11'} />
            {classic ? <Rect width={width} height={photoTop - 14} fill="#090c11" /> : null}
            {photo && crop ? <KonvaImage image={photo} {...(containPhoto ? containedPhoto : photoBox)}
              {...(containPhoto ? {} : { crop })} /> :
              <Text x={inset} y={photoTop + photoHeight / 2 - 20} width={width - inset * 2}
                text="A foto aparecerá aqui" fill="#b8bec8" align="center" fontSize={36} />}
            {!classic ? <Rect x={0} y={photoTop + photoHeight * 0.65} width={width} height={photoHeight * 0.35 + 4}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: photoHeight * 0.35 + 4 }}
              fillLinearGradientColorStops={[0, 'rgba(9,12,17,0)', 1, '#090c11']} /> : null}
            {highlighted ? <>
              <Rect x={photoBox.x} y={photoBox.y} width={photoBox.width} height={photoBox.height}
                stroke="#eee9df" strokeWidth={4} cornerRadius={6} listening={false} />
              <Rect x={photoBox.x + photoBox.width - 28}
                y={photoTop + 24} width={28} height={140} fill={choice.accent} />
              {!vertical ? <Text x={width - inset - 420} y={isSquare ? 56 : 68} width={420} align="right" text="DESTAQUE DA SEMANA"
                fontFamily={ART_FONT_FAMILY} fontSize={isSquare ? 21 : 24} fontStyle="bold" fill="#d0d4dc" />
                : null}
            </> : null}
            {classic ? <>
              <Rect x={photoBox.x} y={photoBox.y} width={photoBox.width} height={photoBox.height}
                stroke="#090c11" strokeWidth={4} cornerRadius={4} listening={false} />
              <Rect x={0} y={footerTop - (isSquare ? 68 : 76)}
                width={width} height={8} fill={choice.accent} />
            </> : null}
            {unavailable && !classic ? <>
              <Rect {...photoBox} fill={status === 'sold' ? 'rgba(9,12,17,0.2)' : 'rgba(32,25,10,0.26)'} />
              <Rect x={inset} y={photoTop + photoHeight * 0.38}
                width={contentWidth} height={isSquare ? 112 : 128} cornerRadius={8}
                fill={status === 'sold' ? 'rgba(9,12,17,0.88)' : 'rgba(98,67,20,0.9)'} />
              <Text x={inset} y={photoTop + photoHeight * 0.38 + (isSquare ? 22 : 24)} width={contentWidth}
                align="center" text={badge} fill="#ffffff" fontFamily={ART_FONT_FAMILY}
                fontSize={isSquare ? 62 : 72} fontStyle="bold" />
            </> : null}
            <Rect x={0} y={0} width={width} height={14} fill={choice.accent} />
            {logo ? <KonvaImage image={logo} x={inset} y={isSquare ? 26 : 36}
              width={isSquare ? 210 : 260} height={isSquare ? 99 : 122} /> :
              <Text x={inset} y={isSquare ? 48 : 56} text="LIBERATO MOTOS CAR" fill="#ffffff" fontSize={isSquare ? 32 : 36} fontStyle="bold" />}
            {(!unavailable || classic) ? <Group x={inset} y={footerTop - (isSquare ? 56 : 62)}>
              <Rect width={badgeWidth} height={badgeHeight}
                fill={classic ? '#090c11' : choice.accent} cornerRadius={classic ? 4 : 8} />
              <Text x={24} y={isSquare ? 13 : 14} text={badge} fill="#ffffff" fontFamily={ART_FONT_FAMILY} fontSize={badgeFontSize} fontStyle="bold" wrap="none" />
            </Group> : null}
            <Text x={inset} y={titleY} width={contentWidth + 24}
              text={fittedTitle.lines.join('\n')} fill={ink} fontFamily={ART_FONT_FAMILY}
              fontSize={fittedTitle.size} fontStyle="bold" lineHeight={TITLE_LINE_HEIGHT} wrap="none" />
            <Text x={inset} y={yearY} width={contentWidth}
              text={year ? `ANO ${year}` : 'ANO NÃO INFORMADO'} fill={muted} fontFamily={ART_FONT_FAMILY} fontSize={isSquare ? 27 : 30} wrap="none" />
            {priceFeature ? <Rect x={inset} y={priceY - 10} width={contentWidth}
              height={isSquare ? 80 : 94} fill={choice.accent} cornerRadius={8} /> : null}
            <Text x={priceFeature ? inset + 20 : inset} y={priceY} width={contentWidth + 20}
              text={fittedPrice.lines.join('\n')} fill={priceFeature ? '#ffffff' : ink}
              fontFamily={ART_FONT_FAMILY} fontSize={fittedPrice.size}
              fontStyle="bold" wrap="none" />
            <Rect x={inset} y={height - (isSquare ? 142 : 162)} width={contentWidth} height={2}
              fill={classic ? '#8b918f' : '#57606c'} />
            <Text x={inset} y={height - (isSquare ? 126 : 144)} text={fittedNote.lines.join('\n')}
              width={contentWidth + 24} fill={muted} wrap="none"
              fontFamily={ART_FONT_FAMILY} fontSize={fittedNote.size} />
            <Text x={inset} y={height - (isSquare ? 82 : 94)} width={contentWidth + 24} text={phone} fill={ink}
              fontFamily={ART_FONT_FAMILY} fontSize={isSquare ? 38 : 42} fontStyle="bold" wrap="none" />
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
