import { desc, eq, inArray, sql } from 'drizzle-orm';
import { requireAdmin } from '@/server/authz';
import { getDb } from '@/server/db/client';
import { conversations, visitAppointments } from '@/server/db/schema';
import { organizarFicha } from '@/lib/customer-briefing';
import { ensureAttendanceTables } from './ensure-schema';
import { resolveVisitSlot, storeClock, storeDayNumber, storeWeekday, type VisitSlotReason } from './visit-slot';

export type AppointmentRow = typeof visitAppointments.$inferSelect;
/** O mesmo `tx` que `getDb().transaction` entrega: a Task 12 grava o agendamento junto com a resposta. */
export type AppointmentTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** `passou`: a hora já foi, mas é de hoje; a tela mostra esmaecida em vez de sumir com ela. */
export type AgendaRow = AppointmentRow & { passou: boolean; briefing?: { budget: string | null; tradeIn: string | null } };

export type Agenda = {
  /** Inclui as de hoje que já passaram (`passou`): às 15h ainda interessa saber quem veio às 14h. */
  hoje: AgendaRow[];
  amanha: AgendaRow[];
  /** De depois de amanhã até o sábado da semana da loja. */
  semana: AgendaRow[];
  /** Tudo que passa do sábado: sem este grupo, uma visita daqui a dez dias sumiria da tela. */
  depois: AgendaRow[];
  semHora: AgendaRow[];
};

const SATURDAY = 6;

/**
 * Distribui os agendamentos nos grupos da tela, contando os dias no calendário da loja (não em
 * blocos de 24h: 23h de hoje e 1h de amanhã estão a duas horas, mas em dias diferentes).
 * A semana da loja fecha no sábado; domingo já é a semana seguinte. Visita de hoje cuja hora passou
 * fica em `hoje`, marcada `passou`, até o fim do dia da loja; a de dia anterior sai da tela. Sem hora
 * (`scheduledFor` nulo) nunca "passa", fica em `semHora` até alguém resolver.
 */
export function groupAgenda(rows: readonly (AppointmentRow & { briefing?: AgendaRow['briefing'] })[], now: Date): Agenda {
  const agenda: Agenda = { hoje: [], amanha: [], semana: [], depois: [], semHora: [] };
  const today = storeDayNumber(now);
  // Dias até o sábado: de domingo (0) são 6, e no próprio sábado são 0.
  const weekEnd = today + (SATURDAY - storeWeekday(now));
  const ordered = [...rows].sort((a, b) =>
    (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0));
  for (const row of ordered) {
    if (!row.scheduledFor) { agenda.semHora.push({ ...row, passou: false }); continue; }
    const day = storeDayNumber(row.scheduledFor);
    if (day < today) continue;
    const item = { ...row, passou: row.scheduledFor.getTime() <= now.getTime() };
    if (day === today) agenda.hoje.push(item);
    else if (day === today + 1) agenda.amanha.push(item);
    else if (day <= weekEnd) agenda.semana.push(item);
    else agenda.depois.push(item);
  }
  return agenda;
}

/** Leitura da agenda para o painel. */
export async function listAgenda(now: Date): Promise<Agenda> {
  await requireAdmin();
  await ensureAttendanceTables();
  // Os grupos com hora são ordenados por `groupAgenda`; sem hora fica do mais recente ao mais antigo.
  const rows = await getDb().select().from(visitAppointments).orderBy(desc(visitAppointments.createdAt));
  const conversationIds = [...new Set(rows.map((row) => row.conversationId).filter((id): id is string => id !== null))];
  const linked = conversationIds.length
    ? await getDb().select({ id: conversations.id, customerName: conversations.customerName,
      customerPhone: conversations.customerPhone, facts: conversations.facts })
      .from(conversations).where(inArray(conversations.id, conversationIds))
    : [];
  const byConversation = new Map(linked.map((row) => [row.id, row]));
  return groupAgenda(rows.map((row) => {
    const conversation = row.conversationId ? byConversation.get(row.conversationId) : null;
    const ficha = conversation ? organizarFicha(conversation.facts) : null;
    return {
      ...row,
      customerName: row.customerName ?? conversation?.customerName ?? null,
      customerPhone: row.customerPhone ?? conversation?.customerPhone ?? null,
      briefing: ficha ? {
        budget: ficha.linhas.find((line) => line.campo === 'budget')?.valor ?? null,
        tradeIn: ficha.linhas.find((line) => line.campo === 'trade_in')?.valor ?? null,
      } : undefined,
    };
  }), now);
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
    setWhere: eq(visitAppointments.source, 'agent'),
    set: {
      scheduledFor: input.scheduledFor,
      quote: input.quote,
      vehicleId: sql`coalesce(excluded.vehicle_id, ${visitAppointments.vehicleId})`,
      customerName: sql`coalesce(excluded.customer_name, ${visitAppointments.customerName})`,
      customerPhone: sql`coalesce(excluded.customer_phone, ${visitAppointments.customerPhone})`,
      updatedAt: sql`now()`,
    },
  }).returning();
  if (row) return row;
  const [manual] = await executor.select().from(visitAppointments)
    .where(eq(visitAppointments.conversationId, input.conversationId)).limit(1);
  if (!manual) throw new Error('Não foi possível consultar a visita existente.');
  return manual;
}

