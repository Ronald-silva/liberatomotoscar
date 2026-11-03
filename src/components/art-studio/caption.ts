import type { ArtFormat } from './templates';

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'whatsapp';

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', whatsapp: 'WhatsApp Status',
};

export type CaptionVehicle = {
  title: string; brand: string | null; model: string | null;
  type: 'motorcycle' | 'car'; year: number | null; mileageKm: number | null;
  color: string | null; price: string; priceCents: number | null;
  status: string; publicUrl: string | null;
};

function oneLine(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hashtag(value: string) {
  const clean = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '');
  return clean ? `#${clean.slice(0, 30)}` : null;
}

function hashtags(vehicle: CaptionVehicle, platform: SocialPlatform, format: ArtFormat) {
  if (platform === 'whatsapp') return '';
  const local = vehicle.type === 'motorcycle' ? '#MotosFortaleza' : '#CarrosFortaleza';
  const category = vehicle.type === 'motorcycle' ? '#MotosCE' : '#CarrosCE';
  const model = hashtag(`${vehicle.brand ?? ''} ${vehicle.model ?? ''}`);
  const tags = [model, local, ...(platform === 'tiktok' && format === 'tiktok' ? [category] : []), '#LiberatoMotosCar'];
  return [...new Set(tags.filter((tag): tag is string => Boolean(tag)))].join(' ');
}

/** Texto de partida factual e específico para o destino. A pessoa pode editar antes de publicar. */
export function createCaption(vehicle: CaptionVehicle, platform: SocialPlatform, format: ArtFormat, phone: string) {
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
  const tags = hashtags(vehicle, platform, format);
  const contact = `WhatsApp da Liberato: ${phone}`;
  const short = format === 'story' || platform === 'whatsapp';

  if (short) {
    return [headline, details || null, price, state, contact, tags || null].filter(Boolean).join('\n');
  }

  const intro = platform === 'tiktok' ? 'Quer ver mais fotos e detalhes? Fale com a Liberato Motos Car em Fortaleza.' :
    'Veja as fotos e os detalhes deste veículo na Liberato Motos Car, em Fortaleza/CE.';
  const link = platform === 'facebook' && vehicle.publicUrl && !sold ? `Anúncio: ${vehicle.publicUrl}` : null;
  return [headline, details || null, price, '', intro, state, contact, link, '', tags].filter((part, index, all) =>
    part !== null && part !== undefined && (part !== '' || (index > 0 && all[index - 1] !== ''))).join('\n').trim();
}
