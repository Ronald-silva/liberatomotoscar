import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { attendanceRateLimits, conversationMessages, conversations, handoffs } from '@/server/db/schema';

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof conversationMessages.$inferSelect;
export type MessageCard = NonNullable<MessageRow['cards']>[number];
export type LeadFact = ConversationRow['facts'][number];
export type HandoffReason = (typeof handoffs.$inferInsert)['reason'];

const DAY_MS = 24 * 60 * 60 * 1000;
// Hipóteses de retenção do plano P3, ainda sujeitas à decisão da loja.
export const RETENTION_NO_LEAD_DAYS = 30;
export const RETENTION_LEAD_DAYS = 180;
export const MAX_VISITOR_TURNS = 20;
export const TURN_LOCK_MS = 45_000;

export function hashConversationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function newConversationToken() {
  return randomBytes(32).toString('base64url');
}

function retentionFrom(now: Date, lead: boolean) {
  return new Date(now.getTime() + (lead ? RETENTION_LEAD_DAYS : RETENTION_NO_LEAD_DAYS) * DAY_MS);
}

export async function createSiteConversation(now = new Date()) {
  const token = newConversationToken();
  const [row] = await getDb().insert(conversations).values({
    channel: 'site', tokenHash: hashConversationToken(token),
    createdAt: now, lastMessageAt: now, expiresAt: retentionFrom(now, false),
  }).returning();
  return { token, conversation: row };
}

export async function findConversationByToken(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await getDb().select().from(conversations)
    .where(and(eq(conversations.tokenHash, hashConversationToken(token)), gt(conversations.expiresAt, now))).limit(1);
  return row ?? null;
}

export async function listConversationMessages(conversationId: string, limit = 60) {
  const rows = await getDb().select().from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(sql`${conversationMessages.createdAt} DESC`, sql`${conversationMessages.id} DESC`).limit(limit);
  return rows.reverse();
}

/** Grava a mensagem do visitante uma única vez por `clientMessageId`. */
export async function appendVisitorMessage(conversationId: string, body: string, clientMessageId: string, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [message] = await tx.insert(conversationMessages).values({
      conversationId, sender: 'visitor', body, clientMessageId, createdAt: now,
    }).onConflictDoNothing().returning();
    if (!message) return { duplicate: true as const, message: null };
    await tx.update(conversations).set({
      visitorTurns: sql`${conversations.visitorTurns} + 1`, lastMessageAt: now,
      // Conversa com pedido de contato mantém o prazo maior já definido.
      expiresAt: sql`greatest(${conversations.expiresAt}, ${retentionFrom(now, false)})`,
    }).where(eq(conversations.id, conversationId));
    return { duplicate: false as const, message };
  });
}

/**
 * Reserva o direito de emitir a próxima resposta automática. Só um turno vence:
 * a condição exige automação como dona, conversa aberta e nenhuma reserva válida.
 */
export async function reserveAutomatedTurn(conversationId: string, now = new Date()) {
  const [row] = await getDb().update(conversations)
    .set({ turnLockedUntil: new Date(now.getTime() + TURN_LOCK_MS) })
    .where(and(eq(conversations.id, conversationId), eq(conversations.owner, 'automation'),
      eq(conversations.status, 'open'),
      or(isNull(conversations.turnLockedUntil), lt(conversations.turnLockedUntil, now))))
    .returning();
  return row ?? null;
}

export async function releaseAutomatedTurn(conversationId: string) {
  await getDb().update(conversations).set({ turnLockedUntil: null }).where(eq(conversations.id, conversationId));
}

export type AutomatedReply = {
  sender: 'bot' | 'ai';
  body: string;
  cards: MessageCard[];
  facts?: LeadFact[];
  handoffReason?: HandoffReason | null;
};

/**
 * Confirma a resposta reservada. Se um vendedor assumiu ou a conversa foi encerrada
 * durante a geração, a resposta é descartada: o humano tem precedência.
 */
export async function commitAutomatedReply(conversationId: string, reply: AutomatedReply, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(conversations)
      .where(eq(conversations.id, conversationId)).for('update').limit(1);
    if (!current || current.owner !== 'automation' || current.status !== 'open') {
      if (current) await tx.update(conversations).set({ turnLockedUntil: null }).where(eq(conversations.id, conversationId));
      return null;
    }
    const [message] = await tx.insert(conversationMessages).values({
      conversationId, sender: reply.sender, body: reply.body.slice(0, 2000),
      cards: reply.cards.length ? reply.cards : null, createdAt: now,
    }).returning();
    const handoff = Boolean(reply.handoffReason);
    await tx.update(conversations).set({
      turnLockedUntil: null, lastMessageAt: now,
      ...(reply.facts ? { facts: reply.facts.slice(-7) } : {}),
      ...(handoff ? { owner: 'human' as const, handoffRequestedAt: now, expiresAt: retentionFrom(now, true) } : {}),
    }).where(eq(conversations.id, conversationId));
    if (handoff) {
      await tx.insert(handoffs).values({ conversationId, event: 'requested', reason: reply.handoffReason!, occurredAt: now });
    }
    return message;
  });
}

