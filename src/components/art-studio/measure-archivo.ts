import advances from './__fixtures__/archivo-advances.json';
import type { Measure } from './art-layout';

/**
 * `Measure` com a métrica real da Archivo, para os testes de composição da arte.
 *
 * A produção mede com `ctx.measureText(...) * 1.03` arredondado para cima (`ArtCanvas.tsx`).
 * Esta implementação faz as mesmas três operações sobre a tabela de avanço extraída dos TTFs em
 * disco (`scripts/gen-archivo-advances.ts`), de modo que teste e produção divirjam só pelo
 * kerning — que a Archivo aplica com parcimônia e que a folga de 3% cobre. Antes disso o teste
 * media com `length × size × 0,62` e validava um layout que não era o que embarcava.
 *
 * Só os pesos 400 e 900 existem, porque são as duas únicas instâncias em disco e os dois únicos
 * pesos que a arte usa. Como o Konva manda qualquer peso >= 600 para o desenho em negrito, é esse
 * o ponto de corte aqui também.
 */

/** A folga de rasterização da produção. Mudar aqui exige mudar em `ArtCanvas.tsx`. */
const RASTER_SLACK = 1.03;

/** Peso a partir do qual o Konva desenha com a instância negrito. */
const BOLD_THRESHOLD = 600;

/** Avanço usado para caractere fora da tabela. */
const FALLBACK_CHAR = 'x';

export function createArchivoMeasure(): Measure {
  const { unitsPerEm, weights } = advances;
  const tables = { regular: weights['400'], bold: weights['900'] } as const;

  return (text, size, weight) => {
    const table: Record<string, number> = weight >= BOLD_THRESHOLD ? tables.bold : tables.regular;
    const fallback = table[FALLBACK_CHAR];
    let units = 0;
    for (const char of text) units += table[char] ?? fallback;
    return Math.ceil((units * size / unitsPerEm) * RASTER_SLACK);
  };
}
