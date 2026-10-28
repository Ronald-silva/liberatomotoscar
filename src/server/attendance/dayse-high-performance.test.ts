import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

import {
  answerFromPlatformKnowledge,
  detectMessageIntents,
  extractCustomerFirstName,
  extractEntryCents,
  fallbackCatalogFromStatic,
  hasInstitutionalQuestion,
} from './knowledge';
import { processMetaWebhookPayload } from '@/server/whatsapp/webhook-handler';
import type { WhatsappTenantRow } from '@/server/whatsapp/embedded-signup';
import type { searchAvailableVehicles } from '@/server/vehicles/agent-catalog';

const staticItems = fallbackCatalogFromStatic();

const mockSearchCatalog: typeof searchAvailableVehicles = vi.fn(async (input) => {
  let items = [...staticItems];
  if (input.type) items = items.filter((i) => i.type === input.type);
  items.sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
  return {
    items: items.slice(0, input.limit ?? 3).map((i) => ({ ...i, versionNumber: 1 })),
    checkedAt: '2026-10-28T12:00:00.000Z',
  };
});

describe('Dayse Alta Performance — conversa real do teste com a IA concorrente', () => {
  it('"Boa tarde" (WhatsApp Ronald): espelha o período e chama o cliente pelo nome do perfil', async () => {
    const res = await answerFromPlatformKnowledge('Boa tarde', mockSearchCatalog, { customerName: 'Ronald Silva' });
    expect(res.text.startsWith('Boa tarde, **Ronald**!')).toBe(true);
    expect(res.text).toContain('Dayse');
    expect(res.text).not.toContain('retirada');
  });

  it('"Preciso de uma cama box": blinda o domínio sem perguntar tamanho nem falar em retirada na loja', async () => {
    const res = await answerFromPlatformKnowledge('Preciso de uma cama box', mockSearchCatalog, { customerName: 'Ronald' });
    expect(res.matched).toBe(true);
    expect(res.text).toContain('cama box');
    expect(res.text).toContain('Ronald');
    expect(res.text).toContain('motos e carros seminovos');
    expect(res.text).not.toMatch(/tamanho|retirada|revenda/i);
    expect(res.cards).toHaveLength(0);
    expect(res.handoffRequested).toBe(false);
    expect(hasInstitutionalQuestion('Preciso de uma cama box')).toBe(true);
  });

  it('"Moto para rodar na Uber com melhor custo-benefício": consultoria com argumento, preço, km e links das 150cc', async () => {
    const res = await answerFromPlatformKnowledge(
      'Ok. Quais opções vcs tem de uma moto para rodar na uber que tenha o melhor custo benefício?',
      mockSearchCatalog,
      { customerName: 'Ronald' },
    );
    expect(res.matched).toBe(true);
    expect(res.text).toContain('Uber Moto');
    expect(res.text).toContain('35 a 40 km/l');
    expect(res.text).toContain('Ronald');
    expect(res.cards.length).toBeGreaterThanOrEqual(2);
    // Prioriza as 150cc Street (Fazer, Fan, Titan) e traz preço + km
    expect(res.cards.every((c) => /Fazer|Fan|Titan/.test(c.title))).toBe(true);
    expect(res.cards.every((c) => c.href.startsWith('/veiculos/'))).toBe(true);
    expect(res.text).toMatch(/R\$\s?1\d\.\d{3}/);
    expect(res.text).toMatch(/\d{2}\.\d{3} km/);
    expect(res.facts.some((f) => f.field === 'purpose' && f.quote.includes('Uber'))).toBe(true);
    // Termina com pergunta de avanço comercial
    expect(res.text).toContain('à vista, financiar ou colocar alguma moto como entrada');
  });

  it('"Aceitam uma moto que tenho como entrada?": confirma, endereço correto com mapa e pede modelo/ano sem listar estoque', async () => {
    const res = await answerFromPlatformKnowledge('Aceitam uma moto que tenho como entrada ?', mockSearchCatalog, {
      customerName: 'Ronald',
    });
    expect(res.matched).toBe(true);
    expect(res.text).toContain('Sim, aceitamos seu veículo como entrada, **Ronald**');
    expect(res.text).toContain('R. Elcias Lopes, 334, loja A');
    expect(res.text).toContain('Parangaba');
    expect(res.text).toContain('https://www.google.com/maps/search/');
    expect(res.text).toContain('qual é o modelo e o ano');
    expect(res.text).not.toContain('Livino de Carvalho');
    expect(res.cards).toHaveLength(0);
    expect(res.handoffReason).toBe('trade_in');
  });

  it('quando o cliente já informa a moto da troca com ano, avança a negociação em vez de repetir a pergunta', async () => {
    const res = await answerFromPlatformKnowledge('Tenho uma Fan 2018 para dar na troca', mockSearchCatalog);
    expect(res.text).toContain('Já registrei os dados do seu veículo');
    expect(res.text).not.toContain('qual é o modelo e o ano');
    expect(res.facts.some((f) => f.field === 'trade_in' && f.quote.includes('Fan 2018'))).toBe(true);
  });
});

