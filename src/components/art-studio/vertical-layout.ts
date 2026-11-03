import type { ArtFormat, ArtTemplate } from './templates';

/** Marca e texto ficam livres dos controles do topo, da direita e da base dos apps verticais. */
export const VERTICAL_SAFE = { left: 80, right: 900, top: 220, bottom: 1500 } as const;

export const VERTICAL_LAYOUT = {
  logo: { x: 96, y: 228, width: 220, height: 104 },
  kicker: { x: 80, y: 370, width: 820, height: 44 },
  title: { x: 80, y: 420, width: 820, height: 165 },
  year: { x: 80, y: 596, width: 820, height: 36 },
  photo: { x: 16, y: 650, width: 1048, height: 528 },
  priceLabel: { x: 80, y: 1202, width: 820, height: 34 },
  price: { x: 80, y: 1240, width: 820, height: 101 },
  contactLabel: { x: 80, y: 1362, width: 820, height: 30 },
  phone: { x: 80, y: 1398, width: 820, height: 58 },
  note: { x: 80, y: 1462, width: 820, height: 32 },
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

export function verticalPhotoBounds(format: ArtFormat, frame: { x: number; y: number; width: number; height: number } = VERTICAL_LAYOUT.photo) {
  // TikTok encosta controles à direita. A imagem permanece grande, mas deslocada levemente à esquerda.
  return format === 'tiktok'
    ? { x: frame.x + 24, y: frame.y + 14, width: frame.width - 112, height: frame.height - 28 }
    : { x: frame.x + 16, y: frame.y + 14, width: frame.width - 32, height: frame.height - 28 };
}
