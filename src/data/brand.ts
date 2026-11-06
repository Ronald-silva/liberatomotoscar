import { STORE } from './store';
import type { VehicleType } from './catalogo-marcas-modelos';

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
  /**
   * As hashtags da loja, por família. A hashtag do **modelo** não está aqui: ela nasce do veículo,
   * não da identidade, e segue derivada em `caption.ts`.
   *
   * `local` e `category` são indexadas pelo tipo do veículo porque a praça é a mesma e só a palavra
   * muda ("Motos" / "Carros"). Elas estão aqui, e não cravadas na legenda, porque "Fortaleza" e
   * "CE" são a praça **desta** loja: é o que o §9 do spec quer dizer com identidade como dado.
   */
  hashtags: {
    /** Vão em toda legenda que leva hashtag. */
    brand: readonly string[];
    /** A praça da loja. */
    local: Readonly<Record<VehicleType, readonly string[]>>;
    /** Categoria mais ampla, para busca por assunto. Só o destino que vive de busca a recebe. */
    category: Readonly<Record<VehicleType, readonly string[]>>;
  };
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
  hashtags: {
    brand: ['#LiberatoMotosCar'],
    local: { motorcycle: ['#MotosFortaleza'], car: ['#CarrosFortaleza'] },
    category: { motorcycle: ['#MotosCE'], car: ['#CarrosCE'] },
  },
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
