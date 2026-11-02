import { desc, sql } from 'drizzle-orm';
import { requireAdmin } from '@/server/authz';
import { getDb } from '@/server/db/client';
import { visitAppointments } from '@/server/db/schema';
import { ensureAttendanceTables } from './ensure-schema';
import { storeDayNumber, storeWeekday } from './visit-slot';

export type AppointmentRow = typeof visitAppointments.$inferSelect;
/** O mesmo `tx` que `getDb().transaction` entrega: a Task 12 grava o agendamento junto com a resposta. */
export type AppointmentTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export type Agenda = {
  hoje: AppointmentRow[];
  amanha: AppointmentRow[];
  /** De depois de amanhã até o sábado da semana da loja. */
  semana: AppointmentRow[];
  /** Tudo que passa do sábado: sem este grupo, uma visita daqui a dez dias sumiria da tela. */
  depois: AppointmentRow[];
  semHora: AppointmentRow[];
};

const SATURDAY = 6;

/**
 * Distribui os agendamentos nos grupos da tela, contando os dias no calendário da loja (não em
 * blocos de 24h: 23h de hoje e 1h de amanhã estão a duas horas, mas em dias diferentes).
 * A semana da loja fecha no sábado; domingo já é a semana seguinte. Visita cuja hora passou sai
 * dos grupos futuros — sem hora (`scheduledFor` nulo) nunca "passa", fica em `semHora` até alguém resolver.
 */
export function groupAgenda(rows: readonly AppointmentRow[], now: Date): Agenda {
  const agenda: Agenda = { hoje: [], amanha: [], semana: [], depois: [], semHora: [] };
  const today = storeDayNumber(now);
  // Dias até o sábado: de domingo (0) são 6, e no próprio sábado são 0.
  const weekEnd = today + (SATURDAY - storeWeekday(now));
  const ordered = [...rows].sort((a, b) =>
    (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0));
  for (const row of ordered) {
    if (!row.scheduledFor) { agenda.semHora.push(row); continue; }
    if (row.scheduledFor.getTime() <= now.getTime()) continue;
    const day = storeDayNumber(row.scheduledFor);
    if (day === today) agenda.hoje.push(row);
    else if (day === today + 1) agenda.amanha.push(row);
    else if (day <= weekEnd) agenda.semana.push(row);
    else agenda.depois.push(row);
  }
  return agenda;
}

/** Leitura da agenda para o painel. */
export async function listAgenda(now: Date): Promise<Agenda> {
  await requireAdmin();
  await ensureAttendanceTables();
  // Os grupos com hora são ordenados por `groupAgenda`; sem hora fica do mais recente ao mais antigo.
  const rows = await getDb().select().from(visitAppointments).orderBy(desc(visitAppointments.createdAt));
  return groupAgenda(rows, now);
}

export type AgentAppointmentInput = {
  conversationId: string;
  vehicleId: string | null;
  scheduledFor: Date | null;
  quote: string;
  customerName: string | null;
  customerPhone: string | null;
};

/**
 * Registra a visita que a Dayse combinou. Uma por conversa, garantido pelo índice único parcial:
 * quem remarca atualiza a linha, nunca cria a segunda. Sem `requireAdmin`: quem chama é o
 * atendimento do cliente, não um operador. `tx` existe para entrar na transação da resposta.
 * Hora e frase andam juntas (a frase explica a hora); nome, telefone e veículo só mudam quando
 * a nova remarcação traz valor — uma conversa que não repetiu o telefone não o apaga.
 */
export async function upsertAgentAppointment(
  input: AgentAppointmentInput,
  tx?: AppointmentTransaction,
): Promise<AppointmentRow> {
  const executor = tx ?? getDb();
  const [row] = await executor.insert(visitAppointments).values({
    conversationId: input.conversationId,
    vehicleId: input.vehicleId,
    scheduledFor: input.scheduledFor,
    quote: input.quote,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    source: 'agent',
  }).onConflictDoUpdate({
    target: visitAppointments.conversationId,
    // O alvo precisa repetir o predicado do índice parcial, ou o Postgres não o reconhece.
    targetWhere: sql`${visitAppointments.conversationId} is not null`,
    set: {
      scheduledFor: input.scheduledFor,
      quote: input.quote,
      vehicleId: sql`coalesce(excluded.vehicle_id, ${visitAppointments.vehicleId})`,
      customerName: sql`coalesce(excluded.customer_name, ${visitAppointments.customerName})`,
      customerPhone: sql`coalesce(excluded.customer_phone, ${visitAppointments.customerPhone})`,
      updatedAt: sql`now()`,
    },
  }).returning();
  return row;
}
