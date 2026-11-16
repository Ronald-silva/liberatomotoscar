import Link from 'next/link';
import styles from '../admin.module.css';
import { inventoryHref, statusSlugs } from './inventoryQuery';
import type { VehicleStatus } from './veiculos/status';

const filters = [
  { status: 'draft', label: 'Rascunhos' },
  { status: 'published', label: 'Publicados' },
  { status: 'reserved', label: 'Reservados' },
  { status: 'sold', label: 'Vendidos' },
  { status: 'archived', label: 'Arquivados' },
  { status: 'discarded', label: 'Descartados' },
] as const satisfies readonly { status: VehicleStatus; label: string }[];

const porSlug = new Map<string, VehicleStatus>(
  Object.entries(statusSlugs).map(([status, slug]) => [slug, status as VehicleStatus]));

export function parseStatusFilter(slug: string | string[] | undefined): VehicleStatus | undefined {
  if (typeof slug !== 'string') return undefined;
  return porSlug.get(slug);
}

/**
 * As fichas de estado, com a contagem **da busca em vigor**.
 *
 * Trocar de ficha preserva o texto buscado e volta para a primeira página: a pessoa está mudando
 * de recorte dentro da mesma procura, não começando outra.
 */
export function StatusFilter({ counts, active, search = '' }: {
  counts: Record<VehicleStatus, number> | null; active?: VehicleStatus; search?: string;
}) {
  const all = counts ? Object.entries(counts).filter(([status]) => status !== 'discarded').reduce((sum, [, count]) => sum + count, 0) : null;
  return <nav className={styles.statusFilter} aria-label="Filtrar estoque por situação">
    <Link className={active === undefined ? `${styles.filterLink} ${styles.filterLinkActive}` : styles.filterLink}
      href={inventoryHref({ search })} aria-current={active === undefined ? 'page' : undefined}>Tudo {all === null ? '' : `(${all})`}</Link>
    {filters.filter(({ status }) => status !== 'discarded' || (counts?.discarded ?? 0) > 0).map(({ status, label }) =>
      <Link key={status} className={active === status ? `${styles.filterLink} ${styles.filterLinkActive}` : styles.filterLink}
        href={inventoryHref({ status, search })} aria-current={active === status ? 'page' : undefined}>
        {label} {counts === null ? '' : `(${counts[status]})`}
      </Link>)}
  </nav>;
}
