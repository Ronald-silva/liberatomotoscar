import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { MessageRow } from '@/server/attendance/conversation-repository';
import { buildAgentMessages, runAgentTurn, JANELA_DE_HISTORICO, type AgentTurnDeps } from './run';

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined } };

const historico = (n: number): MessageRow[] => Array.from({ length: n }, (_, i) => ({
  id: `m${i}`, sender: i % 2 === 0 ? 'visitor' : 'ai', body: `mensagem ${i}`, cards: null,
})) as never as MessageRow[];

describe('resposta cortada no limite de tokens', () => {
  it('tenta de novo quando o modelo estoura o orçamento sem escrever nada', async () => {
    // Em produção isto acontecia em 10% dos turnos: finishReason=length com texto vazio.
    // O cliente recebia o fallback, e a resposta boa simplesmente não chegava a existir.
    let passo = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => (passo++ === 0
        ? { content: [], finishReason: { unified: 'length' as const, raw: undefined }, usage, warnings: [] }
        : { content: [{ type: 'text' as const, text: 'Oi! Procura moto ou carro?' }],
          finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [] }),
    });
    const r = await runAgentTurn({ conversationId: 'c', message: 'oi', history: [] }, {
      model: model as unknown as AgentTurnDeps['model'],
      searchVehicles: (async () => ({ items: [], checkedAt: 'x' })) as never,
      readVehicle: (async () => ({ item: null, checkedAt: 'x' })) as never,
    });
    expect(r.fallback).toBe(false);
    expect(r.reply.body).toContain('moto ou carro');
    expect(passo).toBe(2);
  });

  it('tenta de novo também quando os passos acabam em chamada de ferramenta', async () => {
    let passo = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => (passo++ === 0
        ? { content: [], finishReason: { unified: 'tool-calls' as const, raw: undefined }, usage, warnings: [] }
        : { content: [{ type: 'text' as const, text: 'Temos sim, quer ver?' }],
          finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [] }),
    });
    const r = await runAgentTurn({ conversationId: 'c', message: 'tem moto?', history: [] }, {
      model: model as unknown as AgentTurnDeps['model'],
      searchVehicles: (async () => ({ items: [], checkedAt: 'x' })) as never,
      readVehicle: (async () => ({ item: null, checkedAt: 'x' })) as never,
    });
    expect(r.fallback).toBe(false);
    expect(passo).toBe(2);
  });

  it('desiste depois da segunda tentativa, sem deixar o cliente sem resposta', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({ content: [],
        finishReason: { unified: 'length' as const, raw: undefined }, usage, warnings: [] }),
    });
    const r = await runAgentTurn({ conversationId: 'c', message: 'oi', history: [] }, {
      model: model as unknown as AgentTurnDeps['model'],
      searchVehicles: (async () => ({ items: [], checkedAt: 'x' })) as never,
      readVehicle: (async () => ({ item: null, checkedAt: 'x' })) as never,
    });
    expect(r.fallback).toBe(true);
    expect(r.reply.body.length).toBeGreaterThan(20);
  });
});

describe('janela de histórico', () => {
  it('não manda a conversa inteira ao modelo', () => {
    // A conversa de teste em produção tinha 59 mensagens, quase todas do sistema anterior.
    // O modelo imitava aquele estilo verboso, escrevia longo e era cortado no limite.
    const messages = buildAgentMessages(historico(59), 'oi');
    expect(messages.length).toBeLessThanOrEqual(JANELA_DE_HISTORICO + 1);
  });

  it('mantém as mensagens mais recentes, que são as que importam', () => {
    const messages = buildAgentMessages(historico(59), 'oi');
    expect(JSON.stringify(messages)).toContain('mensagem 58');
    expect(JSON.stringify(messages)).not.toContain('mensagem 0"');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'oi' });
  });

  it('conversa curta passa inteira', () => {
    expect(buildAgentMessages(historico(4), 'oi')).toHaveLength(5);
  });
});
