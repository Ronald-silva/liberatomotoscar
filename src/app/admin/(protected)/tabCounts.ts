import { listAgenda } from '@/server/attendance/appointments';
import { countInbox } from '@/server/attendance/inbox';

/** `null` = a contagem falhou; a barra mostra o destino sem número em vez de um zero que mentiria. */
export type TabCounts = { agenda: number | null; conversas: number | null };

async function orNull(label: string, count: () => Promise<number>): Promise<number | null> {
  try { return await count(); } catch (error) {
    // Um contador quebrado não pode derrubar a tela em que a pessoa está; fica no log.
    console.error(`Falha ao contar ${label} para a barra do painel`, error);
    return null;
  }
}

/** Visitas de hoje que ainda não passaram e conversas esperando vendedor (§7.1). */
export async function loadTabCounts(now: Date): Promise<TabCounts> {
  const [agenda, conversas] = await Promise.all([
    orNull('a agenda', async () => (await listAgenda(now)).hoje.filter((visita) => !visita.passou).length),
    orNull('as conversas', async () => (await countInbox()).waiting),
  ]);
  return { agenda, conversas };
}
