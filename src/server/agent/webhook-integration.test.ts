import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

// vi.mock é içado acima das declarações do módulo; vi.hoisted cria os espiões junto.
const { recordVisitorMessage, runTurn } = vi.hoisted(() => ({
  recordVisitorMessage: vi.fn(async (): Promise<string | null> => 'conv-1'),
  runTurn: vi.fn(async (): Promise<string | null> => 'Claro! Você procura moto ou carro?'),
}));

vi.mock('@/server/agent/incoming', () => ({
  recordIncomingWhatsappMessage: recordVisitorMessage,
  ensureWhatsappConversation: vi.fn(async () => ({ id: 'conv-1', handoffRequestedAt: null })),
  whatsappConversationToken: (tenantId: string, wa: string) => `token-${tenantId}-${wa}`,
}));
vi.mock('@/server/agent/whatsapp-turn', () => ({
  runWhatsappAgentTurn: runTurn,
}));

import { processMetaWebhookPayload } from '@/server/whatsapp/webhook-handler';

const tenant = {
  tenantId: 'liberato-motos-car', wabaId: 'waba_999',
  whatsappPhoneNumberId: 'phone_1', isActive: true, accessToken: 'TOKEN',
};

function payloadDeTexto(body: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba_999', changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: 'phone_1' },
      contacts: [{ wa_id: '5585999990000', profile: { name: 'Ronald' } }],
      messages: [{ id: 'wamid.1', from: '5585999990000', timestamp: '1', type: 'text', text: { body } }],
    } }] }],
  };
}

describe('2.4 webhook do WhatsApp responde com o agente', () => {
  it('persiste a mensagem do cliente, roda o agente e envia a resposta', async () => {
    recordVisitorMessage.mockClear();
    runTurn.mockClear();
    const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out.1' }));

    const r = await processMetaWebhookPayload(payloadDeTexto('tem moto aí?'), {
      findTenant: async () => tenant,
      sendOutbound,
      pauseOnSellerEcho: async () => undefined,
    });

    expect(recordVisitorMessage).toHaveBeenCalledWith(expect.objectContaining({
      customerWaId: '5585999990000', waMessageId: 'wamid.1', text: 'tem moto aí?',
    }));
    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', message: 'tem moto aí?' }));
    expect(sendOutbound).toHaveBeenCalledWith(expect.objectContaining({
      to: '5585999990000', body: 'Claro! Você procura moto ou carro?',
    }));
    expect(r.processedMessages).toBe(1);
  });

  it('mensagem duplicada não roda o agente de novo', async () => {
    recordVisitorMessage.mockClear();
    runTurn.mockClear();
    recordVisitorMessage.mockResolvedValueOnce(null);
    const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out.1' }));

    await processMetaWebhookPayload(payloadDeTexto('tem moto aí?'), {
      findTenant: async () => tenant, sendOutbound, pauseOnSellerEcho: async () => undefined,
    });

    expect(runTurn).not.toHaveBeenCalled();
    expect(sendOutbound).not.toHaveBeenCalled();
  });

  it('turno sem resposta automática não envia nada ao cliente', async () => {
    recordVisitorMessage.mockClear();
    runTurn.mockClear();
    runTurn.mockResolvedValueOnce(null);
    const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out.1' }));

    await processMetaWebhookPayload(payloadDeTexto('tem moto aí?'), {
      findTenant: async () => tenant, sendOutbound, pauseOnSellerEcho: async () => undefined,
    });

    expect(sendOutbound).not.toHaveBeenCalled();
  });
});
