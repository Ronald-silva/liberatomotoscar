import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import PlatformChrome from './PlatformChrome';
import { ART_DESTINATIONS, DESTINATION_ORDER } from './destinations';

/**
 * O fantasma da interface da rede.
 *
 * Ele existe para uma coisa só: deixar ver, na prévia, **onde a plataforma escreve por cima** da
 * peça — e é o instrumento com que os números de área segura do §5 do spec vão ser corrigidos no
 * aparelho da loja, porque nenhuma plataforma publica mapa oficial em pixels.
 *
 * Por isso as duas afirmações que mais importam aqui são: as formas saem do **mesmo dado** que a
 * área segura (`destinations.ts`), e são formas **neutras** — desenhar a marca alheia dentro do
 * produto é risco de marca registrada sem ganho nenhum, porque o que precisa ser visto é *onde* a
 * rede escreve, não *o quê*.
 */

type Elemento = { type: unknown; props: Record<string, unknown> };

const ehElemento = (valor: unknown): valor is Elemento =>
  typeof valor === 'object' && valor !== null && '$$typeof' in valor && 'props' in valor;

function achatar(no: unknown, saida: Elemento[] = []): Elemento[] {
  if (Array.isArray(no)) { for (const filho of no) achatar(filho, saida); return saida; }
  if (!ehElemento(no)) return saida;
  saida.push(no);
  achatar((no.props as { children?: unknown }).children, saida);
  return saida;
}

const arvore = (destino: Parameters<typeof PlatformChrome>[0]['destination']) =>
  achatar(PlatformChrome({ destination: destino }));

const estilo = (no: Elemento) => no.props.style as Record<string, string | number>;

/** As formas: tudo menos o invólucro, que é o primeiro elemento. */
const formas = (destino: Parameters<typeof PlatformChrome>[0]['destination']) => arvore(destino).slice(1);

describe('o fantasma da interface', () => {
  it('não desenha marca nem nome de plataforma', () => {
    const fonte = readFileSync('src/components/art-studio/PlatformChrome.tsx', 'utf8');
    const semComentarios = fonte.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    for (const marca of ['Instagram', 'TikTok', 'WhatsApp', 'Facebook', 'Meta']) {
      expect(semComentarios, marca).not.toContain(marca);
    }
  });

  it('desenha uma forma para cada item do fantasma do destino', () => {
    for (const destino of DESTINATION_ORDER) {
      expect(formas(destino), destino).toHaveLength(ART_DESTINATIONS[destino].chrome.length);
    }
  });

  it('as quatro interfaces são diferentes entre si', () => {
    // Se o fantasma fosse igual para todos, ele deixaria de ser o instrumento da área segura e
    // passaria a ser enfeite: era exatamente assim que o Status reusava a área do Stories.
    const assinaturas = DESTINATION_ORDER.map((destino) =>
      JSON.stringify(formas(destino).map((no) => estilo(no))));
    expect(new Set(assinaturas).size).toBe(DESTINATION_ORDER.length);
  });

  it('cada forma sai em fração da peça, nunca em pixel, para escalar com a prévia', () => {
    for (const destino of DESTINATION_ORDER) {
      const spec = ART_DESTINATIONS[destino];
      const desenhadas = formas(destino);
      spec.chrome.forEach((forma, indice) => {
        const css = estilo(desenhadas[indice]);
        expect(css.left, `${destino}/${indice}`).toBe(`${(forma.x / spec.width) * 100}%`);
        expect(css.top, `${destino}/${indice}`).toBe(`${(forma.y / spec.height) * 100}%`);
        expect(css.width, `${destino}/${indice}`).toBe(`${(forma.width / spec.width) * 100}%`);
        expect(css.height, `${destino}/${indice}`).toBe(`${(forma.height / spec.height) * 100}%`);
      });
    }
  });

  it('o avatar é redondo e as barras não', () => {
    // O `kind` precisa chegar ao desenho: um fantasma com todas as formas iguais mostra a área
    // ocupada, mas não deixa reconhecer o que ocupa.
    for (const destino of DESTINATION_ORDER) {
      const spec = ART_DESTINATIONS[destino];
      spec.chrome.forEach((forma, indice) => {
        const css = estilo(formas(destino)[indice]);
        if (forma.kind === 'avatar') expect(css.borderRadius, destino).toBe('50%');
        else expect(css.borderRadius, destino).not.toBe('50%');
      });
    }
  });

  it('não entra na ordem de leitura nem intercepta o toque', () => {
    const [envoltorio] = arvore('story');
    expect(envoltorio.props['aria-hidden']).toBe('true');
    expect(estilo(envoltorio).pointerEvents).toBe('none');
    expect(estilo(envoltorio).position).toBe('absolute');
  });

  it('é feito só de formas: nenhuma imagem, nenhum ícone, nenhum texto', () => {
    for (const destino of DESTINATION_ORDER) {
      for (const no of arvore(destino)) {
        expect(no.type, destino).toBe('div');
        const filhos = no.props.children;
        if (typeof filhos === 'string' || typeof filhos === 'number') {
          throw new Error(`O fantasma de ${destino} escreveu "${String(filhos)}" na prévia`);
        }
      }
    }
  });
});
