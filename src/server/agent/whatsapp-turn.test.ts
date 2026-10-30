import { describe, expect, it, vi } from 'vitest';
import { formatPrice } from '@/data/inventory-vehicles';
import { formatAgentWhatsAppReply } from '@/server/whatsapp/outbound';

const cartao = { id: 'v1', title: 'Honda CG 160 Start', year: 2022,
  priceCents: 1_450_000, href: '/veiculos/honda-cg-160-2022' };

// A formatação é a de `whatsapp/outbound`, compartilhada com o canal. Os casos abaixo são o
// contrato que o agente depende dela: preço verificado sempre chega, e nunca duas vezes.
describe('5.1 formatação para WhatsApp', () => {
  it('converte negrito markdown para o negrito do WhatsApp', () => {
    expect(formatAgentWhatsAppReply('Temos a **Honda CG 160 Start** disponível.', []))
      .toBe('Temos a *Honda CG 160 Start* disponível.');
  });

  it('anexa o preço verificado do cartão, porque o WhatsApp não renderiza cartão', () => {
    const saida = formatAgentWhatsAppReply('Temos a Honda CG 160 Start 2022.', [cartao]);
    // formatPrice usa o espaço não separável do Intl pt-BR, como o resto do site.
    expect(saida).toContain(formatPrice(14_500));
    expect(saida).toContain('Honda CG 160 Start');
  });

  it('não repete o preço quando a própria frase já o disse', () => {
    const saida = formatAgentWhatsAppReply(`A Honda CG 160 Start está ${formatPrice(14_500)}.`, [cartao]);
    expect(saida.match(/14\.500/g)).toHaveLength(1);
  });

  it('inclui o link do veículo no site, com domínio absoluto', () => {
    const saida = formatAgentWhatsAppReply('Temos a Honda CG 160 Start 2022.', [cartao]);
    expect(saida).toMatch(/https?:\/\/[^\s]+\/veiculos\/honda-cg-160-2022/);
  });

  it('sem cartão, devolve só o texto', () => {
    expect(formatAgentWhatsAppReply('Você procura moto ou carro?', [])).toBe('Você procura moto ou carro?');
  });
});

import { MockLanguageModelV4 } from 'ai/test';
import { runWhatsappAgentTurn, type WhatsappAgentTurnDeps } from './whatsapp-turn';

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 40, text: 40, reasoning: undefined },
};

function modeloQueResponde(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [],
    }),
  });
}

function depsDoTurno(over: Partial<WhatsappAgentTurnDeps> = {}): WhatsappAgentTurnDeps {
  return {
    model: modeloQueResponde('Claro! Você procura moto ou carro?') as unknown as WhatsappAgentTurnDeps['model'],
    readSetting: vi.fn(async () => ({ mode: 'ai' })),
    reserveTurn: vi.fn(async () => ({ id: 'conv-1' })) as never,
    releaseTurn: vi.fn(async () => {}) as never,
    listMessages: vi.fn(async () => []) as never,
    commitReply: vi.fn(async (_id: string, reply: { body: string }) => ({ id: 'msg-1', body: reply.body })) as never,
    reserveQuota: vi.fn(async () => ({ dayUtc: '2026-10-29' })) as never,
    recordTokens: vi.fn(async () => {}) as never,
    searchVehicles: vi.fn(async () => ({ items: [], checkedAt: '2026-10-29T12:00:00.000Z' })) as never,
    readVehicle: vi.fn(async () => ({ item: null, checkedAt: '2026-10-29T12:00:00.000Z' })) as never,
    ...over,
  };
}

describe('turno do agente no WhatsApp', () => {
  it('responde e grava a resposta na conversa', async () => {
    const deps = depsDoTurno();
    const body = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(body).toBe('Claro! Você procura moto ou carro?');
    expect(deps.commitReply).toHaveBeenCalled();
  });

  it('5.2 não responde quando o canal não está em modo ai', async () => {
    const deps = depsDoTurno({ readSetting: vi.fn(async () => ({ mode: 'disabled' })) });
    expect(await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps)).toBeNull();
    expect(deps.reserveTurn).not.toHaveBeenCalled();
  });

  it('5.2 não responde quando a reserva do turno não é dele', async () => {
    const deps = depsDoTurno({ reserveTurn: vi.fn(async () => null) as never });
    expect(await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps)).toBeNull();
    expect(deps.commitReply).not.toHaveBeenCalled();
  });

  it('5.2 descarta a resposta quando um vendedor assumiu durante a geração', async () => {
    const deps = depsDoTurno({ commitReply: vi.fn(async () => null) as never });
    expect(await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps)).toBeNull();
  });

  it('5.4 sem cota diária encaminha ao vendedor em vez de deixar o cliente sem resposta', async () => {
    const deps = depsDoTurno({ reserveQuota: vi.fn(async () => null) as never });
    const body = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(body).toContain('vendedor');
    expect(deps.commitReply).toHaveBeenCalledWith('conv-1',
      expect.objectContaining({ handoffReason: 'ai_suggested' }));
  });

  it('6.3 registra o consumo de tokens do dia', async () => {
    const deps = depsDoTurno();
    await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(deps.recordTokens).toHaveBeenCalledWith('2026-10-29', 120, 40);
  });

  it('libera a reserva do turno mesmo quando o provedor explode', async () => {
    const deps = depsDoTurno({
      model: new MockLanguageModelV4({
        doGenerate: async () => { throw new Error('provedor fora'); },
      }) as unknown as WhatsappAgentTurnDeps['model'],
    });
    await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(deps.releaseTurn).toHaveBeenCalledWith('conv-1');
  });

  it('não mostra ao modelo a mensagem atual duas vezes', async () => {
    const atual = 'tem CG 160?';
    const listMessages = vi.fn(async () => [
      { id: 'm0', sender: 'visitor', body: 'oi', cards: null },
      { id: 'm1', sender: 'ai', body: 'Olá! Como posso ajudar?', cards: null },
      { id: 'm2', sender: 'visitor', body: atual, cards: null },
    ]);
    const mock = modeloQueResponde('Deixa eu verificar pra você.');
    const deps = depsDoTurno({
      listMessages: listMessages as never,
      model: mock as unknown as WhatsappAgentTurnDeps['model'],
    });
    await runWhatsappAgentTurn({ conversationId: 'conv-1', message: atual }, deps);
    const enviadas = JSON.stringify(mock.doGenerateCalls[0].prompt);
    expect(enviadas.split(atual).length - 1).toBe(1);
  });
});
