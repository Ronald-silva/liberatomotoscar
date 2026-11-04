import { Image as KonvaImage, Rect, Text } from 'react-konva';
import { ART_FONT_FAMILY, fitTitle } from './title-fit';
import { artTemplates, type ArtFormat, type ArtTemplate } from './templates';
import { VERTICAL_LAYOUT as L, VERTICAL_SAFE, VERTICAL_THEMES, verticalPhotoBounds } from './vertical-layout';

type Props = {
  format: Extract<ArtFormat, 'story' | 'tiktok'>;
  template: ArtTemplate;
  photo: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  title: string;
  year: number | null;
  price: string;
  phone: string;
  status: string;
  note: string;
  measure: (text: string, size: number) => number;
};

const WIDTH = 1080;
const HEIGHT = 1920;

/** A grade vertical usa de fato a área central do arquivo, deixando interface das redes livre. */
export function VerticalArt({ format, template, photo, logo, title, year, price, phone, status, note, measure }: Props) {
  const theme = VERTICAL_THEMES[template];
  const choice = artTemplates.find((item) => item.id === template)!;
  const isTiktok = format === 'tiktok';
  const textMaxWidth = isTiktok ? L.title.width : 920;
  const frameX = L.photo.x;
  const frameWidth = isTiktok ? 820 : L.photo.width;
  const dividerWidth = isTiktok ? L.title.width : 920;

  const badge = status === 'sold' ? 'VENDIDO' : status === 'reserved' ? 'RESERVADO' :
    template === 'offer' ? 'PREÇO EM DESTAQUE' : choice.heading;
  const fittedTitle = fitTitle({ text: title.toLocaleUpperCase('pt-BR'), maxWidth: textMaxWidth,
    maxHeight: L.title.height, lineHeight: 1.02, candidates: [68, 60, 52, 46, 40, 34], measure });
  const yearY = Math.min(L.year.y,
    Math.round(L.title.y + fittedTitle.lines.length * fittedTitle.size * 1.02 + 12));
  const photoY = Math.max(556, yearY + L.year.height + 16);
  const photoFrame = { x: frameX, y: photoY, width: frameWidth, height: L.photo.y + L.photo.height - photoY };
  const photoBounds = verticalPhotoBounds(format, photoFrame);
  const ratio = photo ? Math.min(photoBounds.width / photo.width, photoBounds.height / photo.height) : 1;
  const photoShape = photo ? {
    x: photoBounds.x + (photoBounds.width - photo.width * ratio) / 2,
    y: photoBounds.y + (photoBounds.height - photo.height * ratio) / 2,
    width: photo.width * ratio, height: photo.height * ratio,
  } : photoBounds;
  const priceText = status === 'sold' ? 'VEJA OUTRAS OPÇÕES' : price;
  const fittedPrice = fitTitle({ text: priceText, maxWidth: textMaxWidth, maxHeight: L.price.height,
    lineHeight: 1, candidates: status === 'sold' ? [58, 50, 44] : [84, 76, 68, 60, 54], measure });
  const footerNote = note || (status === 'sold' ? 'Peça opções semelhantes no WhatsApp' :
    status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp' : 'Consulte disponibilidade e condições');
  const fittedNote = fitTitle({ text: footerNote, maxWidth: textMaxWidth, maxHeight: L.note.height,
    lineHeight: 1, candidates: [25, 23, 21, 19], measure });
  const priceInk = theme.pricePlate ? '#ffffff' : theme.ink;

  return <>
    <Rect width={WIDTH} height={HEIGHT} fill={theme.background} />
    {theme.logoPlate ? <Rect x={0} y={VERTICAL_SAFE.top - 4} width={WIDTH} height={122} fill={theme.logoPlate} /> : null}
    <Rect x={VERTICAL_SAFE.left} y={L.logo.y} width={7} height={L.logo.height} fill={theme.accent} />
    {logo ? <KonvaImage image={logo} {...L.logo} /> : <Text x={L.logo.x} y={L.logo.y + 24}
      text="LIBERATO MOTOS CAR" fill="#ffffff" fontFamily={ART_FONT_FAMILY} fontSize={34} fontStyle="bold" />}
    <Rect x={VERTICAL_SAFE.left} y={368} width={dividerWidth} height={2}
      fill={theme.secondary} opacity={0.45} />

    <Text {...L.kicker} width={textMaxWidth} text={badge} fill={theme.accent} fontFamily={ART_FONT_FAMILY}
      fontSize={29} fontStyle="bold" letterSpacing={1.1} wrap="none" />
    <Text x={L.title.x} y={L.title.y} width={textMaxWidth + 24} text={fittedTitle.lines.join('\n')} fill={theme.ink} fontFamily={ART_FONT_FAMILY}
      fontSize={fittedTitle.size} fontStyle="bold" lineHeight={1.02} wrap="none" />
    <Text x={L.year.x} y={yearY} width={textMaxWidth} text={year ? `ANO ${year}` : 'ANO NÃO INFORMADO'} fill={theme.secondary}
      fontFamily={ART_FONT_FAMILY} fontSize={28} wrap="none" />

    <Rect {...photoFrame} cornerRadius={8} fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{ x: 0, y: photoFrame.height }}
      fillLinearGradientColorStops={[0, theme.photoTop, 1, theme.photoBottom]}
      stroke={theme.photoStroke ?? undefined} strokeWidth={theme.photoStroke ? 3 : 0} />
    <Rect x={photoFrame.x + 28} y={photoFrame.y + photoFrame.height - 54} width={photoFrame.width - 56} height={2}
      fill={theme.secondary} opacity={0.28} />
    {photo ? <KonvaImage image={photo} {...photoShape} /> :
      <Text x={photoFrame.x} y={photoFrame.y + photoFrame.height / 2 - 20} width={photoFrame.width} align="center"
        text="A foto aparecerá aqui" fill={theme.secondary} fontSize={34} fontFamily={ART_FONT_FAMILY} />}

    {theme.pricePlate ? <Rect x={frameX} y={L.priceLabel.y - 14} width={frameWidth} height={136} cornerRadius={8} fill={theme.pricePlate} /> :
      <Rect x={VERTICAL_SAFE.left} y={L.priceLabel.y - 12} width={116} height={6} fill={theme.accent} />}
    <Text x={L.priceLabel.x} y={L.priceLabel.y} width={textMaxWidth}
      text={status === 'sold' ? 'ESTOQUE LIBERATO' : 'PREÇO DO ANÚNCIO'}
      fill={theme.pricePlate ? '#ffffff' : theme.secondary} fontFamily={ART_FONT_FAMILY}
      fontSize={24} fontStyle="bold" letterSpacing={0.8} wrap="none" />
    <Text x={L.price.x} y={L.price.y} width={textMaxWidth + 24}
      text={fittedPrice.lines.join('\n')} fill={priceInk} fontFamily={ART_FONT_FAMILY}
      fontSize={fittedPrice.size} fontStyle="bold" wrap="none" />

    <Rect x={VERTICAL_SAFE.left} y={L.contactLabel.y - 12} width={dividerWidth} height={2}
      fill={theme.secondary} opacity={0.55} />
    <Text x={L.contactLabel.x} y={L.contactLabel.y} width={textMaxWidth} text="FALE COM A LIBERATO" fill={theme.secondary}
      fontFamily={ART_FONT_FAMILY} fontSize={24} fontStyle="bold" wrap="none" />
    <Text x={L.phone.x} y={L.phone.y} width={textMaxWidth + 24} text={phone} fill={theme.ink} fontFamily={ART_FONT_FAMILY}
      fontSize={44} fontStyle="bold" wrap="none" />
    <Text x={L.note.x} y={L.note.y} width={textMaxWidth + 24} text={fittedNote.lines.join('\n')} fill={theme.secondary}
      fontFamily={ART_FONT_FAMILY} fontSize={fittedNote.size} wrap="none" />

    {status === 'draft' || status === 'archived' ? <Text x={0} y={HEIGHT / 2 - 70} width={WIDTH}
      text="PRÉVIA · NÃO PUBLICAR" align="center" fill="#ffffff" shadowColor="#000000"
      shadowBlur={10} fontSize={56} fontStyle="bold" /> : null}
  </>;
}
