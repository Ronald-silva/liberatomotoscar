import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statusLabels } from './(protected)/veiculos/status';

/**
 * Guarda contra classe de CSS Modules inexistente.
 *
 * CSS Modules devolve `undefined` em silêncio para uma classe que não existe: o nome entra no
 * `className` como "undefined" e nada acusa — nem typecheck, nem lint, nem build. Já foi assim
 * que um arquivo de estilo foi parar em caminho errado sem ninguém notar. Este teste compara o
 * que as telas do painel referenciam com o que a folha realmente define.
 *
 * O contrário não é exigido: classe definida e não usada é só sobra, não defeito.
 *
 * A versão anterior procurava `styles.X` e media tudo contra `admin.module.css`. Isso valia
 * enquanto havia uma folha só; com `attendance.module.css` e `metricas.module.css`, um arquivo
 * que importa a própria folha como `styles` passou a ser medido contra a folha errada — e a tela
 * de métricas, que tem folha própria, ficaria fora de qualquer guarda. Agora cada referência é
 * resolvida pelo import que a trouxe, qualquer que seja o nome da variável.
 */

const ADMIN_DIR = join(import.meta.dirname, '.');
const CSS_PATH = join(ADMIN_DIR, 'admin.module.css');

function filesUnder(dir: string, extension: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path, extension);
    return entry.name.endsWith(extension) ? [path] : [];
  });
}

// Só o que está antes de cada "{" é seletor; assim nenhum valor de propriedade entra na conta.
function definedClasses(css: string): Set<string> {
  const defined = new Set<string>();
  for (const block of css.split('{').slice(0, -1)) {
    const selector = block.split('}').at(-1) ?? '';
    for (const match of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) defined.add(match[1]);
  }
  return defined;
}

/** `import algumaCoisa from './x.module.css'` → { algumaCoisa: '/caminho/absoluto/x.module.css' }. */
function cssImports(file: string, source: string): Map<string, string> {
  const imports = new Map<string, string>();
  for (const match of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.css)['"]/g)) {
    imports.set(match[1], resolve(dirname(file), match[2]));
  }
  return imports;
}

/** Cada referência vira "folha → classe → arquivos que a usam", para o erro dizer onde olhar. */
function referencesByStylesheet(): Map<string, Map<string, string[]>> {
  const byStylesheet = new Map<string, Map<string, string[]>>();
  for (const file of filesUnder(ADMIN_DIR, '.tsx')) {
    const source = readFileSync(file, 'utf8');
    const imports = cssImports(file, source);
    for (const [variable, stylesheet] of imports) {
      const pattern = new RegExp(`\\b${variable}\\.([A-Za-z_][\\w]*)`, 'g');
      for (const match of source.matchAll(pattern)) {
        const classes = byStylesheet.get(stylesheet) ?? new Map<string, string[]>();
        classes.set(match[1], [...(classes.get(match[1]) ?? []), file.slice(ADMIN_DIR.length)]);
        byStylesheet.set(stylesheet, classes);
      }
    }
  }
  return byStylesheet;
}

describe('classes de CSS Modules do painel', () => {
  const defined = definedClasses(readFileSync(CSS_PATH, 'utf8'));

  it('encontra as telas e a folha de estilo', () => {
    expect(filesUnder(ADMIN_DIR, '.tsx').length).toBeGreaterThan(5);
    expect(defined.size).toBeGreaterThan(20);
  });

  // Sem isto, um import renomeado tiraria a tela da guarda sem nenhum teste falhar.
  it('cobre mais de uma folha: toda folha importada pelas telas é medida', () => {
    const stylesheets = [...referencesByStylesheet().keys()];
    expect(stylesheets.length).toBeGreaterThanOrEqual(3);
    expect(stylesheets).toContain(CSS_PATH);
  });

  it('define toda classe referenciada pelas telas, em cada folha', () => {
    const missing: string[] = [];
    for (const [stylesheet, classes] of referencesByStylesheet()) {
      const declared = definedClasses(readFileSync(stylesheet, 'utf8'));
      for (const [name, files] of classes) {
        if (!declared.has(name)) {
          missing.push(`${name} (${stylesheet.slice(ADMIN_DIR.length)}, usada em ${files.join(', ')})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  // .button é aplicada a <button>, <a> e <label>. Só o <button> é inline-block por padrão do
  // navegador; <a> e <label> são inline, e em caixa inline min-height e padding vertical não
  // entram no cálculo da linha — o padding transborda e pinta sobre o conteúdo seguinte. Foi
  // exatamente isso que fez o botão "Adicionar fotos" cobrir o texto explicativo: ele media 17px
  // em vez de 52px. Sem display declarado, o defeito volta em silêncio.
  it('declara display em .button, que é usada em elementos inline', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    const regra = css.slice(css.indexOf('.button {'), css.indexOf('}', css.indexOf('.button {')));
    expect(regra).toMatch(/display:\s*(inline-)?flex/);
  });

  // badgeClassName monta o nome em tempo de execução, então nenhuma busca por texto o encontraria.
  it.each(Object.keys(statusLabels))('define a etiqueta do estado %s', (status) => {
    expect(defined.has(`badge_${status}`)).toBe(true);
  });
});
