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
  const badge = status === 'sold' ? 'VENDIDO' : status === 'reserved' ? 'RESERVADO' :
    template === 'offer' ? 'PREÇO EM DESTAQUE' : choice.heading;
  const photoBounds = verticalPhotoBounds(format);
  const ratio = photo ? Math.min(photoBounds.width / photo.width, photoBounds.height / photo.height) : 1;
  const photoShape = photo ? {
    x: photoBounds.x + (photoBounds.width - photo.width * ratio) / 2,
    y: photoBounds.y + (photoBounds.height - photo.height * ratio) / 2,
    width: photo.width * ratio, height: photo.height * ratio,
  } : photoBounds;
  const fittedTitle = fitTitle({ text: title.toLocaleUpperCase('pt-BR'), maxWidth: L.title.width,
    maxHeight: L.title.height, lineHeight: 1.02, candidates: [74, 66, 58, 50, 42, 36], measure });
  const priceText = status === 'sold' ? 'VEJA OUTRAS OPÇÕES' : price;
  const fittedPrice = fitTitle({ text: priceText, maxWidth: L.price.width, maxHeight: L.price.height,
    lineHeight: 1, candidates: status === 'sold' ? [62, 54, 48] : [92, 84, 76, 68, 60], measure });
  const footerNote = note || (status === 'sold' ? 'Peça opções semelhantes no WhatsApp' :
    status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp' : 'Consulte disponibilidade e condições');
  const priceInk = theme.pricePlate ? '#ffffff' : theme.ink;

  return <>
    <Rect width={WIDTH} height={HEIGHT} fill={theme.background} />
    {theme.logoPlate ? <Rect x={0} y={VERTICAL_SAFE.top - 26} width={WIDTH} height={170} fill={theme.logoPlate} /> : null}
    <Rect x={VERTICAL_SAFE.left} y={VERTICAL_SAFE.top + 4} width={7} height={114} fill={theme.accent} />
    {logo ? <KonvaImage image={logo} {...L.logo} /> : <Text x={L.logo.x} y={L.logo.y + 28}
      text="LIBERATO MOTOS CAR" fill="#ffffff" fontFamily={ART_FONT_FAMILY} fontSize={36} fontStyle="bold" />}
    <Rect x={VERTICAL_SAFE.left} y={397} width={VERTICAL_SAFE.right - VERTICAL_SAFE.left} height={2}
      fill={theme.secondary} opacity={0.45} />

    <Text {...L.kicker} text={badge} fill={theme.accent} fontFamily={ART_FONT_FAMILY}
      fontSize={31} fontStyle="bold" letterSpacing={1.1} />
    <Text {...L.title} text={fittedTitle.lines.join('\n')} fill={theme.ink} fontFamily={ART_FONT_FAMILY}
      fontSize={fittedTitle.size} fontStyle="bold" lineHeight={1.02} wrap="none" />
    <Text {...L.year} text={year ? `ANO ${year}` : 'ANO NÃO INFORMADO'} fill={theme.secondary}
      fontFamily={ART_FONT_FAMILY} fontSize={30} />

    <Rect {...L.photo} fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{ x: 0, y: L.photo.height }}
      fillLinearGradientColorStops={[0, theme.photoTop, 1, theme.photoBottom]}
      stroke={theme.photoStroke ?? undefined} strokeWidth={theme.photoStroke ? 3 : 0} />
    <Rect x={L.photo.x + 30} y={L.photo.y + L.photo.height - 66} width={L.photo.width - 60} height={2}
      fill={theme.secondary} opacity={0.28} />
    {photo ? <KonvaImage image={photo} {...photoShape} /> :
      <Text x={L.photo.x} y={L.photo.y + 280} width={L.photo.width} align="center"
        text="A foto aparecerá aqui" fill={theme.secondary} fontSize={34} fontFamily={ART_FONT_FAMILY} />}

    {theme.pricePlate ? <Rect x={64} y={1353} width={912} height={157} fill={theme.pricePlate} /> :
      <Rect x={VERTICAL_SAFE.left} y={1350} width={116} height={7} fill={theme.accent} />}
    <Text {...L.priceLabel} y={theme.pricePlate ? 1365 : L.priceLabel.y}
      text={status === 'sold' ? 'ESTOQUE LIBERATO' : 'PREÇO DO ANÚNCIO'}
      fill={theme.pricePlate ? '#ffffff' : theme.secondary} fontFamily={ART_FONT_FAMILY}
      fontSize={26} fontStyle="bold" letterSpacing={0.8} />
    <Text {...L.price} y={theme.pricePlate ? 1401 : L.price.y}
      text={fittedPrice.lines.join('\n')} fill={priceInk} fontFamily={ART_FONT_FAMILY}
      fontSize={fittedPrice.size} fontStyle="bold" wrap="none" />

    <Rect x={VERTICAL_SAFE.left} y={1526} width={VERTICAL_SAFE.right - VERTICAL_SAFE.left} height={2}
      fill={theme.secondary} opacity={0.55} />
    <Text {...L.contactLabel} text="FALE COM A LIBERATO" fill={theme.secondary}
      fontFamily={ART_FONT_FAMILY} fontSize={27} fontStyle="bold" />
    <Text {...L.phone} text={phone} fill={theme.ink} fontFamily={ART_FONT_FAMILY}
      fontSize={48} fontStyle="bold" />
    <Text {...L.note} text={footerNote} fill={theme.secondary} fontFamily={ART_FONT_FAMILY}
      fontSize={25} ellipsis />

    {status === 'draft' || status === 'archived' ? <Text x={0} y={HEIGHT / 2 - 70} width={WIDTH}
      text="PRÉVIA · NÃO PUBLICAR" align="center" fill="#ffffff" shadowColor="#000000"
      shadowBlur={10} fontSize={56} fontStyle="bold" /> : null}
  </>;
}
