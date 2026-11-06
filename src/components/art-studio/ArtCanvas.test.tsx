import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O contrato de **medição** do ArtCanvas.
 *
 * ATENÇÃO PARA QUEM FOR FAZER A TAREFA 7: este arquivo já existe e estes dois testes precisam
 * sobreviver à reescrita do ArtCanvas. Eles não são sobre desenho — são sobre a fidelidade de
 * medição que a Tarefa 1 existe para criar, e as varreduras planejadas para a Tarefa 7
 * (`/fontStyle=["'{]?\s*['"]?bold/` e `/\b(700|800)\b/`) **não pegam** o defeito que eles pegam,
 * porque a string `'bold'` do `measureText` não casa com nenhuma das duas.
 *
 * O defeito: a Archivo entra por `next/font/google` como fonte variável 400-900, então `bold` no
 * atalho `font` do canvas instancia **wght 700**, enquanto a fixture que os testes usam foi
 * extraída do `Archivo-Black.ttf` (**900**). As duas instâncias diferem 6% na largura. Enquanto o
 * desenho também era 700, o erro caía na direção segura (o teste super-media); no instante em que
 * a Tarefa 7 passar a desenhar em `fontStyle="900"`, ele inverte — a produção passa a medir 6% a
 * menos do que desenha, e um título de 936 px desenha 995, ou seja 59 px fora da área segura. Que
 * é o objetivo nº 1 do spec.
 *
 * Só a linha da medição é afirmada aqui. Os `fontStyle="bold"` do desenho são da Tarefa 7.
 */
describe('o ArtCanvas mede o que desenha', () => {
  const fonte = () => readFileSync('src/components/art-studio/ArtCanvas.tsx', 'utf8');

  it('mede no peso numérico pedido, não no atalho "bold"', () => {
    const linha = fonte().match(/measureContext\.font = .*/)?.[0] ?? '';
    expect(linha).not.toBe('');
    expect(linha).not.toMatch(/bold|normal/);
    expect(linha).toContain('${weight}');
  });

  it('carrega explicitamente os dois pesos que a arte usa', () => {
    // §7 do spec, "Remedição quando a fonte chega": hoje só `bold 48px` é carregado, e a linha de
    // dados e a observação são desenhadas no peso normal — que o Konva quebra com a métrica errada
    // se a fonte ainda não chegou.
    const texto = fonte();
    expect(texto).toMatch(/fonts\.load\(`400 /);
    expect(texto).toMatch(/fonts\.load\(`900 /);
  });
});
