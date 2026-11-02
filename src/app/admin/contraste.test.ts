import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda de contraste da borda do painel (WCAG 2.2, critério 1.4.11, componente não textual).
 *
 * A borda é o que mostra onde um botão ou campo começa e termina; abaixo de 3:1 contra o que
 * está atrás dela ela some para quem enxerga pouco ou usa a tela sob sol. O texto já é coberto
 * por outras medições; este teste cuida só do que não é texto.
 */

const css = readFileSync(join(import.meta.dirname, 'admin.module.css'), 'utf8');

function token(nome: string): string {
  const achado = css.match(new RegExp(`--admin-${nome}:\\s*(#[0-9a-f]{6})\\b`, 'i'));
  if (!achado) throw new Error(`token --admin-${nome} não encontrado como #rrggbb em admin.module.css`);
  return achado[1];
}

// Luminância relativa da WCAG: canais sRGB linearizados e ponderados.
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const canal = parseInt(hex.slice(i, i + 2), 16) / 255;
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (maior + 0.05) / (menor + 0.05);
}

describe('contraste da borda do painel', () => {
  it('a borda do painel tem 3:1 contra o fundo e contra a superficie', () => {
    expect(contraste(token('line'), token('bg'))).toBeGreaterThanOrEqual(3);
    expect(contraste(token('line'), token('surface'))).toBeGreaterThanOrEqual(3);
  });
});
