import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhatsappTurnResult } from '@/server/agent/whatsapp-turn';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

const { recordVisitor, runTurn } = vi.hoisted(() => ({
  recordVisitor: vi.fn(async (): Promise<string | null> => 'conv-1'),
  runTurn: vi.fn(async (): Promise<WhatsappTurnResult | null> =>
    ({ status: 'resposta' as const, body: 'Claro! Moto ou carro?' })),
}));

vi.mock('@/server/agent/incoming', () => ({
  recordIncomingWhatsappMessage: recordVisitor,
  ensureWhatsappConversation: vi.fn(async () => ({ id: 'conv-1', handoffRequestedAt: null })),
  whatsappConversationToken: () => 'token',
}));
vi.mock('@/server/agent/whatsapp-turn', () => ({ runWhatsappAgentTurn: runTurn }));

import { InboundPersistenceError, processMetaWebhookPayload } from '@/server/whatsapp/webhook-handler';

const tenant = { tenantId: 't', wabaId: 'waba_999', whatsappPhoneNumberId: 'p1',
  isActive: true, accessToken: 'TOKEN' };

const payload = {
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba_999', changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: 'p1' },
    contacts: [{ wa_id: '5585999990000', profile: { name: 'Ronald' } }],
    messages: [{ id: 'wamid.1', from: '5585999990000', timestamp: '1', type: 'text',
      text: { body: 'tem moto?' } }],
  } }] }],
};

const base = {
  findTenant: async () => tenant,
  pauseOnSellerEcho: async () => undefined,
};

let logs: { nivel: string; texto: string }[];

beforeEach(() => {
  logs = [];
  recordVisitor.mockReset();
  recordVisitor.mockResolvedValue('conv-1');
  runTurn.mockReset();
  runTurn.mockResolvedValue({ status: 'resposta', body: 'Claro! Moto ou carro?' });
  for (const nivel of ['info', 'warn', 'error'] as const) {
    vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
      logs.push({ nivel, texto: args.map((a) => String(a)).join(' ') });
    });
  }
});

afterEach(() => { vi.restoreAllMocks(); });

const eventos = () => logs.map(({ texto }) => {
  const achado = texto.match(/"evento":"([^"]+)"/);
  return achado ? achado[1] : '';
}).filter(Boolean);

/**
 * Antes, todo caminho sem resposta caía num `console.info` só, com a frase "modo desativado,
 * vendedor ativo ou mensagem duplicada" — quatro causas distintas numa linha, e o teto da
 * conversa, que deixava o cliente sem ninguém, não estava nem na lista. Sem separar, não havia
 * como saber depois do fato se um cliente foi ignorado.
 */
describe('o log diz qual foi a causa', () => {
  it('distingue cada motivo de silêncio legítimo', async () => {
    for (const motivo of ['modo_desligado', 'turno_reservado', 'humano_assumiu'] as const) {
      logs = [];
      const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out' }));
      runTurn.mockResolvedValueOnce({ status: 'sem_resposta', motivo });
      const r = await processMetaWebhookPayload(payload, { ...base, sendOutbound });
      expect(eventos(), motivo).toContain(`sem_resposta_${motivo}`);
      expect(sendOutbound, motivo).not.toHaveBeenCalled();
      expect(r.falhasOperacionais, motivo).toBe(0);
    }
  });

  it('separa reentrega da Meta de silêncio do turno', async () => {
    recordVisitor.mockResolvedValueOnce(null);
    const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out' }));
    const r = await processMetaWebhookPayload(payload, { ...base, sendOutbound });
    expect(eventos()).toContain('mensagem_duplicada');
    expect(sendOutbound).not.toHaveBeenCalled();
    expect(r.falhasOperacionais).toBe(0);
  });

  it('registra o encaminhamento entregue, com o motivo real', async () => {
    runTurn.mockResolvedValueOnce({ status: 'encaminhado', body: 'Chamei um vendedor.',
      motivo: 'teto_conversa', registro: 'completo' });
    const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out' }));
    const r = await processMetaWebhookPayload(payload, { ...base, sendOutbound });
    expect(sendOutbound).toHaveBeenCalledWith(expect.objectContaining({ body: 'Chamei um vendedor.' }));
    expect(r).toMatchObject({ processedMessages: 1, encaminhamentos: 1, falhasOperacionais: 0 });
    expect(eventos()).toContain('encaminhado_teto_conversa');
  });
});

