import type { Metadata } from 'next';
import { AccessDeniedError } from '@/server/authz';
import { listAgenda, type Agenda } from '@/server/attendance/appointments';
import { storeClock } from '@/server/attendance/visit-slot';
import { listAdminVehiclesWithCover } from '@/server/vehicles/service';
import styles from '../../admin.module.css';
import { AgendaView, type AgendaGroups } from './AgendaView';
import type { VehicleOption, VisitView } from './VisitCard';

export const metadata: Metadata = { title: 'Agenda', robots: { index: false, follow: false } };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
type Stock = Awaited<ReturnType<typeof listAdminVehiclesWithCover>>;
const titleOf = (v: Stock[number]) => [v.brand, v.model].filter(Boolean).join(' ') || 'Veículo sem título';

export default async function AgendaPage() {
  const now = new Date();
  const [agenda, loadedStock] = await Promise.all([
    // Agenda ilegível (tabela ausente, banco fora) não pode parecer agenda vazia: "Nenhuma visita
    // marcada" seria uma afirmação falsa. A negação de acesso sobe; só a falha de leitura vira aviso.
    listAgenda(now).catch((error: unknown): Agenda | null => {
      if (error instanceof AccessDeniedError) throw error;
      console.error('Falha ao carregar a agenda', error);
      return null;
    }),
    // Sem o estoque a agenda continua útil: o veículo não pode ser escolhido nem mostrado, e os
    // formulários desligam o campo (em vez de mandar "sem veículo" e apagar o vínculo).
    listAdminVehiclesWithCover().catch((error: unknown): Stock | null => {
      console.error('Falha ao carregar o estoque para a agenda', error);
      return null;
    }),
  ]);
  if (agenda === null) {
    return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
      <section className={styles.listPanel} aria-labelledby="agenda-title">
        <h1 id="agenda-title" className={styles.heading}>Agenda</h1>
        <p className={styles.description} role="alert">
          Não foi possível carregar a agenda agora. Isso não quer dizer que não há visitas.
          Atualize a página para tentar de novo.</p>
      </section>
    </main>;
  }
  const vehiclesAvailable = loadedStock !== null;
  const stock = loadedStock ?? [];
  const byId = new Map(stock.map((v) => [v.id, v]));
  const options: VehicleOption[] = stock.map((v) => ({ id: v.id, label: titleOf(v) }));
  const view = (row: Agenda['hoje'][number]): VisitView => {
    const vehicle = row.vehicleId ? byId.get(row.vehicleId) : undefined;
    return {
      id: row.id, scheduledFor: row.scheduledFor?.toISOString() ?? null, passou: row.passou,
      customerName: row.customerName, customerPhone: row.customerPhone, quote: row.quote,
      conversationId: row.conversationId, vehicleId: row.vehicleId,
      briefing: row.briefing,
      vehicle: vehicle ? { label: titleOf(vehicle), year: vehicle.year, price: vehicle.priceCents !== null ? brl.format(vehicle.priceCents / 100) : null } : null,
    };
  };
  const c = storeClock(now);
  const today = `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;

  const groups: AgendaGroups = {
    hoje: agenda.hoje.map(view), amanha: agenda.amanha.map(view), semana: agenda.semana.map(view),
    depois: agenda.depois.map(view), semHora: agenda.semHora.map(view),
  };

  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <section className={styles.listPanel} aria-labelledby="agenda-title">
      <h1 id="agenda-title" className={styles.heading}>Agenda</h1>
      <AgendaView
        vehicles={options} vehiclesAvailable={vehiclesAvailable} minDate={today}
        groups={groups}
      />
    </section>
  </main>;
}
