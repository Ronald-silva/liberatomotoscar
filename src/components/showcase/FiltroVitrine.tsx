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
  const [ordem, setOrdem] = useState<'padrao' | 'menor-preco' | 'maior-preco' | 'mais-novos'>('padrao');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const secao = ref.current?.closest('.showcase');
    if (!(secao instanceof HTMLElement)) return;
    secao.dataset.filtro = ativo;
    const grid = secao.querySelector('.vehicle-grid');
    if (!(grid instanceof HTMLElement)) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.vehicle-card'));
    cards.sort((a, b) => {
      const idxA = Number(a.dataset.ordem ?? 0);
      const idxB = Number(b.dataset.ordem ?? 0);
      if (ordem === 'padrao') return idxA - idxB;
      const precoA = Number(a.dataset.preco ?? 0);
      const precoB = Number(b.dataset.preco ?? 0);
      if (ordem === 'menor-preco') {
        if (precoA <= 0 && precoB > 0) return 1;
        if (precoB <= 0 && precoA > 0) return -1;
        return precoA - precoB || idxA - idxB;
      }
      if (ordem === 'maior-preco') {
        return precoB - precoA || idxA - idxB;
      }
      const anoA = Number(a.dataset.ano ?? 0);
      const anoB = Number(b.dataset.ano ?? 0);
      return anoB - anoA || idxA - idxB;
    });
    for (const card of cards) grid.appendChild(card);
  }, [ativo, ordem]);

  const visiveis = opcoes.find((opcao) => opcao.valor === ativo)?.total ?? 0;

  return (
    <div className="showcase-controls" ref={ref}>
      <div className="filter-list" role="group" aria-label="Filtrar veículos por categoria">
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
      <label className="sort-control">
        <span className="sr-only">Ordenar veículos</span>
        <select
          className="sort-select"
          aria-label="Ordenar veículos"
          value={ordem}
          onChange={(event) => setOrdem(event.target.value as typeof ordem)}
        >
          <option value="padrao">Ordenar: Destaques</option>
          <option value="menor-preco">Menor preço</option>
          <option value="maior-preco">Maior preço</option>
          <option value="mais-novos">Mais novos</option>
        </select>
      </label>
      <p className="sr-only" aria-live="polite">
        {visiveis} {visiveis === 1 ? 'opção exibida' : 'opções exibidas'}.
      </p>
    </div>
  );
}
