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
import { runWhatsappAgentTurn, type WhatsappAgentTurnDeps, type WhatsappTurnResult } from './whatsapp-turn';

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
    flagForHuman: vi.fn(async () => ({ id: 'conv-1' })) as never,
    reserveQuota: vi.fn(async () => ({ status: 'reservado' as const, dayUtc: '2026-10-29' })) as never,
    // O limite por conversa depende do Postgres real; este teste isola o turno da IA.
    // A política fail-closed é testada separadamente em attendance/limits.test.ts.
    consumeConversationQuota: vi.fn(async () => 'liberado' as const),
    recordTokens: vi.fn(async () => {}) as never,
    recordGuardRejection: vi.fn(async () => {}) as never,
    searchVehicles: vi.fn(async () => ({ items: [], checkedAt: '2026-10-29T12:00:00.000Z' })) as never,
    readVehicle: vi.fn(async () => ({ item: null, checkedAt: '2026-10-29T12:00:00.000Z' })) as never,
    ...over,
  };
}

/** Silenciar o console mantém a saída do vitest legível nos testes que provocam falhas. */
function semRuido() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}

describe('turno do agente no WhatsApp', () => {
  it('responde e grava a resposta na conversa', async () => {
    const deps = depsDoTurno();
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toEqual({ status: 'resposta', body: 'Claro! Você procura moto ou carro?' });
    expect(deps.commitReply).toHaveBeenCalled();
  });

  it('5.2 não responde quando o canal não está em modo ai', async () => {
    const deps = depsDoTurno({ readSetting: vi.fn(async () => ({ mode: 'disabled' })) });
    expect(await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps))
      .toEqual({ status: 'sem_resposta', motivo: 'modo_desligado' });
    expect(deps.reserveTurn).not.toHaveBeenCalled();
  });

  it('modo menu legado informa indisponibilidade e encaminha sem consumir IA', async () => {
    const deps = depsDoTurno({ readSetting: vi.fn(async () => ({ mode: 'deterministic' })) });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', motivo: 'menu_legado', registro: 'completo' });
    expect(r.status !== 'sem_resposta' && r.body).toContain('vendedor');
    expect(deps.commitReply).toHaveBeenCalledWith('conv-1', expect.objectContaining({
      sender: 'bot', handoffReason: 'ai_suggested',
    }));
    expect(deps.reserveQuota).not.toHaveBeenCalled();
    expect(deps.recordTokens).not.toHaveBeenCalled();
    expect(deps.releaseTurn).toHaveBeenCalledWith('conv-1');
  });

  it('5.2 não responde quando a reserva do turno não é dele', async () => {
    const deps = depsDoTurno({ reserveTurn: vi.fn(async () => null) as never });
    expect(await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps))
      .toEqual({ status: 'sem_resposta', motivo: 'turno_reservado' });
    expect(deps.commitReply).not.toHaveBeenCalled();
  });

  it('5.2 descarta a resposta quando um vendedor assumiu durante a geração', async () => {
    const deps = depsDoTurno({ commitReply: vi.fn(async () => null) as never });
    expect(await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps))
      .toEqual({ status: 'sem_resposta', motivo: 'humano_assumiu' });
  });

  it('5.4 sem cota diária encaminha ao vendedor em vez de deixar o cliente sem resposta', async () => {
    semRuido();
    const deps = depsDoTurno({ reserveQuota: vi.fn(async () => ({ status: 'limite' as const })) as never });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', motivo: 'sem_cota_loja', registro: 'completo' });
    expect(deps.commitReply).toHaveBeenCalledWith('conv-1',
      expect.objectContaining({ handoffReason: 'ai_suggested' }));
  });

  it('6.3 registra o consumo de tokens do dia', async () => {
    const deps = depsDoTurno();
    await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(deps.recordTokens).toHaveBeenCalledWith('2026-10-29', 120, 40);
  });

  it('6.5 conta a guarda reprovada no dia, para a taxa sair do log', async () => {
    const deps = depsDoTurno({
      model: modeloQueResponde('Sai por R$ 8.000 e já está aprovado.') as unknown as WhatsappAgentTurnDeps['model'],
    });
    await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'quanto?' }, deps);
    expect(deps.recordGuardRejection).toHaveBeenCalledWith('2026-10-29');
  });

  it('não conta guarda reprovada quando a resposta passa', async () => {
    const deps = depsDoTurno();
    await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(deps.recordGuardRejection).not.toHaveBeenCalled();
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

/**
 * P0 da auditoria de 15/11/2026: o teto por conversa devolvia `null` — o cliente ficava sem
 * resposta e sem vendedor, que é exatamente o que o AGENTS.md proíbe. E como `consumeRateLimit`
 * respondia `false` tanto para "limite atingido" quanto para "banco fora", qualquer falha de
 * infraestrutura caía no mesmo silêncio.
 */
describe('nenhum limite ou falha deixa o cliente sem resposta', () => {
  it('teto da conversa encaminha ao vendedor, sem gastar cota de IA', async () => {
    semRuido();
    const deps = depsDoTurno({ consumeConversationQuota: vi.fn(async () => 'limite' as const) });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', motivo: 'teto_conversa', registro: 'completo' });
    expect(r.status !== 'sem_resposta' && r.body).toContain('vendedor');
    // O teto de custo continua de pé: nada de chamada paga depois de estourar o limite.
    expect(deps.reserveQuota).not.toHaveBeenCalled();
    expect(deps.recordTokens).not.toHaveBeenCalled();
    expect(deps.commitReply).toHaveBeenCalledWith('conv-1',
      expect.objectContaining({ sender: 'bot', handoffReason: 'ai_suggested' }));
    expect(deps.releaseTurn).toHaveBeenCalledWith('conv-1');
  });

  it('banco indisponível no teto da conversa também encaminha, e não gasta IA', async () => {
    semRuido();
    const deps = depsDoTurno({ consumeConversationQuota: vi.fn(async () => 'indisponivel' as const) });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', motivo: 'infraestrutura', registro: 'completo' });
    expect(deps.reserveQuota).not.toHaveBeenCalled();
  });

  it('banco indisponível na cota da loja encaminha como infraestrutura, não como limite', async () => {
    semRuido();
    const deps = depsDoTurno({ reserveQuota: vi.fn(async () => ({ status: 'indisponivel' as const })) as never });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', motivo: 'infraestrutura' });
    expect(deps.recordTokens).not.toHaveBeenCalled();
  });

  it('falha ao ler o modo do canal não vira "modo desligado"', async () => {
    semRuido();
    const deps = depsDoTurno({ readSetting: vi.fn(async () => { throw new Error('db fora'); }) });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', motivo: 'infraestrutura' });
    expect(deps.reserveQuota).not.toHaveBeenCalled();
  });

  it('falha ao reservar o turno encaminha em vez de silenciar', async () => {
    semRuido();
    const deps = depsDoTurno({ reserveTurn: vi.fn(async () => { throw new Error('db fora'); }) as never });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', motivo: 'infraestrutura' });
  });

  it('falha depois da reserva encaminha e libera a reserva', async () => {
    semRuido();
    const deps = depsDoTurno({ listMessages: vi.fn(async () => { throw new Error('db fora'); }) as never });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', motivo: 'infraestrutura' });
    expect(deps.releaseTurn).toHaveBeenCalledWith('conv-1');
  });

  it('falha ao liberar a reserva não engole a resposta já pronta', async () => {
    semRuido();
    const deps = depsDoTurno({ releaseTurn: vi.fn(async () => { throw new Error('db fora'); }) as never });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toEqual({ status: 'resposta', body: 'Claro! Você procura moto ou carro?' });
  });

  /**
   * Nenhum dos motivos de silêncio pode ser alcançado por limite ou por falha: esta é a
   * invariante que o critério de aprovação da Fase 0 pede, verificada por varredura.
   */
  it('varredura: limite e falha nunca produzem sem_resposta', async () => {
    semRuido();
    const cenarios: { nome: string; over: Partial<WhatsappAgentTurnDeps> }[] = [
      { nome: 'teto da conversa', over: { consumeConversationQuota: vi.fn(async () => 'limite' as const) } },
      { nome: 'teto indisponível', over: { consumeConversationQuota: vi.fn(async () => 'indisponivel' as const) } },
      { nome: 'cota da loja esgotada', over: { reserveQuota: vi.fn(async () => ({ status: 'limite' as const })) as never } },
      { nome: 'cota indisponível', over: { reserveQuota: vi.fn(async () => ({ status: 'indisponivel' as const })) as never } },
      { nome: 'modo ilegível', over: { readSetting: vi.fn(async () => { throw new Error('db'); }) } },
      { nome: 'reserva ilegível', over: { reserveTurn: vi.fn(async () => { throw new Error('db'); }) as never } },
      { nome: 'histórico ilegível', over: { listMessages: vi.fn(async () => { throw new Error('db'); }) as never } },
      { nome: 'contador ilegível', over: { recordTokens: vi.fn(async () => { throw new Error('db'); }) as never } },
      { nome: 'modo legado no banco', over: { readSetting: vi.fn(async () => ({ mode: 'deterministic' })) } },
    ];
    for (const { nome, over } of cenarios) {
      const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, depsDoTurno(over));
      expect(r.status, nome).not.toBe('sem_resposta');
      expect(r.status !== 'sem_resposta' && r.body.length > 0, nome).toBe(true);
    }
  });
});

/**
 * O encaminhamento passou a ESCREVER no banco e a mandar mensagem ao cliente. Isso o põe sob a
 * mesma exigência de concorrência da resposta normal: duas mensagens simultâneas do mesmo número
 * não podem gerar duas frases iguais. É por isso que a reserva do turno agora vem antes do teto.
 */
describe('concorrência no encaminhamento', () => {
  it('duas mensagens simultâneas acima do teto geram um encaminhamento só', async () => {
    semRuido();
    // A reserva real é um compare-and-swap no Postgres: só a primeira execução a leva.
    let reservas = 0;
    const reserveTurn = vi.fn(async () => (reservas++ === 0 ? { id: 'conv-1' } : null));
    const commitReply = vi.fn(async (_id: string, reply: { body: string }) => ({ id: 'm', body: reply.body }));
    const compartilhadas = {
      reserveTurn: reserveTurn as never,
      commitReply: commitReply as never,
      consumeConversationQuota: vi.fn(async () => 'limite' as const),
    };

    const [a, b] = await Promise.all([
      runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'oi' }, depsDoTurno(compartilhadas)),
      runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'tem CG?' }, depsDoTurno(compartilhadas)),
    ]);

    const entregues = [a, b].filter((r) => r.status === 'encaminhado');
    expect(entregues, 'só uma execução escreve e responde').toHaveLength(1);
    expect([a, b].filter((r) => r.status === 'sem_resposta' && r.motivo === 'turno_reservado'))
      .toHaveLength(1);
    expect(commitReply, 'uma gravação só, uma mensagem só ao cliente').toHaveBeenCalledTimes(1);
  });

  it('a conversa que perde a reserva não gasta cota de IA nem consulta o teto', async () => {
    const deps = depsDoTurno({ reserveTurn: vi.fn(async () => null) as never });
    await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'oi' }, deps);
    expect(deps.consumeConversationQuota).not.toHaveBeenCalled();
    expect(deps.reserveQuota).not.toHaveBeenCalled();
  });
});

