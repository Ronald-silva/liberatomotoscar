import Link from 'next/link';
import styles from '../admin.module.css';
import type { VehicleStatus } from './veiculos/status';

const filters = [
  { status: 'draft', slug: 'rascunho', label: 'Rascunhos' },
  { status: 'published', slug: 'publicado', label: 'Publicados' },
  { status: 'reserved', slug: 'reservado', label: 'Reservados' },
  { status: 'sold', slug: 'vendido', label: 'Vendidos' },
  { status: 'archived', slug: 'arquivado', label: 'Arquivados' },
  { status: 'discarded', slug: 'descartado', label: 'Descartados' },
] as const satisfies readonly { status: VehicleStatus; slug: string; label: string }[];

export function parseStatusFilter(slug: string | string[] | undefined): VehicleStatus | undefined {
  if (typeof slug !== 'string') return undefined;
  return filters.find((filter) => filter.slug === slug)?.status;
}

export function StatusFilter({ counts, active }: { counts: Record<VehicleStatus, number> | null; active?: VehicleStatus }) {
  const all = counts ? Object.entries(counts).filter(([status]) => status !== 'discarded').reduce((sum, [, count]) => sum + count, 0) : null;
  return <nav className={styles.statusFilter} aria-label="Filtrar estoque por situação">
    <Link className={active === undefined ? `${styles.filterLink} ${styles.filterLinkActive}` : styles.filterLink}
      href="/admin" aria-current={active === undefined ? 'page' : undefined}>Tudo {all === null ? '' : `(${all})`}</Link>
    {filters.filter(({ status }) => status !== 'discarded' || (counts?.discarded ?? 0) > 0).map(({ status, slug, label }) =>
      <Link key={status} className={active === status ? `${styles.filterLink} ${styles.filterLinkActive}` : styles.filterLink}
        href={`/admin?estado=${slug}`} aria-current={active === status ? 'page' : undefined}>
        {label} {counts === null ? '' : `(${counts[status]})`}
      </Link>)}
  </nav>;
}
