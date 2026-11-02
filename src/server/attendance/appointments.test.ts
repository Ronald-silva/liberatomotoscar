import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('@/server/authz', () => ({ requireAdmin: async () => ({ userId: 'admin-1' }) }));

import { closeDb, getDb } from '@/server/db/client';
import { conversations, visitAppointments } from '@/server/db/schema';
import { groupAgenda, upsertAgentAppointment, type AppointmentRow } from './appointments';

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
