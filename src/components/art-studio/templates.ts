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
  // O selo não pode repetir o rótulo do preço, que já diz "PREÇO DO ANÚNCIO" logo abaixo.
  { id: 'offer', label: 'Preço em destaque', heading: 'PREÇO EM DESTAQUE', accent: '#cf202c' },
  { id: 'reserved', label: 'Reservado', heading: 'RESERVADO', accent: '#9b6a24' },
  { id: 'sold', label: 'Vendido', heading: 'VENDIDO', accent: '#647081' },
  { id: 'classic', label: 'Tradicional', heading: 'COMPRA • VENDA • TROCA', accent: '#cf202c' },
];

/**
 * A aparência de cada modelo vira DADO. Antes era uma cadeia de ternários dentro do desenho
 * (`classic ? '#111820' : '#ffffff'` e parentes), o que obrigava a editar a geometria para
 * acrescentar um modelo. Aqui o layout é um só e o que muda é a paleta.
 */
export type ArtTheme = {
  background: string;
  ink: string;
  /** Texto de apoio: linha de dados, observação. */
  dim: string;
  /** Filete do topo. Pode ser claro, porque nada é escrito em cima dele. */
  accent: string;
  /**
   * Cor dos dois blocos sólidos — a pílula do selo e a placa do preço. É sempre escrita em branco,
   * então precisa de contraste suficiente para texto, o que nem todo `accent` tem.
   */
  chip: string;
  /** Painel atrás da foto. Sem ele, veículo escuro sobre fundo escuro desaparece. */
  photoPanel: string;
  /** Contorno do painel da foto, quando o modelo pede moldura. */
  photoStroke: string | null;
  /**
   * A marca tem duas versões e usar a errada a faz sumir: a negativa é branca e desaparece no
   * fundo claro do modelo Tradicional. Quem escolhe é o tema, não o componente.
   */
  logo: '/logo-liberato-negativo.png' | '/logo-liberato.png';
};

/** Branco sobre cada `chip`, conferido contra o mínimo de 4,5:1 da WCAG para texto. */
export const CHIP_INK = '#ffffff';

export const ART_THEMES: Record<ArtTemplate, ArtTheme> = {
  new: { logo: '/logo-liberato-negativo.png', background: '#0a0e13', ink: '#ffffff', dim: '#9fabb7', accent: '#d8202f', chip: '#d8202f', photoPanel: '#151c25', photoStroke: null },
  highlight: { logo: '/logo-liberato-negativo.png', background: '#0a0e13', ink: '#ffffff', dim: '#9fabb7', accent: '#d8202f', chip: '#d8202f', photoPanel: '#151c25', photoStroke: '#d8202f' },
  offer: { logo: '/logo-liberato-negativo.png', background: '#0a0e13', ink: '#ffffff', dim: '#9fabb7', accent: '#d8202f', chip: '#d8202f', photoPanel: '#151c25', photoStroke: null },
  reserved: { logo: '/logo-liberato-negativo.png', background: '#100f0c', ink: '#ffffff', dim: '#c4beb3', accent: '#b9893d', chip: '#7a5417', photoPanel: '#1d1b16', photoStroke: null },
  sold: { logo: '/logo-liberato-negativo.png', background: '#0e1115', ink: '#ffffff', dim: '#bac1c8', accent: '#8e9bac', chip: '#39424f', photoPanel: '#181d23', photoStroke: null },
  classic: { logo: '/logo-liberato.png', background: '#ece8de', ink: '#121820', dim: '#4d555f', accent: '#c91d2e', chip: '#c91d2e', photoPanel: '#ffffff', photoStroke: '#121820' },
};

export function templatesForStatus(status: string) {
  if (status === 'sold') return artTemplates.filter((template) => ['sold', 'classic'].includes(template.id));
  if (status === 'reserved') return artTemplates.filter((template) => ['reserved', 'classic'].includes(template.id));
  return artTemplates.filter((template) => !['sold', 'reserved'].includes(template.id));
}
