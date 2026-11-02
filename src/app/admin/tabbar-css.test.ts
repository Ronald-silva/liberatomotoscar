import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/**
 * A barra de navegacao e fixa; sem estes acertos ela cobriria o botao de cadastrar do estoque e a
 * barra de publicar do editor. Quem e `sticky` com `bottom: 0` ficaria atras dela.
 */
const css = readFileSync(join(import.meta.dirname, 'admin.module.css'), 'utf8');
const rule = (selector: string) => {
  const m = css.match(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`regra ${selector} nao encontrada`);
  return m[1];
};

it('os dois rodapes pegajosos ficam acima da barra, nao atras dela', () => {
  expect(rule('.stickyAction')).toMatch(/bottom:\s*var\(--admin-tabbar/);
  expect(rule('.editorFooter')).toMatch(/bottom:\s*var\(--admin-tabbar/);
});

it('a barra e alvo de 44px ou mais e respeita a area segura do aparelho', () => {
  expect(rule('.tabBar')).toMatch(/position:\s*fixed/);
  expect(rule('.tabBar')).toMatch(/env\(safe-area-inset-bottom/);
  expect(Number(rule('.tabLink').match(/min-height:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(44);
});

it('o foco de um campo nao some atras da barra', () => {
  expect(css).toMatch(/scroll-padding-bottom:[^;]*--admin-tabbar/);
});

it('o editor reserva o pe da tela para a barra de publicar', () => {
  const editor = readFileSync(join(import.meta.dirname, '(protected)/veiculos/[id]/VehicleEditor.tsx'), 'utf8');
  expect(editor).toContain('styles.editorWithFooter');
});
