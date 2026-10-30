import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { MockLanguageModelV4 } from 'ai/test';
import * as schema from '@/server/db/schema';
import { handoffPausesAutomation, type MessageRow } from '@/server/attendance/conversation-repository';
import { buildConversationMetricsQuery, buildFirstReplyMetricsQuery } from '@/server/attendance/metrics';
import { normalizeProviderError, AgentProviderError } from './provider';
import { runAgentTurn, type AgentTurnDeps } from './run';

const db = drizzle.mock({ schema });

describe('I2 — um fallback não pode desligar o agente para sempre', () => {
  it('ai_suggested não transfere a conversa para o humano', () => {
    // Um falso positivo de guarda na mensagem 2 de 20 tirava o agente da conversa inteira.
    expect(handoffPausesAutomation('ai_suggested')).toBe(false);
  });

  it('pedido explícito de pessoa continua pausando', () => {
    expect(handoffPausesAutomation('visitor_request')).toBe(true);
  });

  it('troca e financiamento seguem sem pausar, como já era', () => {
    expect(handoffPausesAutomation('trade_in')).toBe(false);
    expect(handoffPausesAutomation('financing')).toBe(false);
  });
});

describe('I9 — dois preços para a mesma moto numa mensagem', () => {
  const linha = (id: string, priceCents: number) => ({
    id, slug: `cg-${id}`, type: 'motorcycle' as const, brand: 'Honda', model: 'CG 160 Start',
    version: null, year: 2022, mileageKm: 21_000, color: 'Vermelha', priceCents, versionNumber: 1,
  });

  it('não emite dois cartões do mesmo modelo com preços diferentes', async () => {
    const antigo = linha('11111111-1111-4111-8111-111111111111', 1_200_000);
    const atual = linha('22222222-2222-4222-8222-222222222222', 1_450_000);
    const history = [{ id: 'm1', sender: 'ai', body: 'Temos a Honda CG 160 Start.',
      cards: [{ id: antigo.id, title: 'Honda CG 160 Start', year: 2022,
        priceCents: 1_200_000, href: '/veiculos/cg-antigo' }] }] as never as MessageRow[];

    const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined } };
    // O modelo BUSCA neste turno, e a reconferência já trouxe o anúncio antigo do mesmo modelo:
    // é essa combinação que colocava dois preços da mesma moto numa mensagem.
    // Contador próprio: `doGenerateCalls` já inclui a chamada em curso quando o corpo roda, e
    // usá-lo fazia o mock devolver texto no primeiro passo — o teste passava sem buscar nada.
    let passo = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => (passo++ === 0
        ? { content: [{ type: 'tool-call' as const, toolCallId: 't1', toolName: 'buscar_veiculos',
            input: JSON.stringify({ modelo: 'CG' }) }],
          finishReason: { unified: 'tool-calls' as const, raw: undefined }, usage, warnings: [] }
        : { content: [{ type: 'text' as const, text: 'A Honda CG 160 Start está disponível, quer ver?' }],
          finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [] }),
    });

    const r = await runAgentTurn({ conversationId: 'c1', message: 'tem CG?', history }, {
      model: model as unknown as AgentTurnDeps['model'],
      searchVehicles: (async () => ({ items: [atual], checkedAt: 'x' })) as never,
      readVehicle: (async ({ id }: { id: string }) => ({
        item: [antigo, atual].find((v) => v.id === id) ?? null, checkedAt: 'x' })) as never,
    });

    expect(r.toolsUsed, 'o turno precisa ter buscado para reproduzir o caso').toContain('buscar_veiculos');
    const precos = new Set(r.reply.cards.map((c) => c.priceCents));
    expect(r.reply.cards.length, 'um cartão por modelo').toBeLessThanOrEqual(1);
    expect(precos.size, 'nunca dois preços para a mesma moto').toBeLessThanOrEqual(1);
    // O cartão que vale é o do anúncio recém-consultado, não o relido de um turno antigo.
    expect(r.reply.cards[0]?.priceCents).toBe(1_450_000);
  });
});

describe('falha de provedor precisa dizer qual foi', () => {
  it('preserva o detalhe do erro de upstream para diagnóstico', () => {
    const erro = normalizeProviderError(new Error('socket hang up'));
    expect(erro).toBeInstanceOf(AgentProviderError);
    expect(erro.code).toBe('upstream');
    // Sem isso, 8 falhas numa eval viram "upstream" e ninguém sabe o que aconteceu.
    expect(erro.cause).toBeTruthy();
    expect(String(erro.detail)).toContain('socket hang up');
  });
});

describe('I6/I7 — métricas que inflavam a taxa de resolução', () => {
  it('conta conversas distintas, não linhas multiplicadas pelo join de handoffs', () => {
    const q = buildConversationMetricsQuery(db, { channel: 'whatsapp', since: new Date('2026-10-01') }).toSQL();
    // handoffs tem uma linha por evento (requested/assumed/released/closed): sem distinct, uma
    // conversa escalada contava 3-4 vezes e a taxa de resolução saía alta demais.
    expect(q.sql).toMatch(/count\(distinct "conversations"\."id"\)/i);
    expect(q.sql.match(/count\(distinct/gi)?.length).toBeGreaterThanOrEqual(3);
  });

  it('o tempo até a primeira resposta é um agregado, não uma linha por conversa', () => {
    const q = buildFirstReplyMetricsQuery(db, { channel: 'whatsapp', since: new Date('2026-10-01') }).toSQL();
    // A latência é por conversa (group by dentro da subconsulta) e a média é sobre elas: o
    // select de fora precisa ser o agregado, não devolver uma linha por conversa.
    expect(q.sql).toMatch(/^select avg\(/i);
    expect(q.sql).toMatch(/from \(select/i);
    const forade = q.sql.slice(0, q.sql.indexOf('from (select'));
    expect(forade).not.toMatch(/group by/i);
  });
});
