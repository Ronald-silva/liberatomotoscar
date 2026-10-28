import { SITE_URL, STORE } from '@/data/store';
import { runDemoAgent, type DemoAnswer } from '@/server/ai/demo-agent';
import type { DemoSession } from '@/server/ai/demo-session';
import * as repository from './conversation-repository';
import type { AutomatedReply, ConversationRow, HandoffReason, LeadFact, MessageRow } from './conversation-repository';
import { deterministicAnswer, deterministicChoices, deterministicMenuText, handoffReasonByChoice,
  routeDeterministicText, type DeterministicChoice } from './deterministic';
import {
  answerFromPlatformKnowledge,
  hasInstitutionalQuestion,
  isKnowledgeOrSpecificCatalogQuery,
} from './knowledge';
import { recordSiteAiTokens, reserveSiteAiRequest } from './limits';
import { readSiteSetting, type AttendanceMode } from './settings';

export class SiteChatError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = 'SiteChatError';
  }
}

export type SiteChatMessage = Pick<MessageRow, 'id' | 'sender' | 'body'> & {
  cards: NonNullable<MessageRow['cards']>;
  createdAt: string;
};

export type SiteChatView = {
  mode: AttendanceMode;
  conversation: null | {
    protocol: string;
    owner: ConversationRow['owner'];
    status: ConversationRow['status'];
    handoffRequested: boolean;
    turnsLeft: number;
  };
  messages: SiteChatMessage[];
  choices: typeof deterministicChoices;
  handoffUrl: string;
};

export type SiteTurnInput = { message?: string; choice?: DeterministicChoice; clientMessageId: string };

const factLabels: Record<string, string> = {
  category: 'Categoria', model: 'Modelo', budget: 'Orçamento', payment: 'Pagamento', trade_in: 'Troca',
  timeline: 'Prazo', visit: 'Visita', negotiation: 'Negociação', purpose: 'Finalidade',
};

export const siteChatDeps = {
  readSetting: readSiteSetting,
  findByToken: repository.findConversationByToken,
  create: repository.createSiteConversation,
  appendVisitor: repository.appendVisitorMessage,
  reserveTurn: repository.reserveAutomatedTurn,
  releaseTurn: repository.releaseAutomatedTurn,
  commit: repository.commitAutomatedReply,
  readConversation: repository.readConversation,
  listMessages: repository.listConversationMessages,
  deterministic: (choice: DeterministicChoice) => deterministicAnswer(choice),
  runAgent: (session: DemoSession, message: string, signal?: AbortSignal) => runDemoAgent(session, message, undefined, signal),
  reserveAi: () => reserveSiteAiRequest(),
  recordTokens: recordSiteAiTokens,
};
export type SiteChatDeps = typeof siteChatDeps;

