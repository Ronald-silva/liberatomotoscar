import type { VehicleStatus } from './veiculos/status';

/**
 * O contrato da URL do estoque: estado, busca e página.
 *
 * Mora num lugar só porque três componentes montam links para a mesma tela — as fichas de estado,
 * o controle de páginas e o formulário de busca — e um deles esquecer um parâmetro é como o
 * defeito aparece: buscar "honda", tocar em "Publicados" e a busca sumir, ou virar a página e
 * voltar ao estoque inteiro. Toda ligação sai de `inventoryHref`, com o que não mudou preservado.
 *
 * A página **não** é preservada ao trocar de estado ou de busca: a lista é outra, e a página 3 da
 * lista anterior não quer dizer nada na nova.
 */

export type InventoryQuery = { status?: VehicleStatus; search: string; page: number };

/** Um parâmetro repetido na URL (?busca=a&busca=b) chega como array; não é texto e não é busca. */
const texto = (valor: string | string[] | undefined) => typeof valor === 'string' ? valor : '';

export function parseSearch(valor: string | string[] | undefined): string {
  return texto(valor).trim().slice(0, 120);
}

/** Página fora do inteiro positivo volta para a primeira, em vez de virar salto negativo. */
export function parsePage(valor: string | string[] | undefined): number {
  const numero = Number.parseInt(texto(valor), 10);
  return Number.isFinite(numero) && numero >= 1 ? numero : 1;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

export const statusSlugs = {
  draft: 'rascunho', published: 'publicado', reserved: 'reservado',
  sold: 'vendido', archived: 'arquivado', discarded: 'descartado',
} as const satisfies Record<VehicleStatus, string>;

export function inventoryHref({ status, search, page }: Partial<InventoryQuery>): string {
  const params = new URLSearchParams();
  if (status) params.set('estado', statusSlugs[status]);
  if (search) params.set('busca', search);
  if (page && page > 1) params.set('pagina', String(page));
  const query = params.toString();
  return query ? `/admin?${query}` : '/admin';
}
