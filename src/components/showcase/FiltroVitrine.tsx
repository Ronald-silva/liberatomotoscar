'use client';

import { useEffect, useRef, useState } from 'react';

export type OpcaoFiltro = {
  valor: string;
  rotulo: string;
  total: number;
};

/**
 * Filtro da vitrine.
 *
 * A filtragem em si é CSS: este componente só escreve o valor escolhido em
 * `data-filtro` na seção, e as regras de `globals.css` escondem os cards de
 * outra categoria. Antes, filtrar acontecia no React e a vitrine inteira era
 * um componente cliente lendo `useSearchParams` — o que fazia o Next servir
 * a página sem nenhum veículo no HTML. Agora os sete cards vêm do servidor e
 * continuam lá mesmo sem JavaScript; só os botões deixam de responder.
 */
export function FiltroVitrine({ opcoes }: { opcoes: OpcaoFiltro[] }) {
  const [ativo, setAtivo] = useState(opcoes[0]?.valor ?? 'todos');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const secao = ref.current?.closest('.showcase');
    if (secao instanceof HTMLElement) secao.dataset.filtro = ativo;
  }, [ativo]);

  const visiveis = opcoes.find((opcao) => opcao.valor === ativo)?.total ?? 0;

  return (
    <>
      <div className="filter-list" ref={ref} role="group" aria-label="Filtrar veículos por categoria">
        {opcoes.map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            className={`filter-button ${ativo === opcao.valor ? 'is-active' : ''}`}
            aria-pressed={ativo === opcao.valor}
            onClick={() => setAtivo(opcao.valor)}
          >
            {opcao.rotulo}
            <sup>{opcao.total}</sup>
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {visiveis} {visiveis === 1 ? 'opção exibida' : 'opções exibidas'}.
      </p>
    </>
  );
}
