import { describe, expect, it, vi } from 'vitest';
import { SITE_URL } from '@/data/store';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

import { decryptAccessToken } from './crypto';
import type { listWhatsappTenants } from './embedded-signup';
import { formatDayseWhatsAppReply, toWhatsAppMarkup } from './outbound';
import { registerMetaTestNumber, TEST_TENANT_ID } from './test-number';

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
        upsertTenant: async (row) => {
          saved = row;
          return { id: 'id', ...row };
        },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.tenantId).toBe(TEST_TENANT_ID);
    expect(result.displayPhoneNumber).toBe('+1 555 012 3456');
    expect(saved!.coexistenceEnabled).toBe(false);
    expect(saved!.encryptedAccessToken).not.toContain(TOKEN);
    expect(decryptAccessToken(saved!.encryptedAccessToken, KEY)).toBe(TOKEN);
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
