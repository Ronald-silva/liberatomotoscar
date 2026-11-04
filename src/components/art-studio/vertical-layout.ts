import type { ArtFormat, ArtTemplate } from './templates';

/** Marca e texto ficam livres dos controles do topo, da direita e da base dos apps verticais. */
export const VERTICAL_SAFE = { left: 80, right: 884, top: 252, bottom: 1388 } as const;

export const VERTICAL_LAYOUT = {
  logo: { x: 96, y: 256, width: 210, height: 99 },
  kicker: { x: 80, y: 382, width: 804, height: 38 },
  title: { x: 80, y: 424, width: 804, height: 140 },
  year: { x: 80, y: 570, width: 804, height: 32 },
  photo: { x: 64, y: 612, width: 952, height: 504 },
  priceLabel: { x: 80, y: 1134, width: 804, height: 30 },
  price: { x: 80, y: 1168, width: 804, height: 88 },
  contactLabel: { x: 80, y: 1274, width: 804, height: 28 },
  phone: { x: 80, y: 1304, width: 804, height: 48 },
  note: { x: 80, y: 1356, width: 804, height: 30 },
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
  // TikTok encosta controles à direita (x >= 900). Limitamos o quadro da foto até x = 884 no TikTok
  // e mantemos simetria centralizada nos Stories/Status.
  return format === 'tiktok'
    ? { x: frame.x + 16, y: frame.y + 14, width: 804, height: frame.height - 28 }
    : { x: frame.x + 16, y: frame.y + 14, width: frame.width - 32, height: frame.height - 28 };
}
