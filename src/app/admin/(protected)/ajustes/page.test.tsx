import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AccessDeniedError extends Error {}
  return { AccessDeniedError, listWhatsappTenants: vi.fn(), readAdminWhatsappSetting: vi.fn() };
});
vi.mock('@/server/authz', () => ({ AccessDeniedError: mocks.AccessDeniedError, requireAdmin: vi.fn() }));
vi.mock('@/server/attendance/settings', () => ({ readAdminWhatsappSetting: mocks.readAdminWhatsappSetting }));
vi.mock('@/server/whatsapp/embedded-signup', () => ({ listWhatsappTenants: mocks.listWhatsappTenants }));
vi.mock('@/server/whatsapp/test-number', () => ({ TEST_TENANT_ID: 't', TEST_WEBHOOK_URL: 'u' }));
vi.mock('../atendimento/actions', () => ({}));

import SettingsPage from './page';

beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

it('acesso negado sobe em vez de virar aviso e de mostrar numeros', async () => {
  mocks.listWhatsappTenants.mockRejectedValue(new mocks.AccessDeniedError());
  mocks.readAdminWhatsappSetting.mockRejectedValue(new mocks.AccessDeniedError());
  await expect(SettingsPage()).rejects.toBeInstanceOf(mocks.AccessDeniedError);
});

it('falha comum de leitura segue como aviso, sem derrubar a tela', async () => {
  mocks.listWhatsappTenants.mockRejectedValue(new Error('banco'));
  mocks.readAdminWhatsappSetting.mockRejectedValue(new Error('banco'));
  await expect(SettingsPage()).resolves.toBeTruthy();
});
