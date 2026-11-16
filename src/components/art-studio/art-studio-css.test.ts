import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/**
 * Guarda contra classe de CSS Modules inexistente **no estúdio de artes**.
 *
 * O painel já tinha este guarda (`src/app/admin/css-classes.test.ts`), e ele não alcança aqui: ele
 * varre `src/app/admin/**` procurando o prefixo literal `styles.` contra `admin.module.css`. O
 * estúdio vive em `src/components/art-studio/` e importa a folha como `artStyles`. Resultado: a
 * folha deste diretório não era conferida por ninguém — exatamente o defeito que aquele guarda
 * existe para pegar, acontecendo fora do alcance dele.
 *
 * CSS Modules devolve `undefined` em silêncio para classe que não existe: o nome entra no
 * `className` como "undefined" e nada acusa — nem typecheck, nem lint, nem build.
 *
 * O contrário não é exigido: classe definida e não usada é só sobra, não defeito.
 */

const DIR = import.meta.dirname;
const CSS_PATH = join(DIR, 'art-studio.module.css');

function definedClasses(css: string): Set<string> {
  const defined = new Set<string>();
  // Só o que está antes de cada "{" é seletor; assim nenhum valor de propriedade entra na conta.
  for (const block of css.split('{').slice(0, -1)) {
    const selector = block.split('}').at(-1) ?? '';
    for (const match of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) defined.add(match[1]);
  }
  return defined;
}

function referencedClasses(): Map<string, string[]> {
  const references = new Map<string, string[]>();
  for (const entry of readdirSync(DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.tsx') || entry.name.endsWith('.test.tsx')) continue;
    const source = readFileSync(join(DIR, entry.name), 'utf8');
    for (const match of source.matchAll(/\bartStyles\.([A-Za-z_][\w]*)/g)) {
      references.set(match[1], [...(references.get(match[1]) ?? []), entry.name]);
    }
  }
  return references;
}

it('encontra as telas do estúdio e a folha de estilo', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  expect(definedClasses(css).size).toBeGreaterThan(10);
  expect(referencedClasses().size).toBeGreaterThan(10);
});

it('define toda classe que o estúdio referencia', () => {
  const defined = definedClasses(readFileSync(CSS_PATH, 'utf8'));
  const faltando = [...referencedClasses()]
    .filter(([nome]) => !defined.has(nome))
    .map(([nome, arquivos]) => `${nome} (usada em ${arquivos.join(', ')})`);
  expect(faltando).toEqual([]);
});

/**
 * A prévia fixa do celular é meia regra em CSS e meia em JavaScript: a folha gruda a seção no topo,
 * `TELA_ESTREITA` manda o canvas desenhar na escala compacta. Separados, cada um faz um estrago
 * diferente — grudar sem encolher cobre os controles; encolher sem grudar deixa sobra no topo e o
 * problema original de pé. Este teste é o que mantém os dois no mesmo número.
 */
it('a largura da prévia fixa é a mesma no CSS e no ArtEditor', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  const editor = readFileSync(join(DIR, 'ArtEditor.tsx'), 'utf8');
  const noEditor = editor.match(/TELA_ESTREITA\s*=\s*'\(max-width:\s*(\d+)px\)'/);
  expect(noEditor, 'TELA_ESTREITA não encontrada em ArtEditor.tsx').toBeTruthy();
  const larguras = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([^]*?)\n\}/g)]
    .filter(([, , corpo]) => corpo.includes('position: sticky'))
    .map(([, largura]) => largura);
  expect(larguras, 'nenhuma media query da folha fixa a prévia').toHaveLength(1);
  expect(larguras[0]).toBe(noEditor![1]);
});

it('a prévia fixa tem fundo opaco, ou o que rola por baixo aparece através dela', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  const base = css.match(/\n\.preview \{([^}]*)\}/);
  expect(base?.[1]).toContain('background:');
});
