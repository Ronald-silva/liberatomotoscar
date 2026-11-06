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

/**
 * Avanço para caractere fora da tabela: o **maior** avanço da própria instância.
 *
 * A reserva anterior era o avanço do `x`. Ela super-mede `!` e `?`, o que é inofensivo, mas
 * sub-mede `@`, `—` e emoji — e sub-medir é o único erro perigoso desta tabela, porque faz o teste
 * abençoar um layout que estoura na produção, exatamente o defeito que a medição fiel existe para
 * matar. Com o maior avanço da instância, o erro de um caractere desconhecido só pode ser para
 * cima: o corpo cai um degrau e nada vaza.
 *
 * Derivado da tabela, e não um caractere cravado, também para que não exista o caso em que a
 * reserva não está na tabela e **toda** medição vira `NaN` em silêncio.
 */
const widest = (table: Record<string, number>) => Math.max(...Object.values(table));

export function createArchivoMeasure(): Measure {
  const { unitsPerEm, weights } = advances;
  const tables = { regular: weights['400'], bold: weights['900'] } as const;
  const fallbacks = { regular: widest(tables.regular), bold: widest(tables.bold) };

  return (text, size, weight) => {
    const negrito = weight >= BOLD_THRESHOLD;
    const table: Record<string, number> = negrito ? tables.bold : tables.regular;
    const fallback = negrito ? fallbacks.bold : fallbacks.regular;
    let units = 0;
    for (const char of text) units += table[char] ?? fallback;
    return Math.ceil((units * size / unitsPerEm) * RASTER_SLACK);
  };
}
