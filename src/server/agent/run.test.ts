import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { MessageRow } from '@/server/attendance/conversation-repository';
import { AgentProviderError } from './provider';
import { buildAgentMessages, runAgentTurn, type AgentTurnDeps } from './run';

const cgRow = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'honda-cg-160-2022', type: 'motorcycle' as const, brand: 'Honda', model: 'CG 160 Start',
  version: null, year: 2022, mileageKm: 18_400, color: 'Vermelha', priceCents: 1_450_000, versionNumber: 1,
};

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 40, text: 40, reasoning: undefined },
};

/** Modelo que responde texto puro, sem chamar ferramenta. */
function modeloQueResponde(text: string, finishReason: 'stop' | 'length' = 'stop') {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: finishReason, raw: undefined },
      usage, warnings: [],
    }),
  });
}

/** Modelo que chama buscar_veiculos no primeiro passo e responde no segundo. */
function modeloQueBusca(textoFinal: string) {
  let passo = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      passo += 1;
      if (passo === 1) {
        return {
          content: [{ type: 'tool-call' as const, toolCallId: 'c1', toolName: 'buscar_veiculos',
            input: JSON.stringify({ tipo: 'motorcycle' }) }],
          finishReason: { unified: 'tool-calls' as const, raw: undefined }, usage, warnings: [],
        };
      }
      return {
        content: [{ type: 'text' as const, text: textoFinal }],
        finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [],
      };
    },
  });
}

function depsCom(model: MockLanguageModelV4, itens = [cgRow]) {
  return {
    // O mock implementa a especificação v4, mas não o tipo do provedor OpenRouter.
    model: model as unknown as NonNullable<AgentTurnDeps['model']>,
    mock: model,
    modelId: 'teste/modelo',
    searchVehicles: vi.fn(async () => ({ items: itens, checkedAt: '2026-10-29T12:00:00.000Z' })) as never,
    readVehicle: vi.fn(async ({ id }: { id: string }) => ({
      item: itens.find((i) => i.id === id) ?? null, checkedAt: '2026-10-29T12:00:00.000Z',
    })) as never,
  };
}

const entradaBase = { conversationId: 'conv-1', message: 'Oi, tem moto aí?', history: [] as MessageRow[] };

