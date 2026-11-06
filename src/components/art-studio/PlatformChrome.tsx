'use client';

import { ART_DESTINATIONS, type ArtDestination } from './destinations';

/**
 * O fantasma da interface da rede, sobre a prévia.
 *
 * Existe para uma coisa só: deixar ver **onde a rede escreve por cima** da peça, porque nenhuma
 * plataforma publica mapa oficial em pixels e os números de área segura do §5 do spec são ponto de
 * partida declarado, não verdade. A conferência é visual, no aparelho da loja, com isto ligado.
 *
 * Três decisões de desenho, todas do spec:
 *
 * - **Formas neutras.** Retângulos e um círculo, nunca o logo, a marca ou o ícone de nenhuma
 *   plataforma: desenhar a marca alheia dentro do produto é risco de marca registrada sem ganho,
 *   porque o que precisa ser visto é *onde* a rede escreve, não *o quê*.
 * - **Overlay de DOM, não camada do palco.** Dentro do `<Layer>` ele iria para o arquivo exportado
 *   e a loja publicaria a peça com o fantasma impresso.
 * - **Geometria em fração da peça.** A prévia é escalada para caber na janela; em pixel, o fantasma
 *   sairia do lugar em todo aparelho com tela diferente. E a fração sai do **mesmo dado** que a
 *   área segura (`destinations.ts`): se fossem duas fontes, divergiriam na primeira correção e a
 *   prévia passaria a mentir justamente sobre o que ela existe para provar.
 */
const fracao = (valor: number, total: number) => `${(valor / total) * 100}%`;

export default function PlatformChrome({ destination }: { destination: ArtDestination }) {
  const spec = ART_DESTINATIONS[destination];
  return <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    {spec.chrome.map((forma, indice) => <div key={`${forma.kind}-${indice}`}
      style={{
        position: 'absolute',
        left: fracao(forma.x, spec.width),
        top: fracao(forma.y, spec.height),
        width: fracao(forma.width, spec.width),
        height: fracao(forma.height, spec.height),
        // O avatar é o único redondo: o `kind` chega ao desenho para quem confere reconhecer o que
        // ocupa a área, e não só que algo ocupa.
        borderRadius: forma.kind === 'avatar' ? '50%' : '8px',
        background: 'rgba(255,255,255,0.16)',
        border: '2px dashed rgba(255,255,255,0.5)',
        boxSizing: 'border-box',
      }} />)}
  </div>;
}
