import { describe, expect, it, vi } from 'vitest';
import { finalizeDemoAnswer, normalizeAgentSearchInput, UnsafeDemoAnswerError } from './demo-agent';
import type { AgentOutput } from './demo-contracts';
import type { getVehicleDetails } from '@/server/vehicles/agent-catalog';

const id = '0f6ad37b-47cb-4946-92e8-723dd2c90bd8';
const output: AgentOutput = {
  vehicleIds: [id], reply: 'Entendi. Vou te ajudar a avançar nessa escolha.',
  question: 'Você pretende comprar em breve?', stage: 'requirements_defined',
  facts: [
    { field: 'budget', quote: 'até 18 mil' },
    { field: 'trade_in', quote: 'uma Fan para dar na troca' },
    { field: 'payment', quote: 'financiamento aprovado' },
  ],
  nextAction: 'human_trade_in', wantsHuman: false,
};

const published = {
  id, slug: 'honda-titan-2013', type: 'motorcycle' as const, brand: 'Honda', model: 'Titan', version: null,
  year: 2013, mileageKm: 30000, color: 'Vermelha', priceCents: 1150000, versionNumber: 4,
};

describe('resposta validada do agente', () => {
  it('omite marcadores genéricos do modelo sem alterar filtros específicos', () => {
    expect(normalizeAgentSearchInput({ type: 'motorcycle', brand: 'any', model: 'qualquer', maxPriceCents: 1_800_000 }, ['Quero moto até 18 mil']))
      .toEqual({ type: 'motorcycle', brand: undefined, model: undefined, maxPriceCents: 1_800_000 });
    expect(normalizeAgentSearchInput({ brand: 'Honda', model: 'Titan' }, ['Quero uma Honda Titan']))
      .toEqual({ brand: 'Honda', model: 'Titan' });
    expect(normalizeAgentSearchInput({ brand: 'Honda', model: 'CG 160' }, ['Quero uma moto para trabalhar']))
      .toEqual({ brand: undefined, model: undefined });
    expect(normalizeAgentSearchInput({ model: 'Fan' }, ['Quero uma moto até 18 mil', 'Tenho uma Fan para dar na troca']))
      .toEqual({ model: undefined });
  });
  it('bloqueia IDs que o modelo não recebeu das ferramentas', async () => {
    await expect(finalizeDemoAnswer(output, new Set(), ['até 18 mil'], [], '2026-10-26T00:00:00Z'))
      .rejects.toThrow(UnsafeDemoAnswerError);
  });

  it('consulta novamente e não mostra veículo que saiu do estoque', async () => {
    const readDetails = vi.fn(async () => ({ item: null, checkedAt: '2026-10-26T00:00:00Z' })) as unknown as typeof getVehicleDetails;
    const result = await finalizeDemoAnswer(output, new Set([id]), ['até 18 mil e tenho uma Fan para dar na troca'], [], undefined, readDetails);
    expect(result.cards).toEqual([]);
    expect(result.answer).not.toContain('Titan');
    expect(result.lead.facts.map((fact) => fact.field)).toEqual(['budget', 'trade_in']);
  });

  it('prepara passagem humana para troca sem repetir anúncios no encaminhamento', async () => {
    const readDetails = vi.fn(async () => ({ item: published, checkedAt: '2026-10-26T00:00:00Z' })) as unknown as typeof getVehicleDetails;
    const result = await finalizeDemoAnswer(output, new Set([id]), ['Quero uma moto até 18 mil e tenho uma Fan para dar na troca'], [], undefined, readDetails);
    expect(result.cards).toEqual([]);
    expect(readDetails).not.toHaveBeenCalled();
    expect(result.handoffUrl).toContain('wa.me/');
    expect(result.answer).not.toContain('financiamento aprovado');
    expect(result.lead.stage).toBe('ready_for_seller');
  });

  it('respeita pedido de humano e não mostra opções automáticas', async () => {
    const result = await finalizeDemoAnswer({ ...output, wantsHuman: true, question: null, nextAction: 'human_requested' },
      new Set([id]), ['Quero falar com um vendedor'], []);
    expect(result.cards).toEqual([]);
    expect(result.handoffRequested).toBe(true);
    expect(result.answer).toContain('vendedor');
  });

  it('marca requisitos definidos sem depender do estágio incorreto do modelo', async () => {
    const readDetails = vi.fn(async () => ({ item: published, checkedAt: '2026-10-26T00:00:00Z' })) as unknown as typeof getVehicleDetails;
    const result = await finalizeDemoAnswer({ ...output, facts: [{ field: 'budget', quote: 'até 18 mil' },
      { field: 'purpose', quote: 'para trabalhar' }], stage: 'researching', nextAction: 'ask_budget', wantsHuman: false },
    new Set([id]), ['Quero uma moto para trabalhar até 18 mil'], [], undefined, readDetails);
    expect(result.lead.stage).toBe('requirements_defined');
    expect(result.lead.nextAction).toContain('Apresentar opções');
  });

  it('mantém fatos verificados de turnos anteriores no resumo de troca', async () => {
    const result = await finalizeDemoAnswer({ ...output, vehicleIds: [], facts: [{ field: 'trade_in', quote: 'Fan para dar na troca' }],
      stage: 'researching', nextAction: 'ask_preference' }, new Set(),
    ['Quero moto até 18 mil', 'Tenho uma Fan para dar na troca'], [], undefined, undefined,
    [{ field: 'budget', quote: 'até 18 mil' }]);
    expect(result.lead.facts.map((fact) => fact.field)).toEqual(['budget', 'trade_in']);
    expect(result.lead.stage).toBe('ready_for_seller');
    expect(new URL(result.handoffUrl!).searchParams.get('text')).toContain('Orçamento: “até 18 mil”');
  });

  it('não encaminha nem oferece veículos por causa de fatos antigos em pergunta fora do assunto', async () => {
    const readDetails = vi.fn(async () => ({ item: published, checkedAt: '2026-10-26T00:00:00Z' })) as unknown as typeof getVehicleDetails;
    const result = await finalizeDemoAnswer({ ...output, reply: 'Doce de coco não temos por aqui 😄 Quer continuar falando da Strada?',
      facts: [], nextAction: 'human_trade_in', wantsHuman: true },
    new Set([id]), ['Tenho uma Fan para dar na troca', 'Doce de coco?'], [], undefined, readDetails,
    [{ field: 'trade_in', quote: 'Fan para dar na troca' }]);
    expect(result.handoffRequested).toBe(false);
    expect(result.cards).toEqual([]);
    expect(result.answer).toContain('Doce de coco');
    expect(result.answer).not.toContain('Você pretende comprar em breve?');
    expect(readDetails).not.toHaveBeenCalled();
  });
});
