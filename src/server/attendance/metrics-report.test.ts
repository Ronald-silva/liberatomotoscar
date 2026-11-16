import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AccessDeniedError extends Error {}
  return { AccessDeniedError, requireAdmin: vi.fn() };
});
vi.mock('@/server/authz', () => ({
  AccessDeniedError: mocks.AccessDeniedError, requireAdmin: mocks.requireAdmin,
}));

import { dayUtc, loadMetricsReport, metricsChannelSchema, metricsDaysSchema } from './metrics-report';

/**
 * As consultas do relatório são objetos de query do Drizzle: só viram SQL quando são aguardadas.
 * O duplo abaixo decide o que devolver pelos CAMPOS pedidos em `select({...})`, e não pela ordem
 * das chamadas — `buildFirstReplyMetricsQuery` faz dois `select` (subconsulta e média), então
 * contar chamadas amarraria o teste ao número de SELECTs de dentro de `metrics.ts`.
 */
function fakeDb(respostas: Partial<Record<Campo, unknown[]>>) {
  const select = vi.fn((campos: Record<string, unknown> = {}) => {
    const chaves = Object.keys(campos);
    // `occurredAt` antes de `evento`: as duas consultas de incidente pedem `evento`, e só a
    // lista das conversas a conferir pede a hora.
    const campo = (['conversas', 'segundosAtePrimeiraResposta', 'aiRequests', 'occurredAt', 'evento'] as const)
      .find((nome) => chaves.includes(nome));
    const resposta = (campo && respostas[campo]) ?? [];
    const chain: Record<string, unknown> = {
      then: (resolve: (valor: unknown) => unknown) => Promise.resolve(resposta).then(resolve),
    };
    for (const metodo of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy', 'orderBy', 'limit', 'as']) {
      chain[metodo] = () => chain;
    }
    return chain;
  });
  // O retorno mantém `select` visível: é como o teste de autorização prova que NENHUMA consulta
  // saiu quando `requireAdmin()` reprova.
  return { select } as unknown as Pick<ReturnType<typeof import('@/server/db/client').getDb>, 'select'>;
}

type Campo = 'conversas' | 'segundosAtePrimeiraResposta' | 'aiRequests' | 'evento' | 'occurredAt';

const conversaRow = [{
  conversas: 10, conversasComHandoff: 3,
  conversasComIntencaoDeVisita: 4, conversasComVisitaMarcada: 1, mensagens: 60,
}];
const primeiraRow = [{ segundosAtePrimeiraResposta: 42.6 }];
const usoRow = [{ aiRequests: 50, inputTokens: 9_000, outputTokens: 1_000, guardRejections: 1 }];
const incidenteRows = [
  { evento: 'encaminhado_teto_conversa', motivo: 'teto_conversa', registro: 'completo', total: 2 },
  { evento: 'cliente_sem_atendimento', motivo: 'envio_falhou', registro: null, total: 1 },
];
const semAtendimentoRows = [{
  conversationId: '11111111-1111-4111-8111-111111111111',
  evento: 'cliente_sem_atendimento', motivo: 'envio_falhou',
  occurredAt: new Date('2026-11-14T12:00:00.000Z'),
}];

const todas = {
  conversas: conversaRow, segundosAtePrimeiraResposta: primeiraRow, aiRequests: usoRow,
  evento: incidenteRows, occurredAt: semAtendimentoRows,
};

const deps = (respostas: Partial<Record<Campo, unknown[]>> = todas) => ({
  db: fakeDb(respostas),
  ensureTables: vi.fn(async () => undefined),
  now: () => new Date('2026-11-15T12:00:00.000Z'),
});

beforeEach(() => { vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ userId: 'u1' }); });

describe('janela e canal vindos da URL', () => {
  it('aceita 7 e 30 dias e cai em 30 para qualquer outra coisa', () => {
    expect(metricsDaysSchema.parse('7')).toBe(7);
    expect(metricsDaysSchema.parse('30')).toBe(30);
    for (const lixo of ['1', '365', 'ontem', undefined, '']) expect(metricsDaysSchema.parse(lixo)).toBe(30);
  });

  it('aceita site e whatsapp e cai em whatsapp para qualquer outra coisa', () => {
    expect(metricsChannelSchema.parse('site')).toBe('site');
    expect(metricsChannelSchema.parse('whatsapp')).toBe('whatsapp');
    for (const lixo of ['telegram', undefined, '']) expect(metricsChannelSchema.parse(lixo)).toBe('whatsapp');
  });

  it('o dia UTC da janela é o que attendance_usage guarda como texto', () => {
    expect(dayUtc(new Date('2026-11-15T23:30:00.000Z'))).toBe('2026-11-15');
  });
});

