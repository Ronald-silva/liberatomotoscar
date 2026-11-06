/**
 * Razão de contraste da WCAG 2.2, para conferir por teste o que o olho não mede com honestidade.
 *
 * A fórmula já existia copiada dentro de `src/app/admin/contraste.test.ts`; aqui ela vira
 * utilitário porque a arte também precisa dela — e duas cópias divergem na primeira correção.
 */

/** Luminância relativa: canais sRGB linearizados e ponderados pela sensibilidade do olho. */
function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`cor precisa estar em #rrggbb: recebi ${JSON.stringify(hex)}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(match[1].slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** De 1 (idênticas) a 21 (branco sobre preto). A ordem das cores não importa. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