/**
 * Critério de aprovação da Fase 0: nenhum erro pode ser tratado como atendimento concluído sem
 * resposta confirmada ou encaminhamento efetivamente registrado. `falhasOperacionais` é o número
 * que precisa ser zero no ensaio real.
 */
describe('falha operacional é contada, nunca engolida', () => {
  it('encaminhamento que o banco não confirmou conta como falha operacional', async () => {
    runTurn.mockResolvedValueOnce({ status: 'encaminhado', body: 'Chamei um vendedor.',
      motivo: 'infraestrutura', registro: 'nenhum' });
    const r = await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: 'wamid.out' }),
    });
    // O cliente recebeu a frase (processedMessages 1), mas ninguém foi avisado: é incidente.
    expect(r).toMatchObject({ processedMessages: 1, falhasOperacionais: 1 });
    expect(eventos()).toContain('encaminhamento_nao_registrado');
  });

  it('encaminhamento registrado só pela rede de segurança não conta como falha', async () => {
    runTurn.mockResolvedValueOnce({ status: 'encaminhado', body: 'Chamei um vendedor.',
      motivo: 'infraestrutura', registro: 'parcial' });
    const r = await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: 'wamid.out' }),
    });
    expect(r.falhasOperacionais).toBe(0);
  });

  it('turno que estoura não derruba o webhook nem some: sinaliza e conta', async () => {
    runTurn.mockRejectedValueOnce(new Error('banco fora'));
    const onSendFailed = vi.fn(async () => false);
    const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out' }));
    const r = await processMetaWebhookPayload(payload, { ...base, sendOutbound, onSendFailed });
    expect(onSendFailed).toHaveBeenCalledWith('conv-1', expect.any(Error));
    expect(r).toMatchObject({ processedMessages: 0, falhasOperacionais: 1 });
    expect(eventos()).toContain('turno_estourou');
    expect(eventos()).toContain('cliente_sem_atendimento');
  });

  it('turno que estoura e sinalização que funciona não conta como falha', async () => {
    runTurn.mockRejectedValueOnce(new Error('banco fora'));
    const r = await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: 'wamid.out' }),
      onSendFailed: async () => true,
    });
    expect(r.falhasOperacionais).toBe(0);
  });

  it('falha de envio E falha da sinalização não estouram o webhook, mas contam', async () => {
    const onSendFailed = vi.fn(async () => { throw new Error('banco fora'); });
    const r = await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: null }), onSendFailed,
    });
    expect(r).toMatchObject({ processedMessages: 0, falhasOperacionais: 1 });
    expect(eventos()).toContain('sinalizacao_falha_envio_falhou');
    expect(eventos()).toContain('cliente_sem_atendimento');
  });

  /**
   * O único caminho em que deixar estourar é o comportamento recuperável: nada foi gravado, então
   * não há deduplicação para engolir a reentrega da Meta. Quando o banco voltar, a mensagem é
   * processada de verdade. Engolir aqui perderia a mensagem em silêncio.
   */
  it('falha ao gravar a mensagem de entrada sobe, para a Meta reentregar', async () => {
    recordVisitor.mockRejectedValueOnce(new Error('banco fora'));
    const erro = await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: 'wamid.out' }),
    }).then(() => null, (e: unknown) => e);
    expect(erro).toBeInstanceOf(InboundPersistenceError);
    expect((erro as Error).cause).toMatchObject({ message: 'banco fora' });
  });
});

/**
 * Até aqui os dois incidentes acima só existiam em `console.error`, e log de função serverless
 * não acorda ninguém. O webhook agora manda cada um a um destino humano, e o resultado do envio
 * entra no próprio log — inclusive quando não há destino configurado.
 */
