// Ajuste do título da arte: mede em pixels em vez de contar caracteres. O Konva descarta em
// silêncio as linhas que não cabem num Text de altura fixa; aqui a decisão é nossa e o corte,
// quando inevitável, aparece como reticências.

// A Archivo variável + a "Archivo Fallback" com métrica compensada que o next/font gera. O Konva
// só aspeia nomes com espaço e sem aspas, então aspas já postas passam intactas.
export const ART_FONT_FAMILY = '"Archivo", "Archivo Fallback"';

export type FitTitleInput = {
  text: string;
  maxWidth: number;
  maxHeight: number;
  lineHeight: number;
  /** Do maior para o menor corpo. */
  candidates: readonly number[];
  measure: (text: string, size: number) => number;
};

function wrap(text: string, size: number, maxWidth: number, measure: FitTitleInput['measure']): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const attempt = current ? `${current} ${word}` : word;
    if (measure(attempt, size) <= maxWidth) { current = attempt; continue; }
    if (current) lines.push(current);
    current = '';
    // Palavra sozinha mais larga que a linha: parte por letra, como o Konva faria.
    for (const char of word) {
      if (current && measure(current + char, size) > maxWidth) { lines.push(current); current = ''; }
      current += char;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function fitTitle({ text, maxWidth, maxHeight, lineHeight, candidates, measure }: FitTitleInput):
  { size: number; lines: readonly string[] } {
  const fits = (size: number, count: number) => count * size * lineHeight <= maxHeight;
  for (const size of candidates) {
    const lines = wrap(text, size, maxWidth, measure);
    if (fits(size, lines.length)) return { size, lines };
  }
  // Nada coube: fica o menor corpo, só com as linhas que cabem, e a última leva reticências.
  const size = candidates[candidates.length - 1];
  const kept = wrap(text, size, maxWidth, measure).slice(0, Math.max(1, Math.floor(maxHeight / (size * lineHeight))));
  let last = kept[kept.length - 1];
  while (last && measure(`${last}…`, size) > maxWidth) last = last.slice(0, -1).trimEnd();
  return { size, lines: [...kept.slice(0, -1), `${last}…`] };
}
