import styles from '../../admin.module.css';
import { ManualVisitForm } from './ManualVisitForm';
import { VisitCard, type VehicleOption, type VisitView } from './VisitCard';

export type AgendaGroups = Record<'hoje' | 'amanha' | 'semana' | 'depois' | 'semHora', VisitView[]>;

const GROUPS: { key: keyof AgendaGroups; title: string; showDay: boolean }[] = [
  { key: 'hoje', title: 'Hoje', showDay: false },
  { key: 'amanha', title: 'Amanhã', showDay: false },
  { key: 'semana', title: 'Esta semana', showDay: true },
  { key: 'depois', title: 'Depois', showDay: true },
  { key: 'semHora', title: 'Combinado, sem hora certa', showDay: false },
];

/** A tela da agenda já com os dados prontos: separada da página para ser testável sem sessão nem banco. */
export function AgendaView({ groups, vehicles, vehiclesAvailable, minDate }: {
  groups: AgendaGroups; vehicles: VehicleOption[]; vehiclesAvailable: boolean; minDate: string;
}) {
  const empty = GROUPS.every(({ key }) => groups[key].length === 0);
  return <>
    {empty ? <p className={styles.description}>Nenhuma visita marcada. Marque a primeira abaixo.</p> : null}
    <details className={styles.visitDetails} open={empty}>
      <summary>Marcar visita</summary>
      <ManualVisitForm vehicles={vehicles} vehiclesAvailable={vehiclesAvailable} minDate={minDate} />
    </details>
    {GROUPS.map(({ key, title, showDay }) => groups[key].length === 0 ? null : <section key={key} className={styles.visitGroup} aria-labelledby={`grupo-${key}`}>
      <h2 id={`grupo-${key}`} className={styles.visitGroupTitle}>{title} ({groups[key].length})</h2>
      <ul className={styles.visitList}>
        {groups[key].map((visit) => <VisitCard key={visit.id} visit={visit} vehicles={vehicles} vehiclesAvailable={vehiclesAvailable} showDay={showDay} />)}
      </ul>
    </section>)}
  </>;
}
