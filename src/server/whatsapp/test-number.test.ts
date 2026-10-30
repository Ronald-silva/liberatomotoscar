import { describe, expect, it, vi } from 'vitest';
import { SITE_URL } from '@/data/store';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

import { decryptAccessToken, encryptAccessToken } from './crypto';
import type { EmbeddedSignupDeps, listWhatsappTenants } from './embedded-signup';
import { formatDayseWhatsAppReply, toWhatsAppMarkup } from './outbound';
import { activateConfiguredMetaTestNumber, activateSavedMetaTestNumber, checkMetaTestNumberStatus, registerMetaTestNumber, TEST_TENANT_ID } from './test-number';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TOKEN = `EAAG${'x'.repeat(80)}`;

describe('Formatação das respostas da Dayse para o WhatsApp', () => {
  it('converte **negrito** do site para *negrito* do WhatsApp sem sobrar asteriscos', () => {
    expect(toWhatsAppMarkup('Sim, aceitamos, **Ronald**! Endereço: **R. Elcias Lopes, 334**.'))
      .toBe('Sim, aceitamos, *Ronald*! Endereço: *R. Elcias Lopes, 334*.');
    expect(toWhatsAppMarkup('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('formata os cartões com link completo da página do veículo', () => {
    const out = formatDayseWhatsAppReply('Separei as **3 melhores**:', [
      { title: 'Honda Fan', year: 2015, priceCents: 1_099_000, href: '/veiculos/honda-fan-2015' },
    ]);
    expect(out).not.toContain('**');
    expect(out).toContain('*3 melhores*');
    expect(out).toContain('*Honda Fan* (2015)');
    expect(out).toContain(new URL('/veiculos/honda-fan-2015', SITE_URL).toString());
  });
});

describe('Registro do número de teste da Meta', () => {
  it('identifica token expirado pelo código 190 sem exibir detalhes da credencial', async () => {
    const status = await checkMetaTestNumberStatus({
      loadTenant: async () => ({ whatsappPhoneNumberId: '1234567890123', encryptedAccessToken: 'encrypted' }),
      decryptToken: () => 'TOKEN_DE_TESTE',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ error: { code: 190, message: 'token invalid' } }),
        { status: 401 })) as unknown as typeof fetch,
    });
    expect(status).toMatchObject({ ok: false, message: expect.stringContaining('expirou') });
    expect(status.message).not.toContain('TOKEN_DE_TESTE');
  });

  it('confirma o número somente quando a Meta devolve o mesmo phone number ID', async () => {
    const status = await checkMetaTestNumberStatus({
      loadTenant: async () => ({ whatsappPhoneNumberId: '1234567890123', encryptedAccessToken: 'encrypted' }),
      decryptToken: () => 'TOKEN_DE_TESTE',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ id: '1234567890123' }),
        { status: 200 })) as unknown as typeof fetch,
    });
    expect(status).toMatchObject({ ok: true, message: expect.stringContaining('Token válido') });
  });

  it('valida o token, inscreve a WABA nos webhooks e salva criptografado como tenant de teste', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/1234567890123?fields=')) {
        return new Response(JSON.stringify({ display_phone_number: '+1 555 012 3456' }), { status: 200 });
      }
      if (url.includes('/9876543210987/phone_numbers?fields=')) {
        return new Response(JSON.stringify({ data: [{ id: '1234567890123' }] }), { status: 200 });
      }
      if (url.includes('/9876543210987/subscribed_apps')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    let saved: { encryptedAccessToken: string; tenantId: string; coexistenceEnabled: boolean } | null = null;

    const result = await registerMetaTestNumber(
      { phoneNumberId: ' 1234567890123 ', wabaId: '9876543210987', accessToken: TOKEN },
      {
        encryptionKeyHex: KEY,
        fetchImpl: fetchMock as unknown as typeof fetch,
        listTenants: async () => [],
        webhookVerifyToken: 'verify-token-de-teste',
        webhookUrl: 'https://liberatomotoscar.vercel.app/api/webhooks/whatsapp',
        upsertTenant: async (row) => {
          saved = row;
          return { id: 'id', ...row };
        },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://graph.facebook.com/v21.0/9876543210987/subscribed_apps',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          override_callback_uri: 'https://liberatomotoscar.vercel.app/api/webhooks/whatsapp',
          verify_token: 'verify-token-de-teste',
        }),
      }),
    );
    expect(result.tenantId).toBe(TEST_TENANT_ID);
    expect(result.displayPhoneNumber).toBe('+1 555 012 3456');
    expect(saved!.coexistenceEnabled).toBe(false);
    expect(saved!.encryptedAccessToken).not.toContain(TOKEN);
    expect(decryptAccessToken(saved!.encryptedAccessToken, KEY)).toBe(TOKEN);
  });

  it('renova o token do número já cadastrado sem reinscrever o webhook', async () => {
    const existing = {
      id: 'id', tenantId: TEST_TENANT_ID, tenantName: 'Teste', wabaId: '9876543210987',
      whatsappPhoneNumberId: '1234567890123', displayPhoneNumber: '+1 555 012 3456',
      coexistenceEnabled: false, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    } satisfies Awaited<ReturnType<typeof listWhatsappTenants>>[number];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ display_phone_number: '+1 555 012 3456' })));
    const upsertTenant = vi.fn(async (row: Parameters<NonNullable<EmbeddedSignupDeps['upsertTenant']>>[0]) => ({
      id: 'id', ...row,
    }));
    await registerMetaTestNumber({ phoneNumberId: existing.whatsappPhoneNumberId,
      wabaId: existing.wabaId, accessToken: TOKEN }, {
      encryptionKeyHex: KEY,
      listTenants: async () => [existing],
      fetchImpl: fetchMock as unknown as typeof fetch,
      upsertTenant,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upsertTenant).toHaveBeenCalledOnce();
    expect(decryptAccessToken(upsertTenant.mock.calls[0]![0].encryptedAccessToken, KEY)).toBe(TOKEN);
  });

  it('ativa o webhook do Railway com o token salvo, mesmo quando o ambiente ainda tem o token antigo', async () => {
    vi.stubEnv('WHATSAPP_TOKEN', 'TOKEN_ANTIGO_DO_RAILWAY');
    vi.stubEnv('WHATSAPP_WEBHOOK_CALLBACK_URL', 'https://dayse.up.railway.app/api/webhooks/whatsapp');
    const existing = {
      id: 'id', tenantId: TEST_TENANT_ID, tenantName: 'Teste', wabaId: '9876543210987',
      whatsappPhoneNumberId: '1234567890123', displayPhoneNumber: '+1 555 012 3456',
      encryptedAccessToken: encryptAccessToken(TOKEN, KEY),
      coexistenceEnabled: false, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(
      init?.method === 'POST' ? { success: true } : { display_phone_number: '+1 555 012 3456' },
    )));
    const upsertTenant = vi.fn(async (row: Parameters<NonNullable<EmbeddedSignupDeps['upsertTenant']>>[0]) => ({ id: 'id', ...row }));
    try {
      await activateSavedMetaTestNumber({
        encryptionKeyHex: KEY,
        loadTenant: async () => existing,
        listTenants: async () => [existing],
        fetchImpl: fetchMock as unknown as typeof fetch,
        upsertTenant,
        webhookVerifyToken: 'verify-token',
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      for (const [, init] of fetchMock.mock.calls) {
        expect(init?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
      }
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://graph.facebook.com/v21.0/9876543210987/subscribed_apps',
        expect.objectContaining({
          body: JSON.stringify({
            override_callback_uri: 'https://dayse.up.railway.app/api/webhooks/whatsapp',
            verify_token: 'verify-token',
          }),
        }),
      );
      expect(decryptAccessToken(upsertTenant.mock.calls[0]![0].encryptedAccessToken, KEY)).toBe(TOKEN);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('ativa no Railway o token do ambiente e move o callback da WABA de teste', async () => {
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1234567890123');
    vi.stubEnv('WHATSAPP_TOKEN', TOKEN);
    vi.stubEnv('WHATSAPP_WEBHOOK_CALLBACK_URL', 'https://dayse.up.railway.app/api/webhooks/whatsapp');
    vi.stubEnv('WHATSAPP_WABA_ID', '');
    const existing = {
      id: 'id', tenantId: TEST_TENANT_ID, tenantName: 'Teste', wabaId: '9876543210987',
      whatsappPhoneNumberId: '1234567890123', displayPhoneNumber: '+1 555 012 3456',
      coexistenceEnabled: false, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    } satisfies Awaited<ReturnType<typeof listWhatsappTenants>>[number];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(
      init?.method === 'POST' ? { success: true } : { display_phone_number: '+1 555 012 3456' },
    )));
    const upsertTenant = vi.fn(async (row: Parameters<NonNullable<EmbeddedSignupDeps['upsertTenant']>>[0]) => ({ id: 'id', ...row }));
    try {
      await activateConfiguredMetaTestNumber({
        encryptionKeyHex: KEY,
        listTenants: async () => [existing],
        fetchImpl: fetchMock as unknown as typeof fetch,
        upsertTenant,
        webhookVerifyToken: 'verify-token',
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://graph.facebook.com/v21.0/9876543210987/subscribed_apps',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            override_callback_uri: 'https://dayse.up.railway.app/api/webhooks/whatsapp',
            verify_token: 'verify-token',
          }),
        }),
      );
      expect(decryptAccessToken(upsertTenant.mock.calls[0]![0].encryptedAccessToken, KEY)).toBe(TOKEN);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('não salva nada quando a Meta recusa o token', async () => {
    const upsertTenant = vi.fn();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'Error validating access token' } }), { status: 401 }),
    );
    await expect(
      registerMetaTestNumber(
        { phoneNumberId: '1234567890123', wabaId: '9876543210987', accessToken: TOKEN },
        { encryptionKeyHex: KEY, fetchImpl: fetchMock as unknown as typeof fetch, upsertTenant, listTenants: async () => [] },
      ),
    ).rejects.toThrow('HTTP 401');
    expect(upsertTenant).not.toHaveBeenCalled();
  });

  it('não registra o número se a Meta recusar o callback exclusivo da Dayse', async () => {
    const upsertTenant = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/phone_numbers?')) return new Response(JSON.stringify({ data: [{ id: '1234567890123' }] }));
      if (url.includes('/subscribed_apps') && init?.body) return new Response('{}', { status: 403 });
      if (url.includes('/subscribed_apps')) return new Response(JSON.stringify({ success: true }));
      return new Response(JSON.stringify({ display_phone_number: '+1 555 012 3456' }));
    });
    await expect(registerMetaTestNumber(
      { phoneNumberId: '1234567890123', wabaId: '9876543210987', accessToken: TOKEN },
      // O callback vai explícito: o caso em teste é a Meta recusar a inscrição, não o
      // endereço que o ambiente por acaso resolve.
      { fetchImpl: fetchMock as unknown as typeof fetch, upsertTenant, listTenants: async () => [],
        webhookVerifyToken: 'verify-token', webhookUrl: 'https://exemplo.test/api/webhooks/whatsapp' },
    )).rejects.toThrow('direcionar o webhook');
    expect(upsertTenant).not.toHaveBeenCalled();
  });

  it('rejeita campos claramente inválidos antes de chamar a Meta', async () => {
    const fetchMock = vi.fn();
    await expect(
      registerMetaTestNumber(
        { phoneNumberId: 'abc', wabaId: '9876543210987', accessToken: TOKEN },
        { fetchImpl: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toThrow('número de telefone inválida');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não inscreve a WABA quando o número não pertence a ela', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(
      JSON.stringify(String(input).includes('/phone_numbers?') ? { data: [{ id: '9999999999999' }] } : { display_phone_number: '+1 555 012 3456' }),
      { status: 200 },
    ));
    const upsertTenant = vi.fn();
    await expect(registerMetaTestNumber(
      { phoneNumberId: '1234567890123', wabaId: '9876543210987', accessToken: TOKEN },
      { fetchImpl: fetchMock as unknown as typeof fetch, upsertTenant, listTenants: async () => [] },
    )).rejects.toThrow('não pertence');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(upsertTenant).not.toHaveBeenCalled();
  });

  it('não altera uma conta real já conectada à loja', async () => {
    const fetchMock = vi.fn();
    const existing = {
      id: 'id', tenantId: 'liberato-motos-car', tenantName: 'Loja', wabaId: '9876543210987',
      whatsappPhoneNumberId: '5555555555555', displayPhoneNumber: null,
      coexistenceEnabled: true, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    } satisfies Awaited<ReturnType<typeof listWhatsappTenants>>[number];
    await expect(registerMetaTestNumber(
      { phoneNumberId: '1234567890123', wabaId: '9876543210987', accessToken: TOKEN },
      { fetchImpl: fetchMock as unknown as typeof fetch, listTenants: async () => [existing] },
    )).rejects.toThrow('já está conectado');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