describe('o incidente chega a uma pessoa', () => {
  it('cliente sem atendimento por falha de envio vira alerta com a conversa e o motivo', async () => {
    const alertOps = vi.fn(async () => 'enviado' as const);
    const r = await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: null }),
      onSendFailed: async () => false, alertOps,
    });
    expect(r.falhasOperacionais).toBe(1);
    expect(alertOps).toHaveBeenCalledWith(expect.objectContaining({
      evento: 'cliente_sem_atendimento', conversationId: 'conv-1', motivo: 'envio_falhou',
    }));
  });

  it('turno que estoura sem vendedor avisado também alerta, com motivo próprio', async () => {
    runTurn.mockRejectedValueOnce(new Error('banco fora'));
    const alertOps = vi.fn(async () => 'enviado' as const);
    await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: 'wamid.out' }),
      onSendFailed: async () => false, alertOps,
    });
    expect(alertOps).toHaveBeenCalledWith(expect.objectContaining({
      evento: 'cliente_sem_atendimento', motivo: 'turno_estourou',
    }));
  });

  it('encaminhamento não registrado alerta com o motivo do encaminhamento', async () => {
    runTurn.mockResolvedValueOnce({ status: 'encaminhado', body: 'Chamei um vendedor.',
      motivo: 'infraestrutura', registro: 'nenhum' });
    const alertOps = vi.fn(async () => 'enviado' as const);
    await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: 'wamid.out' }), alertOps,
    });
    expect(alertOps).toHaveBeenCalledWith(expect.objectContaining({
      evento: 'encaminhamento_nao_registrado', motivo: 'infraestrutura',
    }));
  });

  it('alerta que estoura não derruba o webhook nem apaga o registro do incidente', async () => {
    const alertOps = vi.fn(async () => { throw new Error('webhook de alerta fora do ar'); });
    const r = await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: null }),
      onSendFailed: async () => false, alertOps,
    });
    expect(r.falhasOperacionais).toBe(1);
    expect(eventos()).toContain('cliente_sem_atendimento');
    expect(logs.some(({ texto }) => texto.includes('"alerta":"falhou"'))).toBe(true);
  });

  it('sem destino configurado o incidente ainda é contado, e o log diz que ninguém foi avisado', async () => {
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', '');
    try {
      const r = await processMetaWebhookPayload(payload, {
        ...base, sendOutbound: async () => ({ messageId: null }), onSendFailed: async () => false,
      });
      expect(r.falhasOperacionais).toBe(1);
      expect(eventos()).toContain('alerta_sem_destino');
      expect(logs.some(({ texto }) => texto.includes('"alerta":"sem_destino"'))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/**
 * `WHATSAPP_WABA_ID` ausente fazia a guarda comparar o `entry.id` do evento com ele mesmo. O
 * atendimento continua (a assinatura HMAC e o `phone_number_id` são a barreira real), mas a
 * conferência vacuosa deixou de se passar por conferência feita.
 */
describe('guarda de WABA', () => {
  const resolverTenant = async (eventWabaId?: string) =>
    (await import('@/server/whatsapp/webhook-handler')).resolveWebhookTenant(
      'p1', async () => null, eventWabaId);

  afterEach(() => { vi.unstubAllEnvs(); });

  it('marca como não verificada a WABA que veio do próprio evento', async () => {
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'p1');
    vi.stubEnv('WHATSAPP_WABA_ID', '');
    vi.stubEnv('WHATSAPP_TOKEN', 'TOKEN');
    expect(await resolverTenant('waba_999')).toMatchObject({ wabaId: 'waba_999', wabaVerified: false });
  });

  it('marca como verificada quando WHATSAPP_WABA_ID existe', async () => {
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'p1');
    vi.stubEnv('WHATSAPP_WABA_ID', 'waba_999');
    vi.stubEnv('WHATSAPP_TOKEN', 'TOKEN');
    expect(await resolverTenant('waba_999')).toMatchObject({ wabaId: 'waba_999', wabaVerified: true });
  });

  it('WABA não conferida registra evento próprio e não cala a Dayse', async () => {
    const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out' }));
    const r = await processMetaWebhookPayload(payload, {
      ...base, findTenant: async () => ({ ...tenant, wabaVerified: false }), sendOutbound,
    });
    expect(eventos()).toContain('waba_nao_verificada');
    expect(r).toMatchObject({ processedMessages: 1, falhasOperacionais: 0 });
  });

  it('WABA conferida não gera o aviso', async () => {
    const r = await processMetaWebhookPayload(payload, {
      ...base, sendOutbound: async () => ({ messageId: 'wamid.out' }),
    });
    expect(eventos()).not.toContain('waba_nao_verificada');
    expect(r.processedMessages).toBe(1);
  });

  it('WABA de outra conta continua bloqueada, verificada ou não', async () => {
    const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out' }));
    const r = await processMetaWebhookPayload(payload, {
      ...base, findTenant: async () => ({ ...tenant, wabaId: 'waba_de_outra_loja', wabaVerified: false }),
      sendOutbound,
    });
    expect(sendOutbound).not.toHaveBeenCalled();
    expect(r.processedMessages).toBe(0);
  });
});
