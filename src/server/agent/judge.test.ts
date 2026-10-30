import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { judgeAgentReply, type JudgeDeps } from './judge';
import type { VerifiedVehicle } from './tools';

const lander: VerifiedVehicle = {
  id: '11111111-1111-4111-8111-111111111111', titulo: 'Yamaha Lander 250', marca: 'Yamaha',
  modelo: 'Lander 250', tipo: 'motorcycle', ano: 2023, quilometragem: 23_218, cor: 'Vermelha',
  precoCentavos: 2_530_000, slug: 'lander',
};

const usage = { inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined } };

/** Modelo que devolve o veredito estruturado pedido. */
const LIMPO = { prometeValorOuAprovacao: false, ofereceVeiculoQueNaoTem: false,
  negociaDesconto: false, estimaValorDaTroca: false, avaliaSemSerPresencial: false, motivo: '' };

function juiz(veredito: Record<string, unknown>) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(veredito) }],
      finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [],
    }),
  });
}

const deps = (model: MockLanguageModelV4): JudgeDeps =>
  ({ model: model as unknown as JudgeDeps['model'], modelId: 'teste/juiz' });

describe('juiz de política', () => {
  it('aprova quando nenhuma violação é apontada', async () => {
    const v = await judgeAgentReply({
      reply: 'A Lander 250 está R$ 25.300,00. A troca é mediante avaliação presencial.',
      veiculos: [lander], customerText: 'tenho uma titan para trocar',
    }, deps(juiz(LIMPO)));
    expect(v.ok).toBe(true);
  });

  it('reprova quando aponta promessa, com o motivo em texto', async () => {
    const v = await judgeAgentReply({
      reply: 'Seu financiamento já está liberado, pode vir buscar.',
      veiculos: [lander], customerText: 'da pra financiar?',
    }, deps(juiz({ ...LIMPO, prometeValorOuAprovacao: true, motivo: 'afirma que o financiamento está liberado' })));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.violation).toBe('promessa_nao_autorizada');
      expect(v.detail).toContain('liberado');
    }
  });

  it('reprova estoque inventado e valor de troca com a violação certa', async () => {
    const estoque = await judgeAgentReply({ reply: 'Temos uma Ducati Monster aqui.', veiculos: [lander] },
      deps(juiz({ ...LIMPO, ofereceVeiculoQueNaoTem: true, motivo: 'Ducati não está na lista' })));
    expect(estoque.ok).toBe(false);
    if (!estoque.ok) expect(estoque.violation).toBe('veiculo_nao_verificado');

    const troca = await judgeAgentReply({ reply: 'Sua Titan vale uns 3 mil.', veiculos: [lander] },
      deps(juiz({ ...LIMPO, estimaValorDaTroca: true, motivo: 'estima 3 mil pela Titan do cliente' })));
    expect(troca.ok).toBe(false);
    if (!troca.ok) expect(troca.violation).toBe('promessa_nao_autorizada');
  });

  it('deixa passar quando o juiz falha: indisponibilidade dele não pode calar o agente', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => { throw new Error('juiz fora do ar'); },
    });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Precisa ser uma resposta que o juiz de fato avaliaria.
    const v = await judgeAgentReply({ reply: 'A Lander 250 está R$ 25.300,00, quer ver as fotos?',
      veiculos: [lander] }, deps(model));
    expect(v.ok).toBe(true);
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it('não paga o juiz quando não há nada a julgar', async () => {
    const model = juiz({ ...LIMPO, prometeValorOuAprovacao: true, motivo: 'nao deveria ser chamado' });
    for (const frase of ['Oi!', 'Oi! Você está procurando moto ou carro?', 'Me conta o que você precisa.']) {
      const v = await judgeAgentReply({ reply: frase, veiculos: [] }, deps(model));
      expect(v.ok, frase).toBe(true);
    }
    expect(model.doGenerateCalls, 'cumprimento não dispara chamada paga').toHaveLength(0);
  });

  it('reprova avaliação à distância, que não cita valor nenhum', async () => {
    const v = await judgeAgentReply({ reply: 'Pela foto já consigo avaliar sua moto, não precisa vir.',
      veiculos: [] }, deps(juiz({ ...LIMPO, avaliaSemSerPresencial: true, motivo: 'avalia por foto' })));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.detail).toContain('distância');
  });

  it('julga promessa curta, que o corte por tamanho deixava passar', async () => {
    const model = juiz({ ...LIMPO, prometeValorOuAprovacao: true, motivo: 'diz que está liberado' });
    const v = await judgeAgentReply({ reply: 'Seu crédito já está liberado.', veiculos: [] }, deps(model));
    expect(v.ok).toBe(false);
  });
});

describe('o juiz entra no laço depois da conferência mecânica', () => {
  it('a resposta reprovada pelo juiz não vai ao cliente', async () => {
    const { runAgentTurn } = await import('./run');
    const { MockLanguageModelV4: Mock } = await import('ai/test');
    const model = new Mock({
      doGenerate: async () => ({
        content: [{ type: 'text' as const, text: 'Sua moto vale uns três mil, pode trazer.' }],
        finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [],
      }),
    });
    const r = await runAgentTurn({ conversationId: 'c', message: 'quanto vale a minha?', history: [] }, {
      model: model as never,
      searchVehicles: (async () => ({ items: [], checkedAt: 'x' })) as never,
      readVehicle: (async () => ({ item: null, checkedAt: 'x' })) as never,
      judge: async () => ({ ok: false, violation: 'promessa_nao_autorizada', detail: 'estima valor' }),
    });
    expect(r.fallback).toBe(true);
    expect(r.reply.body).not.toContain('três mil');
  });

  it('a resposta aprovada pelo juiz chega inteira', async () => {
    const { runAgentTurn } = await import('./run');
    const { MockLanguageModelV4: Mock } = await import('ai/test');
    const texto = 'A troca é sempre com avaliação presencial na loja, não consigo adiantar valor.';
    const model = new Mock({
      doGenerate: async () => ({
        content: [{ type: 'text' as const, text: texto }],
        finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [],
      }),
    });
    const r = await runAgentTurn({ conversationId: 'c', message: 'quanto vale a minha?', history: [] }, {
      model: model as never,
      searchVehicles: (async () => ({ items: [], checkedAt: 'x' })) as never,
      readVehicle: (async () => ({ item: null, checkedAt: 'x' })) as never,
      judge: async () => ({ ok: true }),
    });
    expect(r.fallback).toBe(false);
    expect(r.reply.body).toBe(texto);
  });
});
