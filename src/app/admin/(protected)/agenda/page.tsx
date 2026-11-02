import type { Metadata } from 'next';
import { listAgenda, type Agenda } from '@/server/attendance/appointments';
import { storeClock } from '@/server/attendance/visit-slot';
import { listAdminVehiclesWithCover } from '@/server/vehicles/service';
import styles from '../../admin.module.css';
import { ManualVisitForm } from './ManualVisitForm';
import { VisitCard, type VehicleOption, type VisitView } from './VisitCard';

export const metadata: Metadata = { title: 'Agenda', robots: { index: false, follow: false } };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const GROUPS: { key: keyof Agenda; title: string; showDay: boolean }[] = [
  { key: 'hoje', title: 'Hoje', showDay: false },
  { key: 'amanha', title: 'Amanhã', showDay: false },
  { key: 'semana', title: 'Esta semana', showDay: true },
  { key: 'depois', title: 'Depois', showDay: true },
  { key: 'semHora', title: 'Combinado, sem hora certa', showDay: false },
];

type Stock = Awaited<ReturnType<typeof listAdminVehiclesWithCover>>;
const titleOf = (v: Stock[number]) => [v.brand, v.model].filter(Boolean).join(' ') || 'Veículo sem título';

export default async function AgendaPage() {
  const now = new Date();
  const [agenda, stock] = await Promise.all([
    listAgenda(now),
    // Sem o estoque a agenda continua útil: só o seletor de veículo e a linha do veículo ficam de fora.
    listAdminVehiclesWithCover().catch((error: unknown): Stock => {
      console.error('Falha ao carregar o estoque para a agenda', error);
      return [];
    }),
  ]);
  const byId = new Map(stock.map((v) => [v.id, v]));
  const options: VehicleOption[] = stock.map((v) => ({ id: v.id, label: titleOf(v) }));
  const view = (row: Agenda['hoje'][number]): VisitView => {
    const vehicle = row.vehicleId ? byId.get(row.vehicleId) : undefined;
    return {
      id: row.id, scheduledFor: row.scheduledFor?.toISOString() ?? null, passou: row.passou,
      customerName: row.customerName, customerPhone: row.customerPhone, quote: row.quote,
      conversationId: row.conversationId, vehicleId: row.vehicleId,
      vehicle: vehicle ? { label: titleOf(vehicle), year: vehicle.year, price: vehicle.priceCents !== null ? brl.format(vehicle.priceCents / 100) : null } : null,
    };
  };
  const empty = GROUPS.every(({ key }) => agenda[key].length === 0);
  const c = storeClock(now);
  const today = `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;

  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <section className={styles.listPanel} aria-labelledby="agenda-title">
      <h1 id="agenda-title" className={styles.heading}>Agenda</h1>
      {empty
        ? <p className={styles.description}>Nenhuma visita marcada. Marque a primeira abaixo, ou ela aparece aqui quando a Dayse combinar uma com um cliente.</p>
        : null}
      <details className={styles.visitDetails} open={empty}>
        <summary>Marcar visita</summary>
        <ManualVisitForm vehicles={options} minDate={today} />
      </details>
      {GROUPS.map(({ key, title, showDay }) => agenda[key].length === 0 ? null : <section key={key} className={styles.visitGroup} aria-labelledby={`grupo-${key}`}>
        <h2 id={`grupo-${key}`} className={styles.visitGroupTitle}>{title} ({agenda[key].length})</h2>
        <ul className={styles.visitList}>
          {agenda[key].map((row) => <VisitCard key={row.id} visit={view(row)} vehicles={options} showDay={showDay} />)}
        </ul>
      </section>)}
    </section>
  </main>;
}