describe('Dayse Alta Performance — financiamento, nome e WhatsApp', () => {
  it('extrai entrada em mil e em reais', () => {
    expect(extractEntryCents('dando 3 mil de entrada')).toBe(300_000);
    expect(extractEntryCents('entrada de R$ 4.000')).toBe(400_000);
    expect(extractEntryCents('quero financiar')).toBeNull();
  });

  it('faz pré-cálculo orientativo do saldo a financiar a partir da entrada informada, sem prometer aprovação', async () => {
    const res = await answerFromPlatformKnowledge('Dá pra financiar a Crosser dando 3 mil de entrada?', mockSearchCatalog);
    expect(res.text).toContain('Pré-cálculo orientativo');
    expect(res.text).toContain('17.500');
    expect(res.text).toContain('3.000');
    expect(res.text).toContain('14.500');
    expect(res.text).toContain('análise de crédito');
    expect(res.handoffReason).toBe('financing');
  });

  it('reconhece o nome do cliente quando ele se apresenta no chat do site', () => {
    expect(extractCustomerFirstName('Oi, meu nome é ronald')).toBe('Ronald');
    expect(extractCustomerFirstName('sou o Carlos e quero uma moto')).toBe('Carlos');
    expect(extractCustomerFirstName('quero uma moto')).toBeNull();
    expect(extractCustomerFirstName('qualquer', '🏍️ João Pedro')).toBe('João');
  });

  it('não confunde "moto que tenho como entrada" com busca por moto', () => {
    const intents = detectMessageIntents('Aceitam uma moto que tenho como entrada ?');
    expect(intents.asksTradeIn).toBe(true);
    expect(intents.wantsMoto).toBe(false);
    expect(intents.asksFinancing).toBe(false);
  });

  it('repassa o nome do perfil do WhatsApp (contacts[].profile.name) para a Dayse', async () => {
    const runAgentTurn = vi.fn(async () => 'ok');
    const tenant = {
      tenantId: 'liberato-motos-car',
      whatsappPhoneNumberId: 'phone_1',
      encryptedAccessToken: 'enc',
      isActive: true,
    } as unknown as WhatsappTenantRow;

    await processMetaWebhookPayload(
      {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'phone_1' },
              contacts: [{ wa_id: '5585988887777', profile: { name: 'Ronald' } }],
              messages: [{ id: 'wamid.1', from: '5585988887777', timestamp: '1', type: 'text', text: { body: 'Boa tarde' } }],
            },
          }],
        }],
      },
      {
        findTenant: async () => tenant,
        decryptToken: () => 'TOKEN',
        runAgentTurn,
        sendOutbound: async () => ({ messageId: 'x' }),
      },
    );

    expect(runAgentTurn).toHaveBeenCalledWith(expect.objectContaining({ customerName: 'Ronald', text: 'Boa tarde' }));
  });
});

