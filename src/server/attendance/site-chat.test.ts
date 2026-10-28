import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

import type { AutomatedReply, ConversationRow, MessageRow } from './conversation-repository';
import { handoffPausesAutomation } from './conversation-repository';
import { answerFromPlatformKnowledge, fallbackCatalogFromStatic } from './knowledge';
import type { searchAvailableVehicles } from '@/server/vehicles/agent-catalog';
import {
  buildAgentSession,
  getSiteChatView,
  handleSiteTurn,
  SiteChatError,
  type SiteChatDeps,
} from './site-chat';

const now = new Date('2026-10-27T20:00:00.000Z');
const catalogItems = fallbackCatalogFromStatic();
const searchFixtureCatalog: typeof searchAvailableVehicles = async (input) => ({
  items: catalogItems.filter((item) => !input.type || item.type === input.type)
    .slice(0, input.limit ?? 3).map((item) => ({ ...item, versionNumber: 1 })),
  checkedAt: now.toISOString(),
});
const baseConversation: ConversationRow = {
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

function makeMessage(partial: Partial<MessageRow> & Pick<MessageRow, 'sender' | 'body'>): MessageRow {
  return {
    id: '1ef8cf37-e8cf-4f11-93f6-c92ecae72c71',
    conversationId: baseConversation.id,
    sender: partial.sender,
    body: partial.body,
    cards: partial.cards ?? null,
    authorUserId: partial.authorUserId ?? null,
    clientMessageId: partial.clientMessageId ?? null,
    createdAt: partial.createdAt ?? now,
  };
}

function makeDeps(overrides: Partial<SiteChatDeps> = {}): SiteChatDeps {
  let storedConversation: ConversationRow = { ...baseConversation };
  const storedMessages: MessageRow[] = [];

  return {
    readSetting: vi.fn(async () => ({
      channel: 'site' as const,
      mode: 'deterministic' as const,
      version: 1,
      updatedBy: null,
      updatedAt: now,
    })),
    findByToken: vi.fn(async () => storedConversation),
    create: vi.fn(async () => ({ token: 'new-token-123', conversation: storedConversation })),
    appendVisitor: vi.fn(async (_id, body, clientMessageId) => {
      const msg = makeMessage({ sender: 'visitor', body, clientMessageId });
      storedMessages.push(msg);
      storedConversation = { ...storedConversation, visitorTurns: storedConversation.visitorTurns + 1 };
      return { duplicate: false as const, message: msg };
    }),
    reserveTurn: vi.fn(async () => storedConversation),
    releaseTurn: vi.fn(async () => undefined),
    commit: vi.fn(async (_id: string, reply: AutomatedReply) => {
      const msg = makeMessage({
        sender: reply.sender,
        body: reply.body,
        cards: reply.cards.length ? reply.cards : null,
      });
      storedMessages.push(msg);
      if (reply.handoffReason) {
        storedConversation = { ...storedConversation,
          owner: handoffPausesAutomation(reply.handoffReason) ? 'human' : 'automation',
          handoffRequestedAt: now };
      }
      const incomingFacts = reply.facts;
      if (incomingFacts) {
        storedConversation = { ...storedConversation, facts: [
          ...storedConversation.facts.filter((old) => !incomingFacts.some((next) => next.field === old.field)),
          ...incomingFacts,
        ].slice(-7) };
      }
      return msg;
    }),
    readConversation: vi.fn(async () => storedConversation),
    listMessages: vi.fn(async () => [...storedMessages]),
    deterministic: vi.fn(async (choice) => ({
      text: `Resposta determinística: ${choice}`,
      cards: choice === 'motorcycles'
        ? [{ id: 'v1', title: 'Honda Titan', year: 2022, priceCents: 1450000, href: '/veiculos/honda-titan' }]
        : [],
      checkedAt: now.toISOString(),
      handoffRequested: choice === 'human' || choice === 'financing' || choice === 'trade_in',
      handoffUrl: 'https://wa.me/5585999999999',
    })),
    knowledge: vi.fn((body, context) => answerFromPlatformKnowledge(body, searchFixtureCatalog, context)),
    runAgent: vi.fn(async () => ({
      answer: 'Temos a Honda Titan publicada no estoque.',
      cards: [{
        id: 'v1',
        slug: 'honda-titan',
        type: 'motorcycle' as const,
        title: 'Honda Titan',
        year: 2022,
        mileageKm: 12000,
        color: 'Vermelha',
        priceCents: 1450000,
        href: '/veiculos/honda-titan',
      }],
      handoffRequested: false,
      handoffUrl: null,
      lead: {
        stage: 'requirements_defined' as const,
        facts: [{ field: 'category' as const, quote: 'moto para trabalhar' }],
        nextAction: 'Mostrar opções',
      },
      checkedAt: now.toISOString(),
      model: 'deepseek/deepseek-v4-pro-0813',
      usage: { inputTokens: 400, outputTokens: 80 },
    })),
    reserveAi: vi.fn(async () => ({ dayUtc: '2026-10-27' })),
    recordTokens: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('orquestração de atendimento do site (P3)', () => {
  it('bloqueia início automático quando o modo está disabled, sem chamar bot nem IA', async () => {
    const deps = makeDeps({
      readSetting: vi.fn(async () => ({
        channel: 'site' as const,
        mode: 'disabled' as const,
        version: 1,
        updatedBy: null,
        updatedAt: now,
      })),
      findByToken: vi.fn(async () => null),
    });

    await expect(
      handleSiteTurn(null, { message: 'Oi', clientMessageId: '11111111-1111-4111-8111-111111111111' }, deps),
    ).rejects.toMatchObject({ status: 409, code: 'disabled' } satisfies Partial<SiteChatError>);
    expect(deps.deterministic).not.toHaveBeenCalled();
    expect(deps.runAgent).not.toHaveBeenCalled();
  });

  it('responde no modo deterministic sem chamar o modelo de IA', async () => {
    const deps = makeDeps();
    const result = await handleSiteTurn(
      'token',
      { message: 'Quero ver motos', clientMessageId: '11111111-1111-4111-8111-111111111111' },
      deps,
    );

    expect(deps.deterministic).toHaveBeenCalledWith('motorcycles');
    expect(deps.runAgent).not.toHaveBeenCalled();
    expect(result.view.messages).toHaveLength(2);
    expect(result.view.messages[1]?.sender).toBe('bot');
    expect(result.view.messages[1]?.cards).toHaveLength(1);
  });

  it('usa o agente no modo ai, registra tokens e preserva fatos literais do comprador', async () => {
    const deps = makeDeps({
      readSetting: vi.fn(async () => ({
        channel: 'site' as const,
        mode: 'ai' as const,
        version: 2,
        updatedBy: null,
        updatedAt: now,
      })),
    });

    const result = await handleSiteTurn(
      'token',
      { message: 'Procuro moto para trabalhar', clientMessageId: '11111111-1111-4111-8111-111111111111' },
      deps,
    );

    expect(deps.reserveAi).toHaveBeenCalledOnce();
    expect(deps.runAgent).toHaveBeenCalledOnce();
    expect(deps.recordTokens).toHaveBeenCalledWith('2026-10-27', 400, 80);
    expect(result.view.messages.at(-1)?.sender).toBe('ai');
    expect(result.view.handoffUrl).toContain(encodeURIComponent('Categoria: “moto para trabalhar”'));
  });

  it('encaminha pedido explícito de vendedor no modo ai sem gastar chamada ao LLM', async () => {
    const deps = makeDeps({
      readSetting: vi.fn(async () => ({
        channel: 'site' as const,
        mode: 'ai' as const,
        version: 2,
        updatedBy: null,
        updatedAt: now,
      })),
    });

    const result = await handleSiteTurn(
      'token',
      { message: 'Quero falar com um vendedor agora', clientMessageId: '11111111-1111-4111-8111-111111111111' },
      deps,
    );

    expect(deps.runAgent).not.toHaveBeenCalled();
    expect(deps.reserveAi).not.toHaveBeenCalled();
    expect(result.view.conversation?.owner).toBe('human');
    expect(result.view.conversation?.handoffRequested).toBe(true);
  });

  it('mantém a Dayse ativa após solicitar avaliação de troca até um vendedor assumir', async () => {
    const deps = makeDeps();
    const first = await handleSiteTurn('token', {
      message: 'Tenho uma Honda Pop pra dar de entrada', clientMessageId: '11111111-1111-4111-8111-111111111111',
    }, deps);
    expect(first.view.conversation).toMatchObject({ owner: 'automation', handoffRequested: true });
    const second = await handleSiteTurn('token', {
      message: '2018', clientMessageId: '22222222-2222-4222-8222-222222222222',
    }, deps);
    expect(second.view.messages).toHaveLength(4);
    expect(second.view.messages.at(-1)?.sender).toBe('bot');
    expect(second.view.messages.at(-1)?.body).toContain('Honda Pop 2018');
    expect(second.view.conversation?.owner).toBe('automation');
    expect(handoffPausesAutomation('visitor_request')).toBe(true);
    expect(handoffPausesAutomation('financing')).toBe(false);
  });

  it('sustenta a conversa inteira de cama box, viagem, Pop na entrada e ano com quilometragem', async () => {
    const deps = makeDeps({
      readSetting: vi.fn(async () => ({ channel: 'site' as const, mode: 'ai' as const,
        version: 1, updatedBy: null, updatedAt: now })),
      reserveAi: vi.fn(async () => null),
    });
    const messages = [
      'Boa tarde',
      'Preciso de uma cama box',
      'Estou precisando de uma moto para viagens longas',
      'Tenho uma Honda Pop pra dar de entrada. Vcs aceitam?',
      'ano 2000 e tem 700 km rodado',
    ];
    const replies = [];
    for (const [index, message] of messages.entries()) {
      replies.push(await handleSiteTurn('token', {
        message, clientMessageId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
        customerName: 'Ronald',
      }, deps));
    }
    expect(replies[1]?.view.messages.at(-1)?.body).toContain('cama box');
    expect(replies[2]?.view.messages.at(-1)?.body).toContain('viagens longas');
    expect(replies[3]?.view.conversation).toMatchObject({ owner: 'automation', handoffRequested: true });
    const last = replies[4]!.view;
    expect(last.messages.at(-1)?.body).toContain('Honda Pop');
    expect(last.messages.at(-1)?.body).toContain('ano 2000');
    expect(last.messages.at(-1)?.body).toContain('700 km');
    expect(last.messages.at(-1)?.body).not.toContain('Yamaha Fazer');
    expect(last.messages.at(-1)?.cards).toHaveLength(0);
    const stored = await deps.readConversation(baseConversation.id);
    expect(stored?.facts).toContainEqual({ field: 'purpose', quote: 'viagens longas' });
  });

  it('suspende respostas automáticas quando a conversa pertence a um vendedor humano', async () => {
    const humanConv: ConversationRow = { ...baseConversation, owner: 'human', assignedTo: 'seller-1' };
    const deps = makeDeps({
      findByToken: vi.fn(async () => humanConv),
      readConversation: vi.fn(async () => humanConv),
    });

    const result = await handleSiteTurn(
      'token',
      { message: 'Posso ir hoje à tarde?', clientMessageId: '11111111-1111-4111-8111-111111111111' },
      deps,
    );

    expect(deps.appendVisitor).toHaveBeenCalledOnce();
    expect(deps.reserveTurn).not.toHaveBeenCalled();
    expect(deps.deterministic).not.toHaveBeenCalled();
    expect(deps.runAgent).not.toHaveBeenCalled();
    expect(result.view.messages).toHaveLength(1);
  });

  it('descarta emissão automática se o canal for desativado durante o processamento do turno', async () => {
    let calls = 0;
    const deps = makeDeps({
      readSetting: vi.fn(async () => {
        calls += 1;
        return {
          channel: 'site' as const,
          mode: calls === 1 ? ('ai' as const) : ('disabled' as const),
          version: calls,
          updatedBy: null,
          updatedAt: now,
        };
      }),
    });

    await handleSiteTurn(
      'token',
      { message: 'Tem carro automático?', clientMessageId: '11111111-1111-4111-8111-111111111111' },
      deps,
    );

    expect(deps.releaseTurn).toHaveBeenCalledWith(baseConversation.id);
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('não duplica resposta quando o mesmo clientMessageId é reenviado', async () => {
    const deps = makeDeps({
      appendVisitor: vi.fn(async () => ({ duplicate: true as const, message: null })),
    });

    await handleSiteTurn(
      'token',
      { message: 'Oi', clientMessageId: '11111111-1111-4111-8111-111111111111' },
      deps,
    );

    expect(deps.reserveTurn).not.toHaveBeenCalled();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('monta a sessão do agente com pares visitante e resposta já persistidos', () => {
    const session = buildAgentSession(baseConversation, [
      makeMessage({ sender: 'visitor', body: 'Quero uma moto' }),
      makeMessage({ sender: 'bot', body: 'Temos opções disponíveis.' }),
    ]);
    expect(session.turns).toEqual([{ user: 'Quero uma moto', assistant: 'Temos opções disponíveis.' }]);
  });

  it('devolve visão vazia quando ainda não há token de conversa', async () => {
    const deps = makeDeps();
    const view = await getSiteChatView(null, deps);
    expect(view.conversation).toBeNull();
    expect(view.messages).toEqual([]);
  });
});
