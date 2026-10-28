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
  isKnowledgeOrSpecificCatalogQuery,
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
  it('trata Honda Pop oferecida como entrada como troca, sem voltar à Fazer anterior', async () => {
    for (const message of [
      'Tenho uma Honda Pop pra da de entrada. Vcs aceitam?',
      'E a Pop Honda de entrada?',
    ]) {
      const res = await answerFromPlatformKnowledge(message, mockSearchCatalog, {
        recentModelOrTitle: 'Yamaha Fazer', customerName: 'Cliente',
      });
      expect(res.text).toContain('Sim, aceitamos seu veículo como entrada');
      expect(res.text).toContain('Honda Pop');
      expect(res.text).toContain('Qual é o **ano**');
      expect(res.text).not.toContain('Yamaha Fazer');
      expect(res.text).not.toContain('Sobre financiamento');
      expect(res.cards).toHaveLength(0);
      expect(res.handoffReason).toBe('trade_in');
      expect(isKnowledgeOrSpecificCatalogQuery(message)).toBe(true);
    }
  });

  it('entende o ano enviado sozinho como continuação da avaliação da Honda Pop', async () => {
    const res = await answerFromPlatformKnowledge('2018', mockSearchCatalog, {
      recentTradeIn: 'Tenho uma Honda Pop pra dar de entrada', recentModelOrTitle: 'Yamaha Fazer',
    });
    expect(res.text).toContain('Honda Pop 2018');
    expect(res.text).toContain('quilometragem aproximada');
    expect(res.text).not.toContain('Yamaha Fazer');
    expect(res.cards).toHaveLength(0);
    expect(res.handoffReason).toBe('trade_in');
  });

  it('registra ano e quilometragem juntos como dados da Pop, sem puxar a Fazer', async () => {
    const res = await answerFromPlatformKnowledge('ano 2000 e tem 700 km rodado', mockSearchCatalog, {
      recentTradeIn: 'Tenho uma Honda Pop pra dar de entrada', recentModelOrTitle: 'Yamaha Fazer',
      customerName: 'Ronald',
    });
    expect(res.text).toContain('Honda Pop');
    expect(res.text).toContain('ano 2000');
    expect(res.text).toContain('700 km');
    expect(res.text).toContain('A equipe confere o documento, a quilometragem e o estado do veículo');
    expect(res.text).not.toContain('Yamaha Fazer');
    expect(res.cards).toHaveLength(0);
    expect(res.facts[0]?.quote).toContain('700 km');
  });

  it('retoma a pergunta sobre a Pop quando o cliente escreve apenas ????', async () => {
    const res = await answerFromPlatformKnowledge('????', mockSearchCatalog, {
      recentTradeIn: 'Tenho uma Honda Pop pra dar de entrada',
    });
    expect(res.text).toContain('aceitamos Honda Pop como entrada');
    expect(res.text).toContain('ano');
    expect(res.cards).toHaveLength(0);
    expect(res.handoffReason).toBe('trade_in');
  });

  it('prioriza a Lander publicada para viagens longas e pede dados úteis para a indicação', async () => {
    const onlyLiveBikes: typeof searchAvailableVehicles = async (input) => ({
      items: input.type === 'car' ? [] : [
        { ...staticItems.find((item) => item.model === 'Fazer')!, versionNumber: 1 },
        { ...staticItems.find((item) => item.model === 'Titan')!, versionNumber: 1 },
        { id: '00000000-0000-4000-8000-000000000099', slug: 'yamaha-lander-250-2023', type: 'motorcycle', brand: 'Yamaha', model: 'Lander 250', version: null, year: 2023, mileageKm: 23218, color: null, priceCents: 2530000, versionNumber: 1 },
      ],
      checkedAt: '2026-10-28T12:00:00.000Z',
    });
    const message = 'Estou precisando de uma moto para viagens longas';
    expect(isKnowledgeOrSpecificCatalogQuery(message)).toBe(true);
    const res = await answerFromPlatformKnowledge(message, onlyLiveBikes);
    expect(res.text).toContain('viagens longas');
    expect(res.text).toContain('Yamaha Lander 250');
    expect(res.text).toContain('garupa');
    expect(res.cards.map((card) => card.title)).toEqual(['Yamaha Lander 250']);
    expect(res.facts).toContainEqual({ field: 'purpose', quote: 'viagens longas' });
  });

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

