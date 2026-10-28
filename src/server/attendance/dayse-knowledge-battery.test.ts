import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

import {
  answerFromPlatformKnowledge,
  fallbackCatalogFromStatic,
} from './knowledge';
import type { ConversationRow, MessageRow } from './conversation-repository';
import { handleSiteTurn, type SiteChatDeps } from './site-chat';
import { finalizeDemoAnswer } from '@/server/ai/demo-agent';
import type { searchAvailableVehicles } from '@/server/vehicles/agent-catalog';

const staticItems = fallbackCatalogFromStatic();

const mockSearchCatalog: typeof searchAvailableVehicles = vi.fn(async (input) => {
  let items = [...staticItems];
  if (input.type) {
    items = items.filter((i) => i.type === input.type);
  }
  if (input.brand) {
    items = items.filter((i) => i.brand?.toLowerCase() === input.brand?.toLowerCase());
  }
  if (input.model) {
    items = items.filter((i) => i.model?.toLowerCase().includes(input.model!.toLowerCase()));
  }
  if (input.maxPriceCents) {
    items = items.filter((i) => (i.priceCents ?? 0) <= input.maxPriceCents!);
  }
  items.sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
  return {
    items: items.slice(0, input.limit ?? 3).map((i) => ({ ...i, versionNumber: 1 })),
    checkedAt: '2026-10-28T12:00:00.000Z',
  };
});