describe('laço do agente', () => {
  it('2.2 responde uma pergunta de catálogo usando a ferramenta', async () => {
    const deps = depsCom(modeloQueBusca('Temos a Honda CG 160 Start 2022 por R$ 14.500,00. Quer ver as fotos?'));
    const r = await runAgentTurn(entradaBase, deps);
    expect(r.fallback).toBe(false);
    expect(r.reply.body).toContain('Honda CG 160 Start');
    expect(deps.searchVehicles).toHaveBeenCalled();
  });

  it('2.2 monta cartões só dos veículos que a resposta realmente cita', async () => {
    const deps = depsCom(modeloQueBusca('Temos a Honda CG 160 Start 2022 por R$ 14.500,00. Quer ver as fotos?'));
    const r = await runAgentTurn(entradaBase, deps);
    expect(r.reply.cards).toHaveLength(1);
    expect(r.reply.cards[0]).toMatchObject({ id: cgRow.id, priceCents: 1_450_000, href: '/veiculos/honda-cg-160-2022' });
  });

  it('2.2 não monta cartão quando a resposta não cita veículo nenhum', async () => {
    const deps = depsCom(modeloQueResponde('Claro! Você procura moto ou carro?'));
    const r = await runAgentTurn(entradaBase, deps);
    expect(r.reply.cards).toEqual([]);
  });

  it('2.3 monta o histórico a partir das mensagens da conversa, na ordem', () => {
    const history: MessageRow[] = [
      { sender: 'visitor', body: 'quero uma moto pra trabalhar' },
      { sender: 'ai', body: 'Temos opções. Qual seu orçamento?' },
      { sender: 'human', body: 'Aqui é o vendedor, bom dia!' },
      { sender: 'bot', body: 'mensagem automática antiga' },
    ].map((m, i) => ({ ...m, id: `m${i}` })) as never as MessageRow[];
    const messages = buildAgentMessages(history, 'uns 15 mil');
    expect(messages).toEqual([
      { role: 'user', content: 'quero uma moto pra trabalhar' },
      { role: 'assistant', content: 'Temos opções. Qual seu orçamento?' },
      { role: 'assistant', content: 'Aqui é o vendedor, bom dia!' },
      { role: 'assistant', content: 'mensagem automática antiga' },
      { role: 'user', content: 'uns 15 mil' },
    ]);
  });

  it('2.3 leva o veículo citado antes para o turno seguinte', async () => {
    const history = [
      { id: 'm0', sender: 'visitor', body: 'tem CG?', cards: null },
      { id: 'm1', sender: 'ai', body: 'Temos a Honda CG 160 Start 2022.',
        cards: [{ id: cgRow.id, title: 'Honda CG 160 Start', year: 2022,
          priceCents: 1_450_000, href: '/veiculos/honda-cg-160-2022' }] },
    ] as never as MessageRow[];
    const deps = depsCom(modeloQueResponde('Ela está com 18.400 km rodados.'));
    const r = await runAgentTurn({ conversationId: 'conv-1', message: 'quantos km ela tem?', history }, deps);
    const enviadas = deps.mock.doGenerateCalls[0].prompt;
    expect(JSON.stringify(enviadas)).toContain('Honda CG 160 Start');
    // Sem a reconferência, 18.400 seria tratado como número inventado e cairia na guarda.
    expect(r.fallback).toBe(false);
    expect(deps.readVehicle).toHaveBeenCalledWith({ id: cgRow.id });
  });

  it('2.3 veículo já vendido não volta ao turno: o agente perde o direito de falar dele', async () => {
    const history = [
      { id: 'm1', sender: 'ai', body: 'Temos a Honda CG 160 Start 2022.',
        cards: [{ id: cgRow.id, title: 'Honda CG 160 Start', year: 2022,
          priceCents: 1_450_000, href: '/veiculos/honda-cg-160-2022' }] },
    ] as never as MessageRow[];
    const deps = depsCom(modeloQueResponde('Ela está com 18.400 km rodados.'), []);
    const r = await runAgentTurn({ conversationId: 'conv-1', message: 'quantos km ela tem?', history }, deps);
    expect(r.fallback).toBe(true);
  });

  it('2.5 falha do provedor devolve mensagem honesta e chama vendedor', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => { throw new AgentProviderError('upstream'); },
    });
    const r = await runAgentTurn(entradaBase, depsCom(model));
    expect(r.fallback).toBe(true);
    expect(r.reply.handoffReason).toBe('ai_suggested');
    expect(r.reply.body.length).toBeGreaterThan(20);
    expect(r.reply.cards).toEqual([]);
  });

  it('2.5 guarda reprovada devolve fallback, nunca a saída original', async () => {
    const original = 'Essa moto sai por R$ 8.000 e seu financiamento está aprovado.';
    const r = await runAgentTurn(entradaBase, depsCom(modeloQueResponde(original)));
    expect(r.fallback).toBe(true);
    expect(r.reply.body).not.toContain('8.000');
    expect(r.reply.body).not.toContain('aprovado');
    expect(r.guard.ok).toBe(false);
  });

  it('2.5 resposta truncada pelo limite de tokens não vai ao cliente', async () => {
    const r = await runAgentTurn(entradaBase, depsCom(modeloQueResponde('Claro, me conta qual', 'length')));
    expect(r.fallback).toBe(true);
  });

  it('propaga os fatos e o handoff que as ferramentas anotaram', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        const passo = model.doGenerateCalls.length;
        if (passo === 1) {
          return {
            content: [
              { type: 'tool-call' as const, toolCallId: 'c1', toolName: 'registrar_lead',
                input: JSON.stringify({ campo: 'budget', valor: 'uns 15 mil' }) },
              { type: 'tool-call' as const, toolCallId: 'c2', toolName: 'chamar_vendedor',
                input: JSON.stringify({ motivo: 'financing' }) },
            ],
            finishReason: { unified: 'tool-calls' as const, raw: undefined }, usage, warnings: [],
          };
        }
        return {
          content: [{ type: 'text' as const, text: 'Anotei, um vendedor te explica o financiamento.' }],
          finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [],
        };
      },
    });
    const r = await runAgentTurn({ ...entradaBase, message: 'tenho uns 15 mil, dá pra financiar?' }, depsCom(model));
    expect(r.fallback).toBe(false);
    expect(r.reply.facts).toEqual([{ field: 'budget', quote: 'uns 15 mil' }]);
    expect(r.reply.handoffReason).toBe('financing');
  });

  it('reporta o consumo de tokens para a contagem diária', async () => {
    const r = await runAgentTurn(entradaBase, depsCom(modeloQueResponde('Você procura moto ou carro?')));
    expect(r.usage.inputTokens).toBeGreaterThan(0);
    expect(r.usage.outputTokens).toBeGreaterThan(0);
  });
});