export async function readConversation(conversationId: string) {
  const [row] = await getDb().select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  return row ?? null;
}

export class ConversationStateError extends Error {
  constructor(message: string) { super(message); this.name = 'ConversationStateError'; }
}

/** Operações do vendedor. A autorização (`requireAdmin`) fica na camada que chama. */
export async function assumeConversationAs(conversationId: string, actorUserId: string, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(conversations)
      .where(eq(conversations.id, conversationId)).for('update').limit(1);
    if (!current) throw new ConversationStateError('Conversa não encontrada.');
    if (current.status !== 'open') throw new ConversationStateError('A conversa já foi encerrada.');
    if (current.owner === 'human' && current.assignedTo && current.assignedTo !== actorUserId) {
      throw new ConversationStateError('Outro vendedor já assumiu esta conversa.');
    }
    // Assumir cancela qualquer reserva de turno: resposta automática em curso será descartada.
    const [row] = await tx.update(conversations).set({ owner: 'human', assignedTo: actorUserId, turnLockedUntil: null,
      expiresAt: sql`greatest(${conversations.expiresAt}, ${retentionFrom(now, true)})` })
      .where(eq(conversations.id, conversationId)).returning();
    await tx.insert(handoffs).values({ conversationId, event: 'assumed', reason: 'operator', actorUserId, occurredAt: now });
    return row;
  });
}

export async function releaseConversationAs(conversationId: string, actorUserId: string, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(conversations)
      .where(eq(conversations.id, conversationId)).for('update').limit(1);
    if (!current) throw new ConversationStateError('Conversa não encontrada.');
    if (current.status !== 'open') throw new ConversationStateError('A conversa já foi encerrada.');
    if (current.owner !== 'human') return current;
    const [row] = await tx.update(conversations).set({ owner: 'automation', assignedTo: null, handoffRequestedAt: null })
      .where(eq(conversations.id, conversationId)).returning();
    await tx.insert(handoffs).values({ conversationId, event: 'released', reason: 'operator', actorUserId, occurredAt: now });
    return row;
  });
}

export async function closeConversationAs(conversationId: string, actorUserId: string, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(conversations)
      .where(eq(conversations.id, conversationId)).for('update').limit(1);
    if (!current) throw new ConversationStateError('Conversa não encontrada.');
    if (current.status === 'closed') return current;
    const [row] = await tx.update(conversations).set({ status: 'closed', closedAt: now, closedBy: actorUserId, turnLockedUntil: null })
      .where(eq(conversations.id, conversationId)).returning();
    await tx.insert(handoffs).values({ conversationId, event: 'closed', reason: 'operator', actorUserId, occurredAt: now });
    return row;
  });
}

export async function appendHumanReplyAs(conversationId: string, actorUserId: string, body: string, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(conversations)
      .where(eq(conversations.id, conversationId)).for('update').limit(1);
    if (!current) throw new ConversationStateError('Conversa não encontrada.');
    if (current.status !== 'open') throw new ConversationStateError('A conversa já foi encerrada.');
    if (current.owner !== 'human' || current.assignedTo !== actorUserId) {
      throw new ConversationStateError('Assuma a conversa antes de responder.');
    }
    const [message] = await tx.insert(conversationMessages).values({
      conversationId, sender: 'human', body, authorUserId: actorUserId, createdAt: now,
    }).returning();
    await tx.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversationId));
    return message;
  });
}

export async function listConversationHandoffs(conversationId: string) {
  return getDb().select().from(handoffs).where(eq(handoffs.conversationId, conversationId))
    .orderBy(asc(handoffs.occurredAt));
}

/** Expurgo da retenção. Mensagens e handoffs saem em cascata. */
export async function purgeExpiredConversations(now = new Date()) {
  const removed = await getDb().delete(conversations).where(lt(conversations.expiresAt, now))
    .returning({ id: conversations.id });
  const windows = await getDb().delete(attendanceRateLimits)
    .where(lt(attendanceRateLimits.windowStart, new Date(now.getTime() - DAY_MS))).returning({ key: attendanceRateLimits.bucketKey });
  return { conversations: removed.length, rateLimitWindows: windows.length };
}
