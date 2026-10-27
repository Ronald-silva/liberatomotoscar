'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group } from 'react-konva';
import Konva from 'konva';
import { artFormats, artTemplates, type ArtFormat, type ArtTemplate } from './templates';

// O palco já tem 1080 px de largura. Em celulares HiDPI, duplicar a resolução
// interna dos dois canvas do Konva gastaria memória sem melhorar o arquivo final.
Konva.pixelRatio = 1;

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

export default function ArtCanvas({ format, template, photoUrl, title, year, price, phone, status, note,
  focalX, focalY, stageRef, onPhotoLoad }: {
  format: ArtFormat; template: ArtTemplate; photoUrl: string | null; title: string; year: number | null;
  price: string; phone: string; status: string; note: string; focalX: number; focalY: number;
  stageRef: RefObject<Konva.Stage | null>; onPhotoLoad: (loaded: boolean) => void;
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const photo = useLoadedImage(photoUrl);
  const logo = useLoadedImage('/logo-liberato-negativo.png');
  const { width, height } = artFormats[format];
  const choice = artTemplates.find((item) => item.id === template)!;
  useEffect(() => { onPhotoLoad(Boolean(photo)); }, [photo, onPhotoLoad]);
  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(() => setAvailableWidth(container.clientWidth));
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);
  const scale = Math.min(1, (availableWidth || 360) / width);
  // No vertical, reservamos o topo e a base para a interface das plataformas;
  // a faixa direita também fica livre para os controles do TikTok.
  const vertical = format === 'story' || format === 'tiktok';
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
  const titleSize = vertical ? 52 : Math.min(format === 'square' ? 59 : 66,
    title.length > 32 ? 48 : title.length > 24 ? 55 : 66);
  const priceY = vertical ? 1070 : footerTop + (format === 'square' ? 191 : 203);
  const footerNote = note || (status === 'sold' ? 'Peça opções semelhantes no WhatsApp' :
    status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp' : 'Consulte disponibilidade e condições');

  return <div ref={setContainer} style={{ width: '100%' }}>
    <div style={{ width: width * scale, height: height * scale, marginInline: 'auto', overflow: 'hidden' }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <Stage width={width} height={height} ref={stageRef}>
          <Layer>
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
                fontFamily="Archivo, Arial" fontSize={24} fontStyle="bold" fill="#d0d4dc" />
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
                align="center" text={badge} fill="#ffffff" fontFamily="Archivo, Arial"
                fontSize={77} fontStyle="bold" />
            </> : null}
            <Rect x={0} y={0} width={width} height={16} fill={choice.accent} />
            {logo ? <KonvaImage image={logo} x={inset} y={vertical ? 280 : 45}
              width={vertical ? 250 : 300} height={vertical ? 118 : 141} /> :
              <Text x={inset} y={vertical ? 300 : 54} text="LIBERATO MOTOS CAR" fill="#ffffff" fontSize={38} fontStyle="bold" />}
            {(!unavailable || classic) ? <Group x={inset} y={footerTop - 68}>
              <Rect width={Math.min(600, badge.length * 29 + 80)} height={64}
                fill={classic ? '#090c11' : choice.accent} cornerRadius={classic ? 0 : 8} />
              <Text x={26} y={15} text={badge} fill="#ffffff" fontFamily="Archivo, Arial" fontSize={31} fontStyle="bold" />
            </Group> : null}
            <Text x={inset} y={footerTop + 16} width={contentWidth} height={vertical ? 108 : 120}
              text={title.toLocaleUpperCase('pt-BR')} fill={ink} fontFamily="Archivo, Arial"
              fontSize={titleSize} fontStyle="bold" lineHeight={1.02} wrap="word" />
            <Text x={inset} y={vertical ? 1024 : footerTop + (format === 'square' ? 147 : 154)}
              text={year ? `ANO ${year}` : 'ANO NÃO INFORMADO'} fill={muted} fontFamily="Archivo, Arial" fontSize={31} />
            {priceFeature ? <Rect x={inset - 18} y={priceY - 8} width={contentWidth + 36}
              height={vertical || format === 'square' ? 88 : 100} fill={choice.accent} cornerRadius={8} /> : null}
            <Text x={inset} y={priceY} width={contentWidth}
              text={status === 'sold' ? 'VEJA OUTRAS OPÇÕES' : price} fill={priceFeature ? '#ffffff' : ink}
              fontFamily="Archivo, Arial" fontSize={status === 'sold' ? 52 : vertical ? 68 : format === 'square' ? 66 : 80}
              fontStyle="bold" />
            {!vertical ? <Rect x={inset} y={height - 126} width={contentWidth} height={2}
              fill={classic ? '#8b918f' : '#57606c'} />
              : null}
            <Text x={inset} y={vertical ? 1160 : height - 112} text={footerNote}
              width={contentWidth} height={vertical ? 32 : 40} ellipsis fill={muted}
              fontFamily="Archivo, Arial" fontSize={vertical ? 27 : 32} />
            <Text x={inset} y={vertical ? 1194 : height - 61} text={phone} fill={ink}
              fontFamily="Archivo, Arial" fontSize={vertical ? 40 : 42} fontStyle="bold" />
            {status === 'draft' || status === 'archived' ? <Text x={0} y={height / 2 - 70} width={width}
              text="PRÉVIA · NÃO PUBLICAR" align="center" fill="#ffffff" shadowColor="#000000"
              shadowBlur={10} fontSize={56} fontStyle="bold" /> : null}
          </Layer>
        </Stage>
      </div>
    </div>
  </div>;
}
