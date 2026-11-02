import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const admin = vi.hoisted(() => ({ userId: 'admin-1' }));
vi.mock('@/server/authz', () => ({ requireAdmin: async () => ({ userId: admin.userId }) }));

import { closeDb, getDb } from '@/server/db/client';
import { conversations, usersTable, visitAppointments } from '@/server/db/schema';
import {
  AppointmentInputError, createManualAppointment, deleteAppointment, groupAgenda, manualEditFields,
  updateAppointment, upsertAgentAppointment, type AppointmentRow,
} from './appointments';

const at = (iso: string) => new Date(iso);
const row = (quote: string, scheduledFor: Date | null): AppointmentRow => ({
  id: randomUUID(), conversationId: null, vehicleId: null, customerName: null, customerPhone: null,
  scheduledFor, quote, source: 'manual', createdBy: null,
  createdAt: at('2026-11-01T00:00:00Z'), updatedAt: at('2026-11-01T00:00:00Z'),
});
const quotes = (rows: AppointmentRow[]) => rows.map((r) => r.quote);

// Segunda-feira, 12h na loja. A semana da loja fecha no sábado, dia 7.
const now = at('2026-11-02T12:00:00-03:00');

describe('groupAgenda', () => {
  it('agrupa em hoje, amanha, esta semana, depois e sem hora', () => {
    const agenda = groupAgenda([
      row('depois', at('2026-11-09T10:00:00-03:00')),
      row('semana', at('2026-11-05T10:00:00-03:00')),
      row('sem hora', null),
      row('amanha', at('2026-11-03T10:00:00-03:00')),
      row('hoje', at('2026-11-02T15:00:00-03:00')),
    ], now);
    expect(quotes(agenda.hoje)).toEqual(['hoje']);
    expect(quotes(agenda.amanha)).toEqual(['amanha']);
    expect(quotes(agenda.semana)).toEqual(['semana']);
    expect(quotes(agenda.depois)).toEqual(['depois']);
    expect(quotes(agenda.semHora)).toEqual(['sem hora']);
  });

  it('esta semana termina no sabado; o que passa disso cai em depois', () => {
    const agenda = groupAgenda([
      row('sabado', at('2026-11-07T17:00:00-03:00')),
      row('segunda seguinte', at('2026-11-09T09:00:00-03:00')),
    ], now);
    expect(quotes(agenda.semana)).toEqual(['sabado']);
    expect(quotes(agenda.depois)).toEqual(['segunda seguinte']);
  });

  it('no sabado a semana ja acabou: so amanha e depois', () => {
    const sabado = at('2026-11-07T10:00:00-03:00');
    const agenda = groupAgenda([
      row('domingo', at('2026-11-08T10:00:00-03:00')),
      row('segunda', at('2026-11-09T10:00:00-03:00')),
    ], sabado);
    expect(quotes(agenda.amanha)).toEqual(['domingo']);
    expect(quotes(agenda.depois)).toEqual(['segunda']);
    expect(agenda.semana).toEqual([]);
  });

  it('no domingo a semana ainda vai ate o sabado', () => {
    const domingo = at('2026-11-01T10:00:00-03:00');
    const agenda = groupAgenda([row('sabado', at('2026-11-07T10:00:00-03:00'))], domingo);
    expect(quotes(agenda.semana)).toEqual(['sabado']);
  });

  it('visita de hoje que ja passou fica em hoje, marcada; a de ontem sai da tela', () => {
    const agenda = groupAgenda([
      row('ontem', at('2026-11-01T15:00:00-03:00')),
      row('passou', at('2026-11-02T10:00:00-03:00')),
      row('vem', at('2026-11-02T15:00:00-03:00')),
      row('sem hora', null),
    ], now);
    expect(agenda.hoje.map((r) => [r.quote, r.passou])).toEqual([['passou', true], ['vem', false]]);
    expect([...agenda.amanha, ...agenda.semana, ...agenda.depois]).toEqual([]);
    expect(quotes(agenda.semHora)).toEqual(['sem hora']);
    expect(agenda.semHora[0].passou).toBe(false);
  });

  it('o domingo seguinte ja e depois, nao esta semana', () => {
    const agenda = groupAgenda([row('domingo', at('2026-11-08T10:00:00-03:00'))], now);
    expect(quotes(agenda.depois)).toEqual(['domingo']);
    expect(agenda.semana).toEqual([]);
  });

  it('o "agora" tambem e lido no relogio da loja: sabado 22h ja e domingo em UTC', () => {
    const sabadoNoite = at('2026-11-07T22:00:00-03:00'); // 01:00 de domingo em UTC
    const agenda = groupAgenda([
      row('hoje', at('2026-11-07T23:00:00-03:00')),
      row('domingo', at('2026-11-08T10:00:00-03:00')),
      row('segunda', at('2026-11-09T10:00:00-03:00')),
    ], sabadoNoite);
    expect(quotes(agenda.hoje)).toEqual(['hoje']);
    expect(quotes(agenda.amanha)).toEqual(['domingo']);
    expect(quotes(agenda.depois)).toEqual(['segunda']);
    expect(agenda.semana).toEqual([]);
  });

  it('conta o dia no calendario da loja, nao em UTC', () => {
    // 22h30 de segunda na loja já é terça em UTC.
    const noite = groupAgenda([row('noite', at('2026-11-02T22:30:00-03:00'))], now);
    expect(quotes(noite.hoje)).toEqual(['noite']);
    expect(noite.amanha).toEqual([]);
  });

  it('ordena cada grupo por horario', () => {
    const agenda = groupAgenda([
      row('tarde', at('2026-11-05T16:00:00-03:00')),
      row('manha', at('2026-11-05T09:00:00-03:00')),
    ], now);
    expect(quotes(agenda.semana)).toEqual(['manha', 'tarde']);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('upsertAgentAppointment com PostgreSQL isolado', () => {
  afterAll(closeDb);

  it('remarcar na mesma conversa atualiza, nao duplica', async () => {
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Banco de teste isolado obrigatório.');
    const db = getDb();
    const [conversation] = await db.insert(conversations).values({
      channel: 'whatsapp', tokenHash: randomUUID(), expiresAt: at('2027-01-01T00:00:00Z'),
    }).returning();
    const base = { conversationId: conversation.id, vehicleId: null, customerName: 'Ana', customerPhone: '85999990000' };
    try {
      await upsertAgentAppointment({ ...base, scheduledFor: at('2026-11-07T14:00:00-03:00'), quote: 'sabado as 14h' });
      // A remarcação não repete nome nem telefone: os que já existem não podem ser apagados.
      const second = await upsertAgentAppointment({
        ...base, customerName: null, customerPhone: null,
        scheduledFor: at('2026-11-09T10:00:00-03:00'), quote: 'melhor segunda de manha',
      });
      const rows = await db.select().from(visitAppointments).where(eq(visitAppointments.conversationId, conversation.id));
      expect(rows).toHaveLength(1);
      expect(second.id).toBe(rows[0].id);
      expect(rows[0]).toMatchObject({ quote: 'melhor segunda de manha', customerName: 'Ana', customerPhone: '85999990000', source: 'agent' });
      expect(rows[0].scheduledFor?.toISOString()).toBe('2026-11-09T13:00:00.000Z');
    } finally {
      await db.delete(conversations).where(eq(conversations.id, conversation.id));
    }
  });
});

// Segunda-feira 12h na loja; sábado, dia 7, é dia de funcionamento; domingo, dia 8, a loja fecha.
const visit = { customerName: 'Ana', customerPhone: '(85) 99999-0000', vehicleId: null, data: '2026-11-07', hora: '14:00' };

describe('regras de agendamento manual (sem banco)', () => {
  it('recusa horario fora do funcionamento com a mesma regra do agente', async () => {
    // Uma regra só: o que resolveVisitSlot recusa para a Dayse, o formulário também recusa.
    for (const fora of [{ hora: '18:00' }, { hora: '08:59' }, { data: '2026-11-08' }]) {
      await expect(createManualAppointment({ ...visit, ...fora }, now)).rejects.toThrow(AppointmentInputError);
    }
    await expect(createManualAppointment({ ...visit, hora: '18:00' }, now))
      .rejects.toThrow(/funcionamento/i);
  });

  it('recusa horario que ja passou e data invalida', async () => {
    await expect(createManualAppointment({ ...visit, data: '2026-11-02', hora: '10:00' }, now)).rejects.toThrow(/já passou/i);
    await expect(createManualAppointment({ ...visit, data: '2026-02-31' }, now)).rejects.toThrow(AppointmentInputError);
  });

  it('recusa telefone vazio e nome vazio', async () => {
    await expect(createManualAppointment({ ...visit, customerPhone: '   ' }, now)).rejects.toThrow(/telefone/i);
    await expect(createManualAppointment({ ...visit, customerPhone: '123' }, now)).rejects.toThrow(/telefone/i);
    await expect(createManualAppointment({ ...visit, customerName: ' ' }, now)).rejects.toThrow(/nome/i);
  });

  it('toda edicao feita a mao marca a linha como manual, para a Dayse nao desfazer', () => {
    const fields = manualEditFields(at('2026-11-07T14:00:00-03:00'), null);
    expect(fields.source).toBe('manual');
    expect(fields.scheduledFor?.toISOString()).toBe('2026-11-07T17:00:00.000Z');
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('agendamento manual com PostgreSQL isolado', () => {
  afterAll(closeDb);
  const created: string[] = [];
  const adminId = randomUUID();

  async function withAdmin<T>(run: () => Promise<T>): Promise<T> {
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Banco de teste isolado obrigatório.');
    const db = getDb();
    await db.insert(usersTable).values({ id: adminId, name: 'Admin de teste' }).onConflictDoNothing();
    admin.userId = adminId;
    return run();
  }
  afterAll(async () => {
    const db = getDb();
    for (const id of created) await db.delete(visitAppointments).where(eq(visitAppointments.id, id));
    await db.delete(usersTable).where(eq(usersTable.id, adminId));
  });

  it('cria agendamento manual com quem atendeu registrado', () => withAdmin(async () => {
    const row = await createManualAppointment(visit, now);
    created.push(row.id);
    expect(row).toMatchObject({ source: 'manual', createdBy: adminId, customerName: 'Ana', conversationId: null });
    expect(row.scheduledFor?.toISOString()).toBe('2026-11-07T17:00:00.000Z');
  }));

  it('corrigir altera o horario sem criar outra linha e vira manual', () => withAdmin(async () => {
    const db = getDb();
    const [conversation] = await db.insert(conversations).values({
      channel: 'whatsapp', tokenHash: randomUUID(), expiresAt: at('2027-01-01T00:00:00Z'),
    }).returning();
    try {
      const agent = await upsertAgentAppointment({
        conversationId: conversation.id, vehicleId: null, customerName: 'Beto', customerPhone: '85988887777',
        scheduledFor: at('2026-11-07T14:00:00-03:00'), quote: 'sabado as 14h',
      });
      const before = (await db.select().from(visitAppointments)).length;
      const fixed = await updateAppointment(agent.id, { data: '2026-11-06', hora: '10:30', vehicleId: null }, now);
      expect((await db.select().from(visitAppointments)).length).toBe(before);
      expect(fixed.id).toBe(agent.id);
      expect(fixed.scheduledFor?.toISOString()).toBe('2026-11-06T13:30:00.000Z');
      // A frase do cliente e a conversa ficam; so a origem muda, e e ela que protege a correcao.
      expect(fixed).toMatchObject({ source: 'manual', quote: 'sabado as 14h', conversationId: conversation.id, customerName: 'Beto' });
    } finally {
      await db.delete(conversations).where(eq(conversations.id, conversation.id));
    }
  }));

  it('corrigir um id que nao existe avisa em vez de fingir', () => withAdmin(async () => {
    await expect(updateAppointment(randomUUID(), { data: '2026-11-06', hora: '10:30', vehicleId: null }, now))
      .rejects.toThrow(/não encontrada/i);
  }));

  it('cancelar remove a linha', () => withAdmin(async () => {
    const row = await createManualAppointment(visit, now);
    await deleteAppointment(row.id);
    const rest = await getDb().select().from(visitAppointments).where(eq(visitAppointments.id, row.id));
    expect(rest).toEqual([]);
  }));
});
