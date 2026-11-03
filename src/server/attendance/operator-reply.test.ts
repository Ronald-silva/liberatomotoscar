import { beforeEach, expect, it, vi } from 'vitest';
import { conversationMessages, conversations, whatsappTenants } from '@/server/db/schema';

const test = vi.hoisted(() => ({
  conversation: {} as Record<string, unknown>,
  lastVisitor: new Date('2026-11-03T12:00:00Z') as Date | null,
  tenant: { whatsappPhoneNumberId: 'business-1', encryptedAccessToken: 'encrypted' } as Record<string, unknown> | null,
  tenantCount: 1,
  send: vi.fn(),
  inserted: [] as Record<string, unknown>[],
  failInsert: false,
}));

vi.mock('@/server/db/client', () => ({ getDb: () => ({ transaction: async (fn: (tx: unknown) => unknown) => fn({
  select: () => ({
    from(table: unknown) {
      const rows = table === conversations ? [test.conversation] : table === whatsappTenants
        ? test.tenant ? Array(test.tenantCount).fill(test.tenant) : [] : table === conversationMessages
          ? test.lastVisitor ? [{ createdAt: test.lastVisitor }] : [] : [];
      const chain = { where: () => chain, for: () => chain, orderBy: () => chain,
        limit: async () => rows };
      return chain;
    },
  }),
  insert: () => ({ values: (value: Record<string, unknown>) => ({ returning: async () => {
    if (test.failInsert) throw new Error('banco indisponível');
    test.inserted.push(value);
    return [{ id: 'm1', ...value }];
  } }) }),
  update: () => ({ set: () => ({ where: async () => [] }) }),
}) }) }));
vi.mock('@/server/whatsapp/crypto', () => ({ decryptAccessToken: () => 'token' }));
vi.mock('@/server/whatsapp/outbound', () => ({
  normalizeWhatsAppRecipient: (phone: string) => phone,
  sendWhatsAppTextMessage: test.send,
}));
vi.mock('@/server/whatsapp/test-number', () => ({ TEST_TENANT_ID: 'test' }));

import { sendOperatorReply } from './operator-reply';

const now = new Date('2026-11-03T13:00:00Z');
beforeEach(() => {
  test.conversation = { id: 'c1', status: 'open', owner: 'human', assignedTo: 'admin',
    customerPhone: '5585999990000', tenantId: 'tenant-1' };
  test.lastVisitor = new Date('2026-11-03T12:00:00Z');
  test.tenant = { whatsappPhoneNumberId: 'business-1', encryptedAccessToken: 'encrypted' };
  test.tenantCount = 1;
  test.inserted = [];
  test.failInsert = false;
  test.send.mockReset().mockResolvedValue({ messageId: 'wamid-1' });
});

it('confirma na Meta antes de gravar a resposta do vendedor', async () => {
  const result = await sendOperatorReply('c1', 'admin', 'Oi, Ana.', now);
  expect(result.delivered).toBe(true);
  expect(test.send).toHaveBeenCalledWith(expect.objectContaining({
    phoneNumberId: 'business-1', to: '5585999990000', body: 'Oi, Ana.',
  }));
  expect(test.inserted).toMatchObject([{ sender: 'human', body: 'Oi, Ana.' }]);
});

it('não registra entrega quando a Meta recusa', async () => {
  test.send.mockRejectedValue(new Error('Meta fora'));
  expect(await sendOperatorReply('c1', 'admin', 'Oi.', now)).toMatchObject({ delivered: false, message: null });
  expect(test.inserted).toHaveLength(0);
});

it('conversa antiga sem contato explica e não tenta enviar', async () => {
  test.conversation.customerPhone = null;
  const result = await sendOperatorReply('c1', 'admin', 'Oi.', now);
  expect(result.delivered).toBe(false);
  expect(result.reason).toMatch(/anterior ao registro/);
  expect(test.send).not.toHaveBeenCalled();
});

it('não escolhe um número arbitrário quando o tenant possui mais de um ativo', async () => {
  test.tenantCount = 2;
  const result = await sendOperatorReply('c1', 'admin', 'Oi.', now);
  expect(result.delivered).toBe(false);
  expect(result.reason).toMatch(/mais de um número ativo/);
  expect(test.send).not.toHaveBeenCalled();
});

it('fora das 24 horas não tenta enviar', async () => {
  test.lastVisitor = new Date('2026-11-02T12:59:59Z');
  const result = await sendOperatorReply('c1', 'admin', 'Oi.', now);
  expect(result.delivered).toBe(false);
  expect(result.reason).toMatch(/24 horas/);
  expect(test.send).not.toHaveBeenCalled();
});

it('envio aceito pela Meta e sem registro no banco pede conferência antes de repetir', async () => {
  test.failInsert = true;
  const result = await sendOperatorReply('c1', 'admin', 'Oi.', now);
  expect(result.delivered).toBe(false);
  expect(result.reason).toMatch(/Confira no celular antes de tentar novamente/);
  expect(test.send).toHaveBeenCalledTimes(1);
});
