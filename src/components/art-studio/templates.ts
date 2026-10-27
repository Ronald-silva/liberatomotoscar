export const artFormats = {
  feed: { label: 'Instagram/Facebook · feed', width: 1080, height: 1350 },
  square: { label: 'Instagram/Facebook · quadrado', width: 1080, height: 1080 },
  story: { label: 'Instagram/Facebook · Stories', width: 1080, height: 1920 },
  tiktok: { label: 'TikTok · foto vertical', width: 1080, height: 1920 },
} as const;

export type ArtFormat = keyof typeof artFormats;
export type ArtTemplate = 'new' | 'highlight' | 'offer' | 'reserved' | 'sold' | 'classic';

export const artTemplates: { id: ArtTemplate; label: string; heading: string; accent: string }[] = [
  { id: 'new', label: 'Recém-chegado', heading: 'RECÉM-CHEGADO', accent: '#cf202c' },
  { id: 'highlight', label: 'Destaque da semana', heading: 'DESTAQUE DA SEMANA', accent: '#cf202c' },
  { id: 'offer', label: 'Preço em destaque', heading: 'PREÇO DO ANÚNCIO', accent: '#cf202c' },
  { id: 'reserved', label: 'Reservado', heading: 'RESERVADO', accent: '#9b6a24' },
  { id: 'sold', label: 'Vendido', heading: 'VENDIDO', accent: '#647081' },
  { id: 'classic', label: 'Tradicional', heading: 'COMPRA • VENDA • TROCA', accent: '#cf202c' },
];

export function templatesForStatus(status: string) {
  if (status === 'sold') return artTemplates.filter((template) => ['sold', 'classic'].includes(template.id));
  if (status === 'reserved') return artTemplates.filter((template) => ['reserved', 'classic'].includes(template.id));
  return artTemplates.filter((template) => !['sold', 'reserved'].includes(template.id));
}
