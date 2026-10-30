import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

const { recordVisitor, runTurn, pausar } = vi.hoisted(() => ({
  recordVisitor: vi.fn(async (): Promise<string | null> => 'conv-1'),
  runTurn: vi.fn(async (): Promise<string | null> => 'Claro! Moto ou carro?'),
  pausar: vi.fn(async () => {}),
}));

vi.mock('@/server/agent/incoming', () => ({
  recordIncomingWhatsappMessage: recordVisitor,
  ensureWhatsappConversation: vi.fn(async () => ({ id: 'conv-1', handoffRequestedAt: null })),
  whatsappConversationToken: () => 'token',
}));
vi.mock('@/server/agent/whatsapp-turn', () => ({ runWhatsappAgentTurn: runTurn }));
vi.mock('@/server/attendance/conversation-repository', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  requestHumanTakeover: pausar,
}));

import { processMetaWebhookPayload } from '@/server/whatsapp/webhook-handler';

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

describe('I4 — a Meta recusou o envio', () => {
  it('não deixa a resposta sumir: marca a conversa para um humano', async () => {
    pausar.mockClear();
    const onSendFailed = vi.fn(async () => {});
    // Sem messageId a Meta não confirmou a entrega. Antes isso virava exceção, o webhook
    // devolvia erro, a Meta reentregava e a deduplicação engolia a retentativa: a conversa
    // ficava com uma resposta no banco que o cliente nunca recebeu.
    const r = await processMetaWebhookPayload(payload, {
      findTenant: async () => tenant,
      sendOutbound: async () => ({ messageId: null }),
      pauseOnSellerEcho: async () => undefined,
      onSendFailed,
    });
    expect(r.processedMessages).toBe(0);
    expect(onSendFailed).toHaveBeenCalledWith('conv-1', expect.anything());
  });

  it('o mesmo vale quando o envio explode', async () => {
    const onSendFailed = vi.fn(async () => {});
    await expect(processMetaWebhookPayload(payload, {
      findTenant: async () => tenant,
      sendOutbound: async () => { throw new Error('Meta fora do ar'); },
      pauseOnSellerEcho: async () => undefined,
      onSendFailed,
    })).resolves.toBeTruthy();
    expect(onSendFailed).toHaveBeenCalled();
  });
});
