import { STORE } from './store';

/**
 * A identidade da loja como dado, não como código.
 *
 * Cor, logo e telefone estavam espalhados entre `templates.ts`, `ArtCanvas.tsx` e `store.ts`, e
 * trocar o vermelho da marca exigia caçar hexadecimal dentro do desenho. Aqui eles ficam num lugar
 * só, e o estúdio não crava mais nenhum deles.
 *
 * Isso deixa o caminho aberto para mais de uma loja sem pagar por isso agora: **não** há tela de
 * administração, **não** há tabela nova e **não** há upload nesta rodada. É extração, só.
 */
export type BrandKit = {
  name: string;
  /** Versão branca, para fundo escuro — que é o único que a arte tem. */
  logoNegative: string;
  /** Versão escura, para peça impressa ou fundo claro fora do estúdio. */
  logoPositive: string;
  phoneDisplay: string;
  hashtags: readonly string[];
  palette: {
    background: string;
    ink: string;
    /** Texto de apoio: linha de dados, observação. */
    dim: string;
    /** Filete e realces. Pode ser claro, porque nada é escrito em cima dele. */
    accent: string;
    /** Os blocos sólidos — pílula do selo e placa do preço. Sempre escritos em `chipInk`. */
    chip: string;
    chipInk: string;
    /**
     * A ponta opaca do véu: o degradê vai do transparente até esta cor na borda inferior. É ela
     * que torna texto branco legível sobre foto clara, então precisa aguentar `ink` e `dim`.
     */
    scrim: string;
  };
};

export const BRAND: BrandKit = {
  name: STORE.name,
  logoNegative: '/logo-liberato-negativo.png',
  logoPositive: '/logo-liberato.png',
  // O telefone sai de `STORE` de propósito: duas fontes para o mesmo número é como um deles
  // envelhece sem ninguém perceber, e este aqui vai impresso na peça que o cliente guarda.
  phoneDisplay: STORE.phoneDisplay,
  hashtags: ['#LiberatoMotosCar'],
  palette: {
    background: '#0a0e13',
    ink: '#ffffff',
    dim: '#9fabb7',
    accent: '#d8202f',
    chip: '#d8202f',
    chipInk: '#ffffff',
    scrim: '#0a0e13',
  },
};
