import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda de contraste do sistema visual (WCAG 2.2): texto em 4,5:1 e contorno de controle em 3:1.
 *
 * A versão anterior deste teste lia só `admin.module.css`, e por isso não via que
 * `--attendance-line` estava em 2,21:1 contra a superfície — sendo o único contorno das fichas de
 * filtro do atendimento. A lição ficou: a guarda precisa valer para a folha onde a cor nasce, que
 * hoje é uma só (`tokens.css`), e precisa recusar que alguém volte a escrever uma cor de contorno
 * à mão em qualquer folha.
 *
 * Separador não entra aqui. `--line` desenha régua entre seções e itens de lista, não delimita
 * controle, e a norma não pede 3:1 para isso.
 */

const dir = import.meta.dirname;
const tokens = readFileSync(join(dir, 'tokens.css'), 'utf8');

const folhas = {
  'globals.css': join(dir, 'globals.css'),
  'admin.module.css': join(dir, 'admin/admin.module.css'),
  'attendance.module.css': join(dir, 'admin/(protected)/atendimento/attendance.module.css'),
  'metricas.module.css': join(dir, 'admin/(protected)/metricas/metricas.module.css'),
} as const;

/** Resolve um token de `tokens.css` até o hexadecimal, seguindo apelidos `var(--outro)`. */
function cor(nome: string, saltos = 0): string {
  if (saltos > 5) throw new Error(`--${nome}: cadeia de var() longa demais, provável ciclo`);
  const achado = tokens.match(new RegExp(`--${nome}:\\s*([^;]+);`));
  if (!achado) throw new Error(`--${nome} não existe em tokens.css`);
  const valor = achado[1].trim();
  const apelido = valor.match(/^var\(\s*--([a-z0-9-]+)\s*\)$/i);
  if (apelido) return cor(apelido[1], saltos + 1);
  // `#fff` e `#ffffff` são a mesma cor; a medição precisa dos seis dígitos.
  const curto = valor.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (curto) return `#${curto[1]}${curto[1]}${curto[2]}${curto[2]}${curto[3]}${curto[3]}`;
  if (!/^#[0-9a-f]{6}$/i.test(valor)) throw new Error(`--${nome} não é #rrggbb nem apelido: ${valor}`);
  return valor;
}

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

const fundos = ['bg', 'surface', 'surface-raised'] as const;

describe('contraste do sistema visual', () => {
  it('o contorno de controle tem 3:1 contra todos os fundos', () => {
    for (const fundo of fundos) {
      expect(contraste(cor('line-strong'), cor(fundo)), `line-strong sobre ${fundo}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('todo tom de texto tem 4,5:1 contra todos os fundos', () => {
    for (const tinta of ['ink', 'ink-muted', 'ink-soft'] as const) {
      for (const fundo of fundos) {
        expect(contraste(cor(tinta), cor(fundo)), `${tinta} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('as cores de estado têm 4,5:1 contra fundo e superfície', () => {
    for (const estado of ['ok', 'warn', 'danger', 'info'] as const) {
      expect(contraste(cor(estado), cor('bg')), `${estado} sobre bg`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(cor(estado), cor('surface')), `${estado} sobre surface`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o branco se lê sobre os preenchimentos vermelhos', () => {
    for (const vermelho of ['red', 'red-dark'] as const) {
      expect(contraste(cor('white'), cor(vermelho)), `branco sobre ${vermelho}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o vermelho de texto se lê sobre o fundo', () => {
    expect(contraste(cor('red-ink'), cor('bg'))).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * O defeito original foi uma folha declarar a própria cor de contorno. Esta guarda recusa a
   * reincidência: cor de contorno nasce em `tokens.css` e chega às folhas como `var()`.
   */
  it('nenhuma folha escreve uma cor de contorno à mão', () => {
    for (const [nome, caminho] of Object.entries(folhas)) {
      const css = readFileSync(caminho, 'utf8');
      const literais = [...css.matchAll(/(--[a-z-]*(?:line|border|contorno)[a-z-]*):\s*(#[0-9a-f]{3,8})\b/gi)];
      expect(literais.map((m) => `${m[1]}: ${m[2]}`), `${nome} declara contorno em hexadecimal`).toEqual([]);
    }
  });
});