describe('Bateria de Testes de Inteligência e Conhecimento da Dayse', () => {
  describe('1. Conhecimento Institucional e Localização da Loja', () => {
    it('responde com precisão o endereço completo, bairro, cidade, CEP e link do Google Maps', async () => {
      const questions = [
        'Qual o endereço da loja?',
        'Onde fica a Liberato Motos Car?',
        'Fica em qual bairro e qual o CEP?',
        'Como faço para chegar aí? Manda a localização no mapa',
      ];

      for (const q of questions) {
        const res = await answerFromPlatformKnowledge(q, mockSearchCatalog);
        expect(res.matched).toBe(true);
        expect(res.text).toContain('R. Elcias Lopes, 334, loja A');
        expect(res.text).toContain('Parangaba');
        expect(res.text).toContain('Fortaleza/CE');
        expect(res.text).toContain('60421-100');
        expect(res.text).toContain('https://www.google.com/maps/search/');
      }
    });

    it('responde o telefone e WhatsApp oficial da loja', async () => {
      const res = await answerFromPlatformKnowledge('Qual o telefone ou WhatsApp de vocês?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('(85) 99636-5664');
    });

    it('orienta sobre horário de funcionamento e agendamento de visita presencial na Parangaba', async () => {
      const res = await answerFromPlatformKnowledge('Qual o horário de funcionamento? Vocês abrem no sábado?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('R. Elcias Lopes, 334, loja A');
      expect(res.text).toContain('(85) 99636-5664');
      expect(res.facts.some((f) => f.field === 'visit')).toBe(true);
    });

    it('apresenta a reputação da loja (nota 5,0 no Google), atuação e resumo do estoque ativo', async () => {
      const res = await answerFromPlatformKnowledge('A loja é confiável? Qual a avaliação de vocês no Google?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('5,0 estrelas no Google');
      expect(res.text).toContain('compra, venda e troca');
      expect(res.text).toContain('7 veículos publicados');
      expect(res.text).toContain('5 motos e 2 carros');
    });

    it('orienta cliente que deseja vender seu veículo para a loja e aciona handoff', async () => {
      const res = await answerFromPlatformKnowledge('Quero vender minha moto, vocês compram?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('compra, venda e troca');
      expect(res.handoffRequested).toBe(true);
      expect(res.handoffReason).toBe('visitor_request');
    });
  });

  describe('2. Domínio Completo do Catálogo de Veículos (Todos os 7 Anúncios)', () => {
    it('detalha a Volkswagen Saveiro Robust 2024 com preço, km, cor e motorização de fábrica', async () => {
      const res = await answerFromPlatformKnowledge(
        'Me fala sobre a Saveiro, qual o valor, km e motorização?',
        mockSearchCatalog,
      );
      expect(res.matched).toBe(true);
      expect(res.text).toContain('Volkswagen Saveiro Robust');
      expect(res.text).toContain('69.999');
      expect(res.text).toContain('56.000 km');
      expect(res.text).toContain('Branca');
      expect(res.text).toContain('EA211 1.6');
      expect(res.text).toContain('116 cv');
      expect(res.cards).toHaveLength(1);
      expect(res.cards[0]?.href).toBe('/veiculos/volkswagen-saveiro-robust-2024');
    });

    it('detalha a Fiat Strada 2016 com preço, ano, km e cor', async () => {
      const res = await answerFromPlatformKnowledge('Vocês têm Fiat Strada? Qual o preço e km?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('Fiat Strada');
      expect(res.text).toContain('67.000');
      expect(res.text).toContain('89.000 km');
      expect(res.text).toContain('Cinza-escuro');
      expect(res.cards[0]?.href).toBe('/veiculos/fiat-strada-2016');
    });

    it('detalha a Honda Pop com baixíssima quilometragem (660 km) e preço', async () => {
      const res = await answerFromPlatformKnowledge('Quantos km tem a Pop e quanto custa?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('Honda Pop');
      expect(res.text).toContain('660 km');
      expect(res.text).toContain('13.700');
      expect(res.text).toContain('Branca com banco vermelho');
      expect(res.cards[0]?.href).toBe('/veiculos/honda-pop');
    });

    it('detalha a Honda Fan 2015, Honda Titan 2013, Yamaha Fazer 2014 e Yamaha Crosser', async () => {
      const fan = await answerFromPlatformKnowledge('Qual o preço e a cor da Fan?', mockSearchCatalog);
      expect(fan.text).toContain('10.990');
      expect(fan.text).toContain('Preta');
      expect(fan.text).toContain('84.000 km');

      const titan = await answerFromPlatformKnowledge('Qual o valor e o ano da Titan?', mockSearchCatalog);
      expect(titan.text).toContain('11.500');
      expect(titan.text).toContain('2013');
      expect(titan.text).toContain('70.760 km');

      const fazer = await answerFromPlatformKnowledge('Quanto custa a Fazer?', mockSearchCatalog);
      expect(fazer.text).toContain('10.500');
      expect(fazer.text).toContain('72.000 km');

      const crosser = await answerFromPlatformKnowledge('Tem Yamaha Crosser?', mockSearchCatalog);
      expect(crosser.text).toContain('17.500');
      expect(crosser.text).toContain('Vermelha e preta');
      expect(crosser.cards[0]?.href).toBe('/veiculos/yamaha-crosser');
    });
  });

  describe('3. Filtros Inteligentes: Mais Barata, Menor Km, Marca, Orçamento e Modelo Inexistente', () => {
    it('identifica corretamente a moto mais barata do catálogo (Yamaha Fazer 2014 por R$ 10.500)', async () => {
      const res = await answerFromPlatformKnowledge('Qual a moto mais barata da loja?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('Yamaha Fazer');
      expect(res.text).toContain('10.500');
      expect(res.cards[0]?.title).toContain('Yamaha Fazer');
    });

    it('identifica corretamente a moto com menor quilometragem (Honda Pop com 660 km)', async () => {
      const res = await answerFromPlatformKnowledge('Qual a moto com menor km (menos rodada)?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('Honda Pop');
      expect(res.text).toContain('660 km');
      expect(res.cards[0]?.title).toContain('Honda Pop');
    });

    it('filtra apenas motos da marca Honda quando solicitado', async () => {
      const res = await answerFromPlatformKnowledge('Quais motos da Honda vocês têm?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.cards.length).toBe(3);
      expect(res.cards.every((c) => c.title.startsWith('Honda'))).toBe(true);
    });

    it('filtra corretamente por teto de orçamento ("motos até 12 mil")', async () => {
      const res = await answerFromPlatformKnowledge('Quais motos vocês têm até 12 mil?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.cards.length).toBe(3);
      expect(res.cards.every((c) => c.priceCents <= 1_200_000)).toBe(true);
      expect(res.text).not.toContain('Yamaha Crosser');
    });

    it('informa com transparência quando o orçamento é inferior ao menor preço e sugere a opção mais próxima', async () => {
      const res = await answerFromPlatformKnowledge('Tem moto até 5 mil?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('não temos anúncio publicado dentro de');
      expect(res.text).toContain('Yamaha Fazer');
      expect(res.text).toContain('10.500');
    });

    it('informa com honestidade quando um modelo não existe no estoque (ex: Bros ou Corolla) e sugere alternativas reais', async () => {
      const res = await answerFromPlatformKnowledge('Vocês têm uma Bros 160 disponível?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('não temos **BROS** publicado no estoque');
      expect(res.cards.length).toBeGreaterThan(0);
    });
  });

  describe('4. Perguntas Combinadas, Contexto Multi-Turno e Integração com Orquestrador (site-chat + demo-agent)', () => {
    it('responde endereço da loja E opções de veículos na mesma mensagem', async () => {
      const res = await answerFromPlatformKnowledge(
        'Onde fica o endereço da loja e quais carros vocês têm?',
        mockSearchCatalog,
      );
      expect(res.matched).toBe(true);
      expect(res.text).toContain('R. Elcias Lopes, 334, loja A');
      expect(res.text).toContain('Fiat Strada');
      expect(res.text).toContain('Volkswagen Saveiro Robust');
      expect(res.cards).toHaveLength(2);
    });

    it('não confunde o veículo oferecido na troca com o modelo procurado', async () => {
      const res = await answerFromPlatformKnowledge(
        'Quero uma moto até 14 mil e tenho uma Fan para dar na troca',
        mockSearchCatalog,
      );
      expect(res.matched).toBe(true);
      // Deve mostrar todas as motos até 14 mil (Fazer, Fan, Titan), não apenas a Fan!
      expect(res.cards.length).toBe(3);
      expect(res.handoffRequested).toBe(true);
      expect(res.handoffReason).toBe('trade_in');
    });

    it('resolve perguntas de acompanhamento ("quantos km ela tem?") usando o contexto do veículo anterior', async () => {
      const res = await answerFromPlatformKnowledge('Quantos km ela tem e qual o valor?', mockSearchCatalog, {
        recentModelOrTitle: 'Volkswagen Saveiro Robust',
      });
      expect(res.matched).toBe(true);
      expect(res.text).toContain('56.000 km');
      expect(res.text).toContain('69.999');
      expect(res.cards[0]?.href).toBe('/veiculos/volkswagen-saveiro-robust-2024');
    });

    it('responde o endereço da loja dentro do fluxo completo de handleSiteTurn no modo AI sem depender de LLM externo', async () => {
      const now = new Date('2026-10-28T12:00:00.000Z');
      const conv: ConversationRow = {
        id: '89f8cf37-e8cf-4f11-93f6-c92ecae72c71',
        channel: 'site',
        tokenHash: 'hash',
        owner: 'automation',
        status: 'open',
        assignedTo: null,
        facts: [],
        visitorTurns: 0,
        turnLockedUntil: null,
        handoffRequestedAt: null,
        createdAt: now,
        lastMessageAt: now,
        expiresAt: new Date(now.getTime() + 86_400_000),
        closedAt: null,
        closedBy: null,
      };
      const messages: MessageRow[] = [];
      const deps: SiteChatDeps = {
        readSetting: vi.fn(async () => ({
          channel: 'site' as const,
          mode: 'ai' as const,
          version: 1,
          updatedBy: null,
          updatedAt: now,
        })),
        findByToken: vi.fn(async () => conv),
        create: vi.fn(async () => ({ token: 'tok', conversation: conv })),
        appendVisitor: vi.fn(async (_id, body, clientMessageId) => {
          const m: MessageRow = {
            id: '11111111-1111-4111-8111-111111111111',
            conversationId: conv.id,
            sender: 'visitor',
            body,
            cards: null,
            authorUserId: null,
            clientMessageId,
            createdAt: now,
          };
          messages.push(m);
          return { duplicate: false as const, message: m };
        }),
        reserveTurn: vi.fn(async () => conv),
        releaseTurn: vi.fn(async () => undefined),
        commit: vi.fn(async (_id, reply) => {
          const m: MessageRow = {
            id: '22222222-2222-4222-8222-222222222222',
            conversationId: conv.id,
            sender: reply.sender,
            body: reply.body,
            cards: reply.cards.length ? reply.cards : null,
            authorUserId: null,
            clientMessageId: null,
            createdAt: now,
          };
          messages.push(m);
          return m;
        }),
        readConversation: vi.fn(async () => conv),
        listMessages: vi.fn(async () => [...messages]),
        deterministic: vi.fn(),
        runAgent: vi.fn(),
        reserveAi: vi.fn(async () => ({ dayUtc: '2026-10-28' })),
        recordTokens: vi.fn(async () => undefined),
      };

      const turn = await handleSiteTurn(
        'tok',
        { message: 'Qual o endereço da loja?', clientMessageId: '33333333-3333-4333-8333-333333333333' },
        deps,
      );

      const lastMsg = turn.view.messages.at(-1);
      expect(lastMsg?.sender).toBe('ai');
      expect(lastMsg?.body).toContain('R. Elcias Lopes, 334, loja A');
      expect(lastMsg?.body).toContain('Parangaba');
      expect(lastMsg?.body).toContain('Fortaleza/CE');
      expect(deps.runAgent).not.toHaveBeenCalled();
    });

    it('inclui o endereço oficial também no finalizeDemoAnswer caso passe pelo pipeline do LLM', async () => {
      const result = await finalizeDemoAnswer(
        {
          vehicleIds: [],
          question: 'Posso te mostrar nossas motos ou carros disponíveis?',
          stage: 'researching',
          facts: [],
          nextAction: 'ask_preference',
          wantsHuman: false,
        },
        new Set(),
        ['Qual o endereço da loja?'],
        [],
      );
      expect(result.answer).toContain('R. Elcias Lopes, 334, loja A');
      expect(result.answer).toContain('Parangaba');
      expect(result.answer).not.toContain('Não encontrei anúncio publicado');
    });

    it('responde saudação inicial se apresentando como Dayse e resumindo o estoque da loja', async () => {
      const res = await answerFromPlatformKnowledge('Bom dia!', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.isInstitutionalOnly).toBe(true);
      expect(res.text).toContain('Dayse');
      expect(res.text).toContain('Liberato Motos Car');
      expect(res.text).toContain('7 veículos publicados');
    });

    it('lista o catálogo completo quando o cliente pede para ver todos os veículos disponíveis', async () => {
      const res = await answerFromPlatformKnowledge('Quais são todos os veículos disponíveis no estoque hoje?', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('7 veículos publicados');
      expect(res.text).toContain('Yamaha Fazer');
      expect(res.text).toContain('Honda Fan');
      expect(res.text).toContain('Honda Titan');
      expect(res.text).toContain('Honda Pop');
      expect(res.text).toContain('Yamaha Crosser');
      expect(res.text).toContain('Fiat Strada');
      expect(res.text).toContain('Volkswagen Saveiro Robust');
    });

    it('compara dois modelos citados na mesma pergunta (ex: Fan e Titan, ou Saveiro e Strada)', async () => {
      const motos = await answerFromPlatformKnowledge('Qual a diferença entre a Fan e a Titan?', mockSearchCatalog);
      expect(motos.matched).toBe(true);
      expect(motos.cards).toHaveLength(2);
      expect(motos.text).toContain('Honda Fan');
      expect(motos.text).toContain('10.990');
      expect(motos.text).toContain('Honda Titan');
      expect(motos.text).toContain('11.500');

      const picapes = await answerFromPlatformKnowledge('Compare a Saveiro e a Strada', mockSearchCatalog);
      expect(picapes.matched).toBe(true);
      expect(picapes.cards).toHaveLength(2);
      expect(picapes.text).toContain('Volkswagen Saveiro Robust');
      expect(picapes.text).toContain('Fiat Strada');
    });

    it('combina consulta de veículo específico com dúvida sobre financiamento sem prometer aprovação', async () => {
      const res = await answerFromPlatformKnowledge(
        'Gostei da Saveiro Robust, vocês fazem financiamento dela?',
        mockSearchCatalog,
      );
      expect(res.matched).toBe(true);
      expect(res.text).toContain('Volkswagen Saveiro Robust');
      expect(res.text).toContain('69.999');
      expect(res.text).toContain('análise de crédito');
      expect(res.cards).toHaveLength(1);
      expect(res.handoffRequested).toBe(true);
      expect(res.handoffReason).toBe('financing');
    });

    it('acolhe envio de fotos de veículo para avaliação no WhatsApp (com ou sem legenda) e aciona vendedor', async () => {
      const res = await answerFromPlatformKnowledge(
        '[MIDIA_WHATSAPP:VISUAL] Olha as fotos do meu carro para dar na troca na Saveiro',
        mockSearchCatalog,
      );
      expect(res.matched).toBe(true);
      expect(res.text).toContain('Recebi as imagens/mídia do seu veículo');
      expect(res.text).toContain('Volkswagen Saveiro Robust');
      expect(res.cards).toHaveLength(1);
      expect(res.handoffRequested).toBe(true);
      expect(res.handoffReason).toBe('trade_in');
    });

    it('acolhe envio de áudio no WhatsApp, orienta o cliente e destaca a conversa para o consultor', async () => {
      const res = await answerFromPlatformKnowledge('[MIDIA_WHATSAPP:AUDIO]', mockSearchCatalog);
      expect(res.matched).toBe(true);
      expect(res.text).toContain('Recebi seu áudio');
      expect(res.handoffRequested).toBe(true);
      expect(res.handoffReason).toBe('visitor_request');
    });
  });
});
