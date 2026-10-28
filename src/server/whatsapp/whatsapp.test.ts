import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

import {
  decryptAccessToken,
  deterministicUuidFromWaMessageId,
  encryptAccessToken,
  verifyMetaWebhookSignature,
} from './crypto';
import { completeEmbeddedSignup, type WhatsappTenantRow } from './embedded-signup';
import { formatDayseWhatsAppReply, sendWhatsAppTextMessage } from './outbound';
import { processMetaWebhookPayload, whatsappConversationToken } from './webhook-handler';

const TEST_HEX_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_APP_SECRET = 'ronaldigital-meta-secret-123';

describe('Tech Provider Meta WhatsApp Cloud API (RonalDigital ISP Platform)', () => {
  it('criptografa e descriptografa o access_token em AES-256-GCM e rejeita adulteração', () => {
    const rawToken = 'EAAGm0PX4ZCpsBAK...token_permanente_waba';
    const encrypted = encryptAccessToken(rawToken, TEST_HEX_KEY);

    expect(encrypted).not.toContain(rawToken);
    expect(encrypted.split(':')).toHaveLength(3);
    expect(decryptAccessToken(encrypted, TEST_HEX_KEY)).toBe(rawToken);

    const [iv, tag, cipher] = encrypted.split(':');
    const tampered = `${iv}:${tag}:${cipher?.slice(0, -2)}ff`;
    expect(() => decryptAccessToken(tampered, TEST_HEX_KEY)).toThrow();
  });

  it('valida obrigatoriamente a assinatura X-Hub-Signature-256 do Webhook', () => {
    const rawBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const validSig = `sha256=${createHmac('sha256', TEST_APP_SECRET).update(rawBody, 'utf8').digest('hex')}`;
    const invalidSig = `sha256=${createHmac('sha256', 'chave-errada').update(rawBody, 'utf8').digest('hex')}`;

    expect(verifyMetaWebhookSignature(rawBody, validSig, TEST_APP_SECRET)).toBe(true);
    expect(verifyMetaWebhookSignature(rawBody, invalidSig, TEST_APP_SECRET)).toBe(false);
    expect(verifyMetaWebhookSignature(rawBody, null, TEST_APP_SECRET)).toBe(false);
  });

  it('troca o code do Embedded Signup por access_token, inscreve a WABA no webhook e salva criptografado', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'EAAG_TOKEN_CLIENTE_LIBERATO' }), { status: 200 });
      }
      if (url.includes('/waba_999/subscribed_apps')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    let persistedEncryptedToken = '';
    const saved = await completeEmbeddedSignup(
      {
        tenantId: 'liberato-motos-car',
        tenantName: 'Liberato Motos Car',
        code: 'oauth_code_from_fb_login_sdk',
        wabaId: 'waba_999',
        phoneNumberId: 'phone_85996365664',
        displayPhoneNumber: '+55 85 99636-5664',
      },
      {
        appId: '172704712193909',
        appSecret: TEST_APP_SECRET,
        encryptionKeyHex: TEST_HEX_KEY,
        fetchImpl: fetchMock as unknown as typeof fetch,
        upsertTenant: async (row) => {
          persistedEncryptedToken = row.encryptedAccessToken;
          return {
            id: '11111111-1111-4111-8111-111111111111',
            tenantId: row.tenantId,
            tenantName: row.tenantName,
            wabaId: row.wabaId,
            whatsappPhoneNumberId: row.whatsappPhoneNumberId,
            coexistenceEnabled: row.coexistenceEnabled,
          };
        },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(saved.tenantId).toBe('liberato-motos-car');
    expect(saved.whatsappPhoneNumberId).toBe('phone_85996365664');
    expect(decryptAccessToken(persistedEncryptedToken, TEST_HEX_KEY)).toBe('EAAG_TOKEN_CLIENTE_LIBERATO');
  });

  it('roteia evento inbound pelo phone_number_id do tenant, chama a Dayse e envia outbound com o token do cliente', async () => {
    const encrypted = encryptAccessToken('TOKEN_SECRETO_LIBERATO', TEST_HEX_KEY);
    const fakeTenant: WhatsappTenantRow = {
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: 'liberato-motos-car',
      tenantName: 'Liberato Motos Car',
      wabaId: 'waba_999',
      whatsappPhoneNumberId: 'phone_liberato_1',
      displayPhoneNumber: '+55 85 99636-5664',
      encryptedAccessToken: encrypted,
      coexistenceEnabled: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sendOutbound = vi.fn(async () => ({ messageId: 'wamid.out.1' }));
    const pauseOnSellerEcho = vi.fn(async () => undefined);

    const result = await processMetaWebhookPayload(
      {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba_999',
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: 'phone_liberato_1' },
                  messages: [
                    {
                      id: 'wamid.HBgNNTU4NTk5OTk5OTk5ORUCABIYFDNB',
                      from: '5585988887777',
                      timestamp: '1793150000',
                      type: 'text',
                      text: { body: 'Quero ver motos disponíveis' },
                    },
                  ],
                },
              },
              {
                field: 'smb_message_echoes',
                value: {
                  metadata: { phone_number_id: 'phone_liberato_1' },
                  message_echoes: [
                    {
                      id: 'wamid.echo.1',
                      from: '5585996365664',
                      to: '5585988887777',
                      timestamp: '1793150010',
                      type: 'text',
                      text: { body: 'Oi amigo, aqui é o Liberato!' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      {
        findTenant: async (id) => (id === 'phone_liberato_1' ? fakeTenant : null),
        decryptToken: (enc) => decryptAccessToken(enc, TEST_HEX_KEY),
        pauseOnSellerEcho,
        runAgentTurn: async ({ text }) =>
          formatDayseWhatsAppReply(`Olá! Sou a Dayse. Você perguntou: ${text}`, [
            { title: 'Honda CG 160 Titan', year: 2023, priceCents: 1690000, href: '/veiculos/honda-titan' },
          ]),
        sendOutbound,
      },
    );

    expect(result).toEqual({ processedMessages: 1, pausedConversations: 1 });
    expect(sendOutbound).toHaveBeenCalledWith({
      phoneNumberId: 'phone_liberato_1',
      accessToken: 'TOKEN_SECRETO_LIBERATO',
      to: '5585988887777',
      body: expect.stringContaining('Honda CG 160 Titan'),
    });
    expect(pauseOnSellerEcho).toHaveBeenCalledWith('liberato-motos-car', '5585988887777');
  });

  it('envia mensagem via Meta Cloud API usando phone_number_id e access_token dinâmicos', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.sent.99' }] }), { status: 200 }));
    const res = await sendWhatsAppTextMessage({
      phoneNumberId: 'phone_liberato_1',
      accessToken: 'TOKEN_DINAMICO',
      to: '5585988887777',
      body: 'Olá! Aqui é a Dayse.',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(res.messageId).toBe('wamid.sent.99');
    expect(whatsappConversationToken('liberato-motos-car', '5585988887777')).toHaveLength(43);
    expect(deterministicUuidFromWaMessageId('wamid.123')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
