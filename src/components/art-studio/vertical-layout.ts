import type { ArtFormat, ArtTemplate } from './templates';

/** Área conservadora para marca e texto. A foto pode ocupar mais largura, sem esconder dados na UI. */
export const VERTICAL_SAFE = { left: 80, right: 920, top: 250, bottom: 1670 } as const;

export const VERTICAL_LAYOUT = {
  logo: { x: 108, y: 258, width: 238, height: 112 },
  kicker: { x: 80, y: 423, width: 840, height: 44 },
  title: { x: 80, y: 477, width: 840, height: 185 },
  year: { x: 80, y: 671, width: 840, height: 38 },
  photo: { x: 24, y: 713, width: 1032, height: 625 },
  priceLabel: { x: 80, y: 1372, width: 840, height: 35 },
  price: { x: 80, y: 1411, width: 840, height: 105 },
  contactLabel: { x: 80, y: 1539, width: 840, height: 35 },
  phone: { x: 80, y: 1576, width: 840, height: 60 },
  note: { x: 80, y: 1638, width: 840, height: 30 },
} as const;

export type VerticalTheme = {
  background: string; ink: string; secondary: string; accent: string;
  photoTop: string; photoBottom: string; photoStroke: string | null;
  logoPlate: string | null; pricePlate: string | null;
};

/** Os modelos compartilham uma grade editorial, com variação intencional de material e ênfase. */
export const VERTICAL_THEMES: Record<ArtTemplate, VerticalTheme> = {
  new: { background: '#090d12', ink: '#f8f8f6', secondary: '#b7c1cb', accent: '#d82032',
    photoTop: '#19222b', photoBottom: '#0b1016', photoStroke: null, logoPlate: null, pricePlate: null },
  highlight: { background: '#090d12', ink: '#f8f8f6', secondary: '#b7c1cb', accent: '#d82032',
    photoTop: '#1c242d', photoBottom: '#0b1016', photoStroke: '#d82032', logoPlate: null, pricePlate: null },
  offer: { background: '#090d12', ink: '#f8f8f6', secondary: '#b7c1cb', accent: '#d82032',
    photoTop: '#19222b', photoBottom: '#0b1016', photoStroke: null, logoPlate: null, pricePlate: '#d82032' },
  reserved: { background: '#10100e', ink: '#f8f8f6', secondary: '#c4beb3', accent: '#b9893d',
    photoTop: '#25221b', photoBottom: '#10100e', photoStroke: null, logoPlate: null, pricePlate: null },
  sold: { background: '#0e1115', ink: '#f8f8f6', secondary: '#bac1c8', accent: '#8e9bac',
    photoTop: '#20262d', photoBottom: '#0e1115', photoStroke: null, logoPlate: null, pricePlate: null },
  classic: { background: '#ece8de', ink: '#121820', secondary: '#4d555f', accent: '#c91d2e',
    photoTop: '#ddd8ce', photoBottom: '#c8c2b8', photoStroke: '#121820', logoPlate: '#090d12', pricePlate: null },
};

export function verticalPhotoBounds(format: ArtFormat) {
  const frame = VERTICAL_LAYOUT.photo;
  // TikTok encosta controles à direita. A imagem permanece grande, mas deslocada levemente à esquerda.
  return format === 'tiktok'
    ? { x: frame.x + 24, y: frame.y + 14, width: frame.width - 112, height: frame.height - 28 }
    : { x: frame.x + 16, y: frame.y + 14, width: frame.width - 32, height: frame.height - 28 };
}
