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
    // 6.2 — a intenção é um fato anotado pela ferramenta; a visita marcada vem da agenda.
    expect(q.sql).toContain('visit');
    expect(q.sql).toContain('visit_appointments');
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
      conversas: 100, conversasComHandoff: 35, conversasComIntencaoDeVisita: 12, conversasComVisitaMarcada: 5, mensagens: 620,
      segundosAtePrimeiraResposta: 18, aiRequests: 400, guardRejections: 8,
      inputTokens: 100_000, outputTokens: 20_000,
    });
    expect(m.resolvidasNoCanalPct).toBe(65);
    expect(m.visitaIntencaoPct).toBe(12);
    expect(m.visitaMarcadaPct).toBe(5);
    expect(m.mensagensPorConversa).toBe(6.2);
    expect(m.guardaReprovadaPct).toBe(2);
    expect(m.segundosAtePrimeiraResposta).toBe(18);
    expect(m.tokensPorConversa).toBe(1200);
  });

  it('não divide por zero quando ainda não há conversa nenhuma', () => {
    const m = deriveAgentMetrics({
      conversas: 0, conversasComHandoff: 0, conversasComIntencaoDeVisita: 0, conversasComVisitaMarcada: 0, mensagens: 0,
      segundosAtePrimeiraResposta: null, aiRequests: 0, guardRejections: 0,
      inputTokens: 0, outputTokens: 0,
    });
    expect(m.resolvidasNoCanalPct).toBeNull();
    expect(m.visitaIntencaoPct).toBeNull();
    expect(m.visitaMarcadaPct).toBeNull();
    expect(m.mensagensPorConversa).toBeNull();
    expect(m.guardaReprovadaPct).toBeNull();
    expect(m.tokensPorConversa).toBeNull();
  });

  it('trata handoff acima do total como dado inconsistente, não como taxa negativa', () => {
    const m = deriveAgentMetrics({
      conversas: 10, conversasComHandoff: 14, conversasComIntencaoDeVisita: 0, conversasComVisitaMarcada: 0, mensagens: 10,
      segundosAtePrimeiraResposta: null, aiRequests: 0, guardRejections: 0,
      inputTokens: 0, outputTokens: 0,
    });
    expect(m.resolvidasNoCanalPct).toBe(0);
  });
});

/**
 * O veredito da missão 2. `visitaAgendadaPct` dizia "visita agendada" e lia
 * `conversations.facts @> [{"field":"visit"}]`, que é a Dayse anotando que o cliente FALOU de
 * visita. Nunca tocava `visit_appointments`, que é a agenda que o vendedor abre. Os dois nomes
 * e os dois números agora existem lado a lado, e estes testes são o que impede que voltem a ser
 * confundidos: se alguém reaproveitar a contagem de intenção para a métrica de visita marcada,
 * o segundo teste falha.
 */
describe('6.2 intenção de visita × visita marcada', () => {
  it('lê a intenção de conversations.facts e a visita marcada de visit_appointments', () => {
    const q = buildConversationMetricsQuery(db, { channel: 'whatsapp', since: new Date('2026-10-01T00:00:00Z') }).toSQL();
    // A intenção continua saindo do fato anotado...
    expect(q.sql.replace(/\n/g, ' ')).toMatch(/"facts".*visit/);
    // ...e a visita marcada passa a sair da agenda, por conversa.
    expect(q.sql).toMatch(/exists \(\s*select 1 from "visit_appointments"/i);
    expect(q.sql).toContain('"visit_appointments"."conversation_id" = "conversations"."id"');
  });

  it('separa o número: 12% falaram de visita, 5% têm visita na agenda', () => {
    const m = deriveAgentMetrics({
      conversas: 100, conversasComHandoff: 0,
      conversasComIntencaoDeVisita: 12, conversasComVisitaMarcada: 5,
      mensagens: 100, segundosAtePrimeiraResposta: null,
      aiRequests: 0, guardRejections: 0, inputTokens: 0, outputTokens: 0,
    });
    expect(m.visitaIntencaoPct).toBe(12);
    expect(m.visitaMarcadaPct).toBe(5);
    // O nome antigo não volta nem por engano: quem procurar por ele não encontra número nenhum.
    expect(m).not.toHaveProperty('visitaAgendadaPct');
  });

  it('intenção sem nenhuma visita marcada aparece como 0%, não como a taxa de intenção', () => {
    const m = deriveAgentMetrics({
      conversas: 40, conversasComHandoff: 0,
      conversasComIntencaoDeVisita: 10, conversasComVisitaMarcada: 0,
      mensagens: 40, segundosAtePrimeiraResposta: null,
      aiRequests: 0, guardRejections: 0, inputTokens: 0, outputTokens: 0,
    });
    expect(m.visitaIntencaoPct).toBe(25);
    expect(m.visitaMarcadaPct).toBe(0);
  });
});
