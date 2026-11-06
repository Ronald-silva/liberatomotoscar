import { BRAND } from '@/data/brand';
import type { ArtDestination } from './destinations';

export type CaptionVehicle = {
  title: string; brand: string | null; model: string | null;
  type: 'motorcycle' | 'car'; year: number | null; mileageKm: number | null;
  color: string | null; price: string; priceCents: number | null;
  status: string; publicUrl: string | null;
};

/**
 * O que o destino decide na legenda.
 *
 * Antes havia dois eixos que se sobrepunham — a plataforma e o formato — e o resultado era que uma
 * legenda longa do Facebook podia sair num arquivo 9:16 de Stories. Agora é um eixo só, e esta
 * tabela é indexada por `ArtDestination` de propósito: destino novo não compila sem decidir isto.
 */
type CaptionStyle = {
  /** A variante longa tem convite, endereço do anúncio e respiro entre blocos. */
  long: boolean;
  /** O endereço do anúncio. Só onde o link é clicável e vive na legenda. */
  link: boolean;
  tags: 'none' | 'local' | 'local+category';
};

const CAPTION_STYLE: Record<ArtDestination, CaptionStyle> = {
  // Feed do Instagram e do Facebook: é a única legenda que as pessoas leem inteira, e a única em
  // que o endereço do anúncio vale — no Stories ele não é clicável e no Status ele vira texto cru.
  feed: { long: true, link: true, tags: 'local' },
  story: { long: false, link: false, tags: 'local' },
  // O Status do WhatsApp é conversa, não vitrine: hashtag ali não é buscável e lê como spam.
  whatsapp: { long: false, link: false, tags: 'none' },
  // O TikTok é o único que vive de busca por assunto, então é o único que leva a categoria ampla.
  tiktok: { long: false, link: false, tags: 'local+category' },
};

function oneLine(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hashtag(value: string) {
  const clean = value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '');
  return clean ? `#${clean.slice(0, 30)}` : null;
}

// As famílias da loja saem do BrandKit (§9 do spec); só a do modelo nasce do veículo.
function hashtags(vehicle: CaptionVehicle, style: CaptionStyle) {
  if (style.tags === 'none') return '';
  const tags = [
    hashtag(`${vehicle.brand ?? ''} ${vehicle.model ?? ''}`),
    ...BRAND.hashtags.local[vehicle.type],
    ...(style.tags === 'local+category' ? BRAND.hashtags.category[vehicle.type] : []),
    ...BRAND.hashtags.brand,
  ];
  return [...new Set(tags.filter((tag): tag is string => Boolean(tag)))].join(' ');
}

/** Texto de partida factual e específico para o destino. A pessoa pode editar antes de publicar. */
export function createCaption(vehicle: CaptionVehicle, destination: ArtDestination, phone: string) {
  const style = CAPTION_STYLE[destination];
  const icon = vehicle.type === 'motorcycle' ? '🏍️' : '🚗';
  const name = oneLine(vehicle.title);
  const headline = `${icon} ${name}${vehicle.year && !name.includes(String(vehicle.year)) ? ` • ${vehicle.year}` : ''}`;
  const details = [vehicle.mileageKm === null ? null : `${new Intl.NumberFormat('pt-BR').format(vehicle.mileageKm)} km`,
    vehicle.color ? oneLine(vehicle.color) : null].filter(Boolean).join(' • ');
  const sold = vehicle.status === 'sold';
  const reserved = vehicle.status === 'reserved';
  const price = !sold && vehicle.priceCents ? oneLine(vehicle.price) : null;
  const state = sold ? 'Vendido. Consulte outras opções com a equipe.' :
    reserved ? 'Reservado. Consulte a disponibilidade e outras opções com a equipe.' :
      'Confirme a disponibilidade e as condições com a equipe.';
  const tags = hashtags(vehicle, style);
  const contact = `WhatsApp da Liberato: ${phone}`;

  if (!style.long) {
    return [headline, details || null, price, state, contact, tags || null].filter(Boolean).join('\n');
  }

  const intro = `Veja as fotos e os detalhes deste veículo na ${BRAND.name}, em Fortaleza/CE.`;
  // Vendido não tem o anúncio promovido: mandar gente à página de um veículo que já saiu é o
  // anúncio vencido que o §7 do spec recusa.
  const link = style.link && vehicle.publicUrl && !sold ? `Anúncio: ${vehicle.publicUrl}` : null;
  return [headline, details || null, price, '', intro, state, contact, link, '', tags].filter((part, index, all) =>
    part !== null && part !== undefined && (part !== '' || (index > 0 && all[index - 1] !== ''))).join('\n').trim();
}