/**
 * Requisito 7 da Fase 0: com o banco ruim, não presumir que o encaminhamento ficou gravado.
 * O registro tem dois níveis, e o resultado diz qual deles venceu.
 */
describe('registro verificável do encaminhamento', () => {
  const soTeto = { consumeConversationQuota: vi.fn(async () => 'limite' as const) };

  it('quando o histórico não aceita a mensagem, a sinalização do vendedor ainda vale', async () => {
    semRuido();
    const flagForHuman = vi.fn(async () => ({ id: 'conv-1' }));
    const deps = depsDoTurno({
      ...soTeto,
      commitReply: vi.fn(async () => { throw new Error('insert fora'); }) as never,
      flagForHuman: flagForHuman as never,
    });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', registro: 'parcial' });
    expect(flagForHuman).toHaveBeenCalledWith('conv-1', 'ai_suggested');
  });

  it('quando nada é gravado, o resultado admite que ninguém foi avisado', async () => {
    semRuido();
    const deps = depsDoTurno({
      ...soTeto,
      commitReply: vi.fn(async () => { throw new Error('banco fora'); }) as never,
      flagForHuman: vi.fn(async () => { throw new Error('banco fora'); }) as never,
    });
    const r = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toMatchObject({ status: 'encaminhado', registro: 'nenhum' });
    // Mesmo sem registro, o cliente recebe a frase: ele é a única parte que não pode ficar no escuro.
    expect(r.status !== 'sem_resposta' && r.body).toContain('vendedor');
  });

  it('conversa fechada ou já tomada por um humano não recebe encaminhamento automático', async () => {
    semRuido();
    const deps = depsDoTurno({ ...soTeto, commitReply: vi.fn(async () => null) as never });
    const r: WhatsappTurnResult = await runWhatsappAgentTurn({ conversationId: 'conv-1', message: 'Oi' }, deps);
    expect(r).toEqual({ status: 'sem_resposta', motivo: 'humano_assumiu' });
  });
});
