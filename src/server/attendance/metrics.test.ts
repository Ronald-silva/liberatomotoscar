import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/server/db/schema';
import {
  buildConversationMetricsQuery, buildFirstReplyMetricsQuery, buildUsageMetricsQuery, deriveAgentMetrics,
} from './metrics';

const db = drizzle.mock({ schema });

describe('6.1-6.4 consultas das métricas do agente', () => {
  it('conta conversas, handoffs, visitas e mensagens por canal e período', () => {
    const q = buildConversationMetricsQuery(db, { channel: 'whatsapp', since: new Date('2026-10-01T00:00:00Z') }).toSQL();
    expect(q.sql).toContain('"conversations"."channel" = $1');
    expect(q.params).toContain('whatsapp');
    // 6.2 — a visita é um fato anotado pela ferramenta, não uma coluna própria.
    expect(q.sql).toContain('visit');
  });

  it('mede o tempo até a primeira resposta a partir dos timestamps', () => {
    const q = buildFirstReplyMetricsQuery(db, { channel: 'whatsapp', since: new Date('2026-10-01T00:00:00Z') }).toSQL();
    expect(q.sql).toMatch(/visitor/);
    expect(q.sql).toMatch(/epoch/i);
  });

  it('lê requisições, tokens e guardas reprovadas do dia', () => {
    const q = buildUsageMetricsQuery(db, { channel: 'whatsapp', sinceDayUtc: '2026-10-01' }).toSQL();
    expect(q.params).toContain('whatsapp');
    expect(q.params).toContain('2026-10-01');
    expect(q.sql).toContain('guard_rejections');
  });
});

describe('6.1-6.5 taxas derivadas', () => {
  it('calcula resolução no canal, visita, mensagens e guarda reprovada', () => {
    const m = deriveAgentMetrics({
      conversas: 100, conversasComHandoff: 35, conversasComVisita: 12, mensagens: 620,
      segundosAtePrimeiraResposta: 18, aiRequests: 400, guardRejections: 8,
      inputTokens: 100_000, outputTokens: 20_000,
    });
    expect(m.resolvidasNoCanalPct).toBe(65);
    expect(m.visitaAgendadaPct).toBe(12);
    expect(m.mensagensPorConversa).toBe(6.2);
    expect(m.guardaReprovadaPct).toBe(2);
    expect(m.segundosAtePrimeiraResposta).toBe(18);
    expect(m.tokensPorConversa).toBe(1200);
  });

  it('não divide por zero quando ainda não há conversa nenhuma', () => {
    const m = deriveAgentMetrics({
      conversas: 0, conversasComHandoff: 0, conversasComVisita: 0, mensagens: 0,
      segundosAtePrimeiraResposta: null, aiRequests: 0, guardRejections: 0,
      inputTokens: 0, outputTokens: 0,
    });
    expect(m.resolvidasNoCanalPct).toBeNull();
    expect(m.visitaAgendadaPct).toBeNull();
    expect(m.mensagensPorConversa).toBeNull();
    expect(m.guardaReprovadaPct).toBeNull();
    expect(m.tokensPorConversa).toBeNull();
  });

  it('trata handoff acima do total como dado inconsistente, não como taxa negativa', () => {
    const m = deriveAgentMetrics({
      conversas: 10, conversasComHandoff: 14, conversasComVisita: 0, mensagens: 10,
      segundosAtePrimeiraResposta: null, aiRequests: 0, guardRejections: 0,
      inputTokens: 0, outputTokens: 0,
    });
    expect(m.resolvidasNoCanalPct).toBe(0);
  });
});