export type ManualAppointmentInput = { customerName: string; customerPhone: string; vehicleId: string | null; data: string; hora: string };
/** `vehicleId` ausente (undefined) deixa o vínculo como está; só `null` explícito é "sem veículo". */
export type AppointmentCorrection = { data: string; hora: string; vehicleId?: string | null };

/** Erro que a pessoa pode ler: a mensagem é dela, o resto vira o texto genérico na action. */
export class AppointmentInputError extends Error {}

const SLOT_MESSAGES: Record<Exclude<VisitSlotReason, 'ok'>, string> = {
  'sem-data': 'Escolha o dia da visita.',
  'sem-hora': 'Escolha a hora da visita.',
  fechado: 'Esse horário está fora do funcionamento da loja.',
  passado: 'Esse horário já passou. Escolha um dia e uma hora que ainda virão.',
  invalido: 'Dia ou hora inválidos.',
};
export const APPOINTMENT_NOT_FOUND = 'Visita não encontrada. Ela pode já ter sido cancelada.';

/** A regra de horário é a da Dayse (`resolveVisitSlot`); aqui só se traduz a recusa em palavras. */
function resolveManualSlot(data: string, hora: string, now: Date): Date {
  const slot = resolveVisitSlot({ data, hora, now });
  if (!slot.scheduledFor) throw new AppointmentInputError(SLOT_MESSAGES[slot.reason as Exclude<VisitSlotReason, 'ok'>]);
  return slot.scheduledFor;
}

/**
 * O que uma correção feita à mão grava. `source: 'manual'` é o que impede a Dayse de desfazer a
 * correção na próxima mensagem do cliente: o upsert dela não troca a hora de uma linha manual.
 */
export function manualEditFields(scheduledFor: Date, vehicleId?: string | null) {
  return {
    scheduledFor, source: 'manual' as const, updatedAt: sql`now()`,
    // Uma correção não apaga o que não perguntou: sem `vehicleId`, a coluna fica fora do UPDATE.
    ...(vehicleId === undefined ? {} : { vehicleId }),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** `AAAA-MM-DD` e `HH:MM` de um instante, no relógio da loja: o mesmo formato que o formulário envia. */
function storeDateAndTime(instant: Date) {
  const c = storeClock(instant);
  return { data: `${c.year}-${pad(c.month)}-${pad(c.day)}`, hora: `${pad(c.hour)}:${pad(c.minute)}` };
}

/** Marca uma visita pelo painel. Sem conversa e sem frase do cliente: quem a marcou foi o administrador. */
export async function createManualAppointment(input: ManualAppointmentInput, now: Date = new Date()): Promise<AppointmentRow> {
  const admin = await requireAdmin();
  const customerName = input.customerName.trim();
  const customerPhone = input.customerPhone.trim();
  if (!customerName) throw new AppointmentInputError('Informe o nome do cliente.');
  // DDD + número: 10 dígitos no mínimo. Telefone curto vira link de WhatsApp que não abre.
  if (customerPhone.replace(/\D/g, '').length < 10) throw new AppointmentInputError('Informe o telefone do cliente com DDD.');
  const scheduledFor = resolveManualSlot(input.data, input.hora, now);
  await ensureAttendanceTables();
  const [row] = await getDb().insert(visitAppointments).values({
    vehicleId: input.vehicleId, customerName, customerPhone, scheduledFor,
    quote: '', source: 'manual', createdBy: admin.userId,
  }).returning();
  return row;
}

/**
 * Corrige dia, hora e veículo de uma visita. Atualiza a linha: nunca cria outra. Horário que não
 * mudou não é revalidado: a visita de hoje que já passou continua corrigível (telefone, veículo),
 * mas ninguém move uma visita para o passado.
 */
export async function updateAppointment(id: string, input: AppointmentCorrection, now: Date = new Date()): Promise<AppointmentRow> {
  await requireAdmin();
  await ensureAttendanceTables();
  const [current] = await getDb().select().from(visitAppointments).where(eq(visitAppointments.id, id)).limit(1);
  if (!current) throw new AppointmentInputError(APPOINTMENT_NOT_FOUND);
  const unchanged = current.scheduledFor !== null && (() => {
    const was = storeDateAndTime(current.scheduledFor);
    return was.data === input.data.trim() && was.hora === input.hora.trim();
  })();
  const scheduledFor = unchanged ? current.scheduledFor! : resolveManualSlot(input.data, input.hora, now);
  const [row] = await getDb().update(visitAppointments)
    .set(manualEditFields(scheduledFor, input.vehicleId))
    .where(eq(visitAppointments.id, id)).returning();
  if (!row) throw new AppointmentInputError(APPOINTMENT_NOT_FOUND);
  return row;
}

/** Cancela removendo a linha. Se ela já não existe, o resultado desejado já é verdade. */
export async function deleteAppointment(id: string): Promise<void> {
  await requireAdmin();
  await ensureAttendanceTables();
  await getDb().delete(visitAppointments).where(eq(visitAppointments.id, id));
}