export function protocolOf(conversationId: string) {
  return conversationId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function siteHandoffUrl(conversation: Pick<ConversationRow, 'id' | 'facts'> | null) {
  const lines = ['Olá, vim pelo atendimento do site da Liberato Motos Car.'];
  if (conversation) {
    lines.push(`Protocolo: ${protocolOf(conversation.id)}`);
    if (conversation.facts.length) {
      lines.push(`O que informei: ${conversation.facts.map((fact) => `${factLabels[fact.field] ?? fact.field}: “${fact.quote}”`).join('; ')}.`);
    }
  }
  lines.push(SITE_URL);
  return `https://wa.me/${STORE.whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
}

function toView(mode: AttendanceMode, conversation: ConversationRow | null, messages: MessageRow[]): SiteChatView {
  return {
    mode,
    conversation: conversation ? {
      protocol: protocolOf(conversation.id),
      owner: conversation.owner,
      status: conversation.status,
      handoffRequested: Boolean(conversation.handoffRequestedAt) || conversation.owner === 'human',
      turnsLeft: Math.max(0, repository.MAX_VISITOR_TURNS - conversation.visitorTurns),
    } : null,
    messages: messages.map((message) => ({ id: message.id, sender: message.sender, body: message.body,
      cards: message.cards ?? [], createdAt: message.createdAt.toISOString() })),
    choices: deterministicChoices,
    handoffUrl: siteHandoffUrl(conversation),
  };
}

async function currentView(deps: SiteChatDeps, mode: AttendanceMode, conversationId: string) {
  const [conversation, messages] = await Promise.all([deps.readConversation(conversationId), deps.listMessages(conversationId)]);
  return toView(mode, conversation, messages);
}

/** Leitura para o widget (inclusive polling quando um vendedor assume). */
export async function getSiteChatView(token: string | null, deps: SiteChatDeps = siteChatDeps) {
  const setting = await deps.readSetting();
  const conversation = token ? await deps.findByToken(token).catch(() => null) : null;
  if (!conversation) return toView(setting.mode, null, []);
  const messages = await deps.listMessages(conversation.id).catch(() => []);
  return toView(setting.mode, conversation, messages);
}

/** Monta o histórico do agente com pares visitante → resposta automática já persistidos. */
export function buildAgentSession(conversation: ConversationRow, messages: MessageRow[]): DemoSession {
  const turns: DemoSession['turns'] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const current = messages[index];
    const next = messages[index + 1];
    if (current.sender === 'visitor' && next && (next.sender === 'ai' || next.sender === 'bot')) {
      turns.push({ user: current.body.slice(0, 1000), assistant: next.body.slice(0, 500) });
      index += 1;
    }
  }
  return {
    v: 2, sessionId: conversation.id, adminUserId: 'site', expiresAt: conversation.expiresAt.getTime(),
    handoffRequested: false, facts: conversation.facts as DemoSession['facts'], turns: turns.slice(-8),
  };
}

function aiHandoffReason(answer: DemoAnswer): HandoffReason | null {
  if (!answer.handoffRequested) return null;
  if (answer.lead.facts.some((fact) => fact.field === 'trade_in')) return 'trade_in';
  if (answer.lead.facts.some((fact) => fact.field === 'payment')) return 'financing';
  return 'ai_suggested';
}

async function choiceReply(deps: SiteChatDeps, choice: DeterministicChoice): Promise<AutomatedReply> {
  const answer = await deps.deterministic(choice);
  return {
    sender: 'bot', body: answer.text, cards: answer.cards,
    handoffReason: answer.handoffRequested ? handoffReasonByChoice[choice as keyof typeof handoffReasonByChoice] : null,
  };
}

function extractRecentModelContext(conversation: ConversationRow | null, history: MessageRow[]): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (msg?.cards && msg.cards.length > 0 && msg.cards[0]?.title) {
      return msg.cards[0].title;
    }
  }
  const modelFact = conversation?.facts?.find((f) => f.field === 'model');
  return modelFact?.quote ?? null;
}

async function smartKnowledgeOrChoiceReply(
  deps: SiteChatDeps,
  body: string,
  routed: DeterministicChoice | null,
  recentModelOrTitle: string | null = null,
): Promise<AutomatedReply> {
  if (isKnowledgeOrSpecificCatalogQuery(body)) {
    const kb = await answerFromPlatformKnowledge(body, undefined, { recentModelOrTitle });
    if (kb.matched) {
      return {
        sender: 'bot',
        body: kb.text,
        cards: kb.cards,
        facts: kb.facts.length ? kb.facts : undefined,
        handoffReason: kb.handoffReason,
      };
    }
  }
  if (routed) return choiceReply(deps, routed);
  const kbFallback = await answerFromPlatformKnowledge(body, undefined, { recentModelOrTitle });
  if (kbFallback.matched) {
    return {
      sender: 'bot',
      body: kbFallback.text,
      cards: kbFallback.cards,
      facts: kbFallback.facts.length ? kbFallback.facts : undefined,
      handoffReason: kbFallback.handoffReason,
    };
  }
  return { sender: 'bot', body: deterministicMenuText, cards: [] };
}

async function generateReply(deps: SiteChatDeps, mode: Exclude<AttendanceMode, 'disabled'>, conversation: ConversationRow,
  body: string, choice: DeterministicChoice | undefined, signal?: AbortSignal): Promise<AutomatedReply> {
  // Botões do menu nunca chamam o modelo, em nenhum modo.
  if (choice) return choiceReply(deps, choice);
  const routed = routeDeterministicText(body);
  // Pedido explícito de pessoa não gasta chamada de IA.
  if (routed === 'human') return choiceReply(deps, 'human');

  const messages = await deps.listMessages(conversation.id, 40).catch(() => []);
  const history = messages.at(-1)?.sender === 'visitor' && messages.at(-1)?.body === body ? messages.slice(0, -1) : messages;
  const recentModelOrTitle = extractRecentModelContext(conversation, history);

  if (mode === 'deterministic') {
    return smartKnowledgeOrChoiceReply(deps, body, routed, recentModelOrTitle);
  }

  const isDefaultAgent = deps.runAgent === siteChatDeps.runAgent;

  // Perguntas institucionais da plataforma (endereço, localização, telefone, horário, avaliação, venda)
  // e consultas diretas à base de conhecimento/catálogo em produção respondem com 100% de precisão.
  if (hasInstitutionalQuestion(body) || (isDefaultAgent && isKnowledgeOrSpecificCatalogQuery(body))) {
    const kb = await answerFromPlatformKnowledge(body, undefined, { recentModelOrTitle });
    if (kb.matched) {
      return {
        sender: 'ai',
        body: kb.text,
        cards: kb.cards,
        facts: kb.facts.length ? kb.facts : undefined,
        handoffReason: kb.handoffReason,
      };
    }
  }

  const reservation = await deps.reserveAi();
  if (!reservation) {
    return smartKnowledgeOrChoiceReply(deps, body, routed, recentModelOrTitle);
  }
  try {
    const answer = await deps.runAgent(buildAgentSession(conversation, history), body, signal);
    await deps.recordTokens(reservation.dayUtc, answer.usage.inputTokens, answer.usage.outputTokens)
      .catch(() => console.error('Falha ao registrar tokens do atendimento do site.'));
    return {
      sender: 'ai', body: answer.answer,
      cards: answer.cards.map(({ id, title, year, priceCents, href }) => ({ id, title, year, priceCents, href })),
      facts: answer.lead.facts as LeadFact[],
      handoffReason: aiHandoffReason(answer),
    };
  } catch (error) {
    console.warn('Provedor IA indisponível no turno do site; usando base de conhecimento da Dayse:', error instanceof Error ? error.message : 'erro');
    return smartKnowledgeOrChoiceReply(deps, body, routed, recentModelOrTitle);
  }
}

/**
 * Um turno do visitante: grava a mensagem uma vez, reserva a resposta automática por
 * compare-and-swap e só a publica se a automação ainda for dona da conversa.
 */
export async function handleSiteTurn(token: string | null, input: SiteTurnInput, deps: SiteChatDeps = siteChatDeps,
  signal?: AbortSignal): Promise<{ token: string | null; view: SiteChatView }> {
  const choice = input.choice;
  const body = choice ? deterministicChoices.find((item) => item.id === choice)!.label : input.message?.trim() ?? '';
  if (!body || body.length > 1000) throw new SiteChatError('Escreva uma mensagem de até 1.000 caracteres.', 400, 'invalid_message');

  const setting = await deps.readSetting();
  let conversation = token ? await deps.findByToken(token).catch(() => null) : null;
  // Desativado: nenhuma resposta automática. Uma conversa já assumida por vendedor continua.
  if (setting.mode === 'disabled' && conversation?.owner !== 'human') {
    throw new SiteChatError('O atendimento automático está desativado. Fale com a loja pelo WhatsApp.', 409, 'disabled');
  }
  try {
    let newToken: string | null = null;
    if (!conversation) {
      const created = await deps.create();
      conversation = created.conversation;
      newToken = created.token;
    }
    if (conversation.status === 'closed') throw new SiteChatError('Esta conversa foi encerrada. Inicie uma nova conversa.', 409, 'closed');
    if (conversation.visitorTurns >= repository.MAX_VISITOR_TURNS) {
      throw new SiteChatError('Esta conversa chegou ao limite de mensagens. Continue pelo WhatsApp.', 429, 'turn_limit');
    }

    const activeConversation = conversation;
    const appended = await deps.appendVisitor(activeConversation.id, body, input.clientMessageId);
    const finish = async () => ({ token: newToken, view: await currentView(deps, setting.mode, activeConversation.id) });
    if (appended.duplicate || activeConversation.owner === 'human' || setting.mode === 'disabled') return finish();

    const reserved = await deps.reserveTurn(activeConversation.id);
    if (!reserved) return finish();

    let reply: AutomatedReply;
    try {
      reply = await generateReply(deps, setting.mode, reserved, body, choice, signal);
    } catch (error) {
      await deps.releaseTurn(activeConversation.id).catch(() => undefined);
      throw error;
    }
    // Troca de modo vale no próximo turno, mas desativar impede qualquer nova emissão.
    const latest = await deps.readSetting();
    if (latest.mode === 'disabled') {
      await deps.releaseTurn(activeConversation.id).catch(() => undefined);
      return finish();
    }
    await deps.commit(activeConversation.id, reply);
    return finish();
  } catch (error) {
    if (error instanceof SiteChatError) throw error;
    console.warn('Persistência de conversa indisponível; respondendo em modo resiliente:', error instanceof Error ? error.message : 'erro');
    const now = new Date();
    const fallbackConv: ConversationRow = conversation ?? {
      id: '00000000-0000-4000-8000-000000000000',
      channel: 'site',
      tokenHash: '',
      owner: 'automation',
      status: 'open',
      assignedTo: null,
      facts: [],
      visitorTurns: 1,
      turnLockedUntil: null,
      handoffRequestedAt: null,
      createdAt: now,
      lastMessageAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
      closedAt: null,
      closedBy: null,
    };
    const routed = choice ?? routeDeterministicText(body);
    const reply = choice
      ? await choiceReply(deps, choice)
      : await smartKnowledgeOrChoiceReply(deps, body, routed);
    return {
      token: null,
      view: toView(setting.mode, null, [
        {
          id: input.clientMessageId,
          conversationId: fallbackConv.id,
          sender: 'visitor',
          body,
          cards: null,
          authorUserId: null,
          clientMessageId: input.clientMessageId,
          createdAt: now,
        },
        {
          id: `${input.clientMessageId}-reply`,
          conversationId: fallbackConv.id,
          sender: reply.sender,
          body: reply.body,
          cards: reply.cards,
          authorUserId: null,
          clientMessageId: null,
          createdAt: now,
        },
      ]),
    };
  }
}
