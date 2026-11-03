import { beforeEach, expect, it, vi } from 'vitest';

const test = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  inserted: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  append: vi.fn(),
}));
vi.mock('@/server/attendance/ensure-schema', () => ({ ensureAttendanceTables: async () => {} }));
vi.mock('@/server/attendance/conversation-repository', () => ({
  hashConversationToken: () => 'hash', RETENTION_NO_LEAD_DAYS: 30,
  appendVisitorMessage: test.append,
}));
vi.mock('@/server/db/client', () => ({ getDb: () => ({
  select: () => ({ from: () => ({ where: () => ({ limit: async () => test.existing ? [test.existing] : [] }) }) }),
  insert: () => ({ values: (value: Record<string, unknown>) => ({ onConflictDoNothing: () => ({ returning: async () => {
    test.inserted = value; return [{ id: 'c1', ...value }];
  } }) }) }),
  update: () => ({ set: (value: Record<string, unknown>) => ({ where: () => ({ returning: async () => {
    test.updated = value; return [{ ...test.existing, ...value }];
  } }) }) }),
}) }));

import { recordIncomingWhatsappMessage } from './incoming';

beforeEach(() => {
  test.existing = null; test.inserted = null; test.updated = null;
  test.append.mockReset().mockResolvedValue({ duplicate: false });
});

const message = { tenantId: 'tenant-1', customerWaId: '55 (85) 99999-0000', customerName: 'MARCOS ANDRADE',
  waMessageId: 'wamid.1', text: 'Oi' };

it('guarda nome, telefone e tenant ao criar conversa', async () => {
  expect(await recordIncomingWhatsappMessage(message)).toBe('c1');
  expect(test.inserted).toMatchObject({ customerName: 'Marcos andrade', customerPhone: '5585999990000', tenantId: 'tenant-1' });
});

it('atualiza nome do perfil e completa identidade de conversa antiga', async () => {
  test.existing = { id: 'c1', expiresAt: new Date(Date.now() + 86_400_000),
    customerName: 'Nome antigo', customerPhone: null, tenantId: null };
  await recordIncomingWhatsappMessage(message);
  expect(test.updated).toMatchObject({ customerName: 'Marcos andrade', customerPhone: '5585999990000', tenantId: 'tenant-1' });
});

it('não apaga nome já registrado quando a Meta deixa de enviá-lo', async () => {
  test.existing = { id: 'c1', expiresAt: new Date(Date.now() + 86_400_000),
    customerName: 'Ana', customerPhone: '5585999990000', tenantId: 'tenant-1' };
  await recordIncomingWhatsappMessage({ ...message, customerName: null });
  expect(test.updated).toBeNull();
  expect(test.append).toHaveBeenCalled();
});
