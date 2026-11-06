import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/**
 * A tela de entrada é a única do painel que centraliza o conteúdo na janela — todas as outras
 * somam `.listScreen`, que ancora no topo. Esse privilégio dependia de uma única declaração, e ela
 * desaparecia em silêncio no navegador errado.
 *
 * O defeito, medido no navegador embutido do LinkedIn e reproduzido aqui: onde `dvh` não existe
 * (WebView anterior ao Chrome 108), a declaração `min-height: 100dvh` inteira é **descartada**,
 * `min-height` volta a `auto`, a caixa encolhe até a altura do conteúdo e `align-items: center`
 * passa a não ter folga nenhuma para distribuir. O cartão encosta no topo com exatamente o
 * `padding` da tela — 24px em vez dos 100px da centralização.
 */
const css = readFileSync(join(import.meta.dirname, 'admin.module.css'), 'utf8');
const regra = (seletor: string) => {
  const achado = css.match(new RegExp(`(?:^|\\n)${seletor.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  if (!achado) throw new Error(`regra ${seletor} nao encontrada`);
  return achado[1];
};

it('toda altura em dvh tem a mesma altura em vh declarada antes, como reserva', () => {
  // A ordem importa: quem entende `dvh` lê a segunda e ignora a primeira; quem não entende
  // descarta a segunda e fica com a reserva. Invertidas, a reserva venceria em todo navegador.
  const dvh = [...css.matchAll(/(min-height|height):\s*(\d+)dvh/g)];
  expect(dvh.length).toBeGreaterThan(0);
  for (const [, propriedade, valor] of dvh) {
    const reserva = new RegExp(`${propriedade}:\\s*${valor}vh;\\s*${propriedade}:\\s*${valor}dvh`);
    expect(css, `${propriedade}: ${valor}dvh sem reserva em vh antes`).toMatch(reserva);
  }
});

it('no celular a tela de entrada continua centralizada', () => {
  // A causa principal do cartão colado no topo, e a mais fácil de não ver: numa consulta de mídia
  // para telas de até 480px, `.screen` trocava para `align-items: flex-start` com 48px de padding
  // em cima. O celular da loja tem 360px. Essa troca não servia ao login — ela existia para as
  // telas de lista, e essas já ancoram no topo pela própria `.listScreen`.
  const celular = css.match(/@media \(max-width: 480px\)\s*\{([\s\S]*?)\n\}/);
  expect(celular, 'consulta de mídia de 480px não encontrada').toBeTruthy();
  const dentro = celular![1];
  expect(dentro, '.screen volta a ancorar no topo no celular').not.toMatch(/\.screen\s*\{[^}]*align-items:\s*flex-start/);
  expect(dentro, '.screen ganha padding de topo que desloca o cartão').not.toMatch(/\.screen\s*\{[^}]*padding-top/);
  // As telas de lista seguem ancoradas no topo, que é o certo para conteúdo que rola.
  expect(regra('.listScreen')).toMatch(/align-items:\s*flex-start/);
});

it('a tela de entrada centraliza sem poder cortar o topo do cartão', () => {
  // `align-items: center` sozinho corta o que não cabe, e o que fica acima da borda não rola —
  // é o defeito clássico de centralizar com flex. Margem automática centraliza quando há folga e
  // recua para zero quando não há, então o cartão nunca fica inalcançável.
  expect(regra('.screen')).toMatch(/align-items:\s*center/);
  expect(regra('.panel')).toMatch(/margin-block:\s*auto/);
});