describe('autorização', () => {
  /** A barreira é por função, e não só pelo layout: a rota pode ser chamada de outro lugar. */
  it('exige admin antes de qualquer consulta', async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.AccessDeniedError());
    const d = deps();
    await expect(loadMetricsReport({ channel: 'whatsapp', dias: 30 }, d))
      .rejects.toBeInstanceOf(mocks.AccessDeniedError);
    expect(d.ensureTables).not.toHaveBeenCalled();
    expect(d.db.select).not.toHaveBeenCalled();
  });
});

describe('relatório da janela', () => {
  it('junta as cinco consultas num relatório só', async () => {
    const report = await loadMetricsReport({ channel: 'whatsapp', dias: 7 }, deps());
    expect(report.channel).toBe('whatsapp');
    expect(report.dias).toBe(7);
    expect(report.desde.toISOString()).toBe('2026-11-08T12:00:00.000Z');
    expect(report.metrics.conversas).toBe(10);
    expect(report.metrics.resolvidasNoCanalPct).toBe(70);
    expect(report.metrics.visitaIntencaoPct).toBe(40);
    expect(report.metrics.visitaMarcadaPct).toBe(10);
    expect(report.metrics.mensagensPorConversa).toBe(6);
    // A média do Postgres vem fracionada; a tela não tem o que fazer com 42,6 s.
    expect(report.metrics.segundosAtePrimeiraResposta).toBe(43);
    expect(report.metrics.tokensPorConversa).toBe(1000);
    expect(report.incidentes.falhasOperacionais).toBe(1);
    expect(report.incidentes.encaminhamentos).toBe(2);
    expect(report.semAtendimento).toHaveLength(1);
  });

  it('garante as tabelas antes de consultar: base sem a migração mostraria erro em vez de zero', async () => {
    const d = deps();
    await loadMetricsReport({ channel: 'whatsapp', dias: 30 }, d);
    expect(d.ensureTables).toHaveBeenCalledOnce();
  });

  /**
   * `avg` do Postgres volta null sem linhas, e `count` volta como string em alguns drivers. O
   * relatório tem de distinguir "sem dado" de zero e não pode concatenar texto como número.
   */
  it('janela vazia devolve null onde não há base, e não zero', async () => {
    const report = await loadMetricsReport({ channel: 'site', dias: 30 }, deps({
      conversas: [{ conversas: 0, conversasComHandoff: 0, conversasComIntencaoDeVisita: 0, conversasComVisitaMarcada: 0, mensagens: 0 }],
      segundosAtePrimeiraResposta: [{ segundosAtePrimeiraResposta: null }],
      aiRequests: [{ aiRequests: 0, inputTokens: 0, outputTokens: 0, guardRejections: 0 }],
    }));
    expect(report.metrics.conversas).toBe(0);
    expect(report.metrics.resolvidasNoCanalPct).toBeNull();
    expect(report.metrics.visitaIntencaoPct).toBeNull();
    expect(report.metrics.visitaMarcadaPct).toBeNull();
    expect(report.metrics.segundosAtePrimeiraResposta).toBeNull();
    expect(report.incidentes.falhasOperacionais).toBe(0);
    expect(report.semAtendimento).toEqual([]);
  });

  it('contador que chega como texto entra como número, não como concatenação', async () => {
    const report = await loadMetricsReport({ channel: 'whatsapp', dias: 30 }, deps({
      conversas: [{ conversas: '10', conversasComHandoff: '0', conversasComIntencaoDeVisita: '0', conversasComVisitaMarcada: '0', mensagens: '25' }],
      segundosAtePrimeiraResposta: [{ segundosAtePrimeiraResposta: '12' }],
      aiRequests: [{ aiRequests: '4', inputTokens: '100', outputTokens: '20', guardRejections: '1' }],
    }));
    expect(report.metrics.conversas).toBe(10);
    expect(report.metrics.mensagensPorConversa).toBe(2.5);
    expect(report.metrics.tokensPorConversa).toBe(12);
    expect(report.metrics.guardaReprovadaPct).toBe(25);
    expect(report.metrics.segundosAtePrimeiraResposta).toBe(12);
  });

  it('linha de consulta ausente não derruba o relatório', async () => {
    const report = await loadMetricsReport({ channel: 'whatsapp', dias: 30 }, deps({}));
    expect(report.metrics.conversas).toBe(0);
    expect(report.metrics.segundosAtePrimeiraResposta).toBeNull();
  });
});
