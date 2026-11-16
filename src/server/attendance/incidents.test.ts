import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/server/db/schema';
import {
  buildIncidentBreakdownQuery, buildUnattendedConversationsQuery, deriveIncidentSummary,
  recordAttendanceIncident, type IncidentBreakdownRow,
} from './incidents';

const db = drizzle.mock({ schema });
const CONVERSA = '11111111-1111-4111-8111-111111111111';

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('gravação do incidente', () => {
  function fakeDb() {
    const values = vi.fn().mockResolvedValue(undefined);
    return { db: { insert: vi.fn(() => ({ values })) }, values };
  }

  it('grava canal, evento, motivo, registro e conversa', async () => {
    const { db: fake, values } = fakeDb();
    const resultado = await recordAttendanceIncident({
      channel: 'whatsapp', evento: 'encaminhado_teto_conversa',
      motivo: 'teto_conversa', registro: 'completo', conversationId: CONVERSA,
    }, fake as never);
    expect(resultado).toBe('gravado');
    expect(values).toHaveBeenCalledWith({
      channel: 'whatsapp', evento: 'encaminhado_teto_conversa',
      motivo: 'teto_conversa', registro: 'completo', conversationId: CONVERSA,
    });
  });

  /** O webhook passa `conversationIdForTurn ?? ''` quando o turno morreu antes de persistir. */
  it('id de conversa que não é uuid entra como null em vez de derrubar a gravação', async () => {
    const { db: fake, values } = fakeDb();
    await recordAttendanceIncident({
      channel: 'whatsapp', evento: 'cliente_sem_atendimento', motivo: 'turno_estourou', conversationId: '',
    }, fake as never);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ conversationId: null, registro: null }));
  });

  /**
   * É a propriedade que importa mais: o incidente acontece justamente quando o banco está ruim.
   * Se a gravação lançasse, ela viraria uma segunda falha dentro do caminho de erro do webhook —
   * e o cliente, que já estava sem resposta, ficaria também sem o alerta que vem depois dela.
   */
  it('banco fora do ar não lança: o incidente é perdido, e o retorno diz isso', async () => {
    const fake = { insert: vi.fn(() => { throw new Error('connection refused'); }) };
    await expect(recordAttendanceIncident({
      channel: 'whatsapp', evento: 'cliente_sem_atendimento',
    }, fake as never)).resolves.toBe('falhou');
  });
});

describe('consultas da janela', () => {
  it('agrupa por evento, motivo e registro dentro do canal e do período', () => {
    const q = buildIncidentBreakdownQuery(db, { channel: 'whatsapp', since: new Date('2026-11-01T00:00:00Z') }).toSQL();
    expect(q.params).toContain('whatsapp');
    expect(q.sql).toContain('group by');
    expect(q.sql).toContain('"attendance_incidents"."evento"');
    expect(q.sql).toContain('"attendance_incidents"."registro"');
  });

  it('lista só os dois eventos de falha, do mais recente para o mais antigo', () => {
    const q = buildUnattendedConversationsQuery(db, { channel: 'whatsapp', since: new Date('2026-11-01T00:00:00Z') }).toSQL();
    expect(q.sql).toContain("'cliente_sem_atendimento', 'encaminhamento_nao_registrado'");
    expect(q.sql).toMatch(/order by .*"occurred_at" desc/);
    expect(q.sql).toContain('limit');
  });
});

describe('resumo dos incidentes da janela', () => {
  const linhas: IncidentBreakdownRow[] = [
    { evento: 'encaminhado_teto_conversa', motivo: 'teto_conversa', registro: 'completo', total: 4 },
    { evento: 'encaminhado_infraestrutura', motivo: 'infraestrutura', registro: 'completo', total: 2 },
    { evento: 'encaminhado_infraestrutura', motivo: 'infraestrutura', registro: 'nenhum', total: 1 },
    { evento: 'encaminhamento_nao_registrado', motivo: 'infraestrutura', registro: 'nenhum', total: 1 },
    { evento: 'cliente_sem_atendimento', motivo: 'envio_falhou', registro: null, total: 3 },
  ];

  it('conta os encaminhamentos por motivo, somando os registros do mesmo motivo', () => {
    const resumo = deriveIncidentSummary(linhas);
    expect(resumo.encaminhamentos).toBe(7);
    expect(resumo.encaminhamentosPorMotivo).toEqual([
      { motivo: 'teto_conversa', rotulo: 'teto de mensagens da conversa', total: 4 },
      { motivo: 'infraestrutura', rotulo: 'falha de infraestrutura', total: 3 },
    ]);
  });

  /** Mesma definição do contador `falhasOperacionais` do webhook, para os dois números casarem. */
  it('falhas operacionais são os dois eventos em que ninguém garantiu o vendedor', () => {
    const resumo = deriveIncidentSummary(linhas);
    expect(resumo.falhasOperacionais).toBe(4);
    expect(resumo.falhasPorEvento).toEqual([
      { evento: 'cliente_sem_atendimento', motivo: 'envio_falhou', rotulo: 'a Meta recusou o envio', total: 3 },
      { evento: 'encaminhamento_nao_registrado', motivo: 'infraestrutura', rotulo: 'falha de infraestrutura', total: 1 },
    ]);
  });

  /**
   * A conversa sem registro gera duas linhas (o evento dedicado e o `encaminhado_*` com
   * `registro: 'nenhum'`). Contar `registro = 'nenhum'` daria 2 para um único incidente.
   */
  it('não conta duas vezes a mesma conversa sem registro', () => {
    expect(deriveIncidentSummary(linhas).semRegistro).toBe(1);
  });

  it('janela sem incidente nenhum devolve zeros e listas vazias, não erro', () => {
    const resumo = deriveIncidentSummary([]);
    expect(resumo).toEqual({
      encaminhamentos: 0, encaminhamentosPorMotivo: [],
      falhasOperacionais: 0, falhasPorEvento: [], semRegistro: 0,
    });
  });

  it('motivo que ainda não tem rótulo aparece com o próprio nome, sem sumir da conta', () => {
    const resumo = deriveIncidentSummary([
      { evento: 'encaminhado_motivo_novo', motivo: 'motivo_novo', registro: 'completo', total: 2 },
    ]);
    expect(resumo.encaminhamentosPorMotivo).toEqual([
      { motivo: 'motivo_novo', rotulo: 'motivo_novo', total: 2 },
    ]);
  });
});
