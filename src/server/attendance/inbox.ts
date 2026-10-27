import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '@/server/authz';
import { getDb } from '@/server/db/client';
import { conversations } from '@/server/db/schema';
import * as repository from './conversation-repository';

export const inboxFilterSchema = z.enum(['waiting', 'mine', 'automation', 'closed']).catch('waiting');
export type InboxFilter = z.infer<typeof inboxFilterSchema>;

const conversationId = z.uuid();
const replyBody = z.string().trim().min(1, 'Escreva a resposta.').max(2000, 'Resposta muito longa.');

/** Fila do vendedor. Hoje operadores são administradores autorizados (sem papel vendedor separado). */
export async function listInbox(filter: InboxFilter) {
  const admin = await requireAdmin();
  const where = filter === 'waiting'
    ? and(eq(conversations.status, 'open'), eq(conversations.owner, 'human'), sql`${conversations.assignedTo} IS NULL`)
    : filter === 'mine'
      ? and(eq(conversations.status, 'open'), eq(conversations.assignedTo, admin.userId))
      : filter === 'automation'
        ? and(eq(conversations.status, 'open'), eq(conversations.owner, 'automation'))
        : eq(conversations.status, 'closed');
  return getDb().select({
    id: conversations.id, owner: conversations.owner, status: conversations.status,
    assignedTo: conversations.assignedTo, facts: conversations.facts, visitorTurns: conversations.visitorTurns,
    handoffRequestedAt: conversations.handoffRequestedAt, lastMessageAt: conversations.lastMessageAt,
    createdAt: conversations.createdAt,
  }).from(conversations).where(and(eq(conversations.channel, 'site'), where))
    .orderBy(desc(conversations.lastMessageAt)).limit(50);
}

export async function countInbox() {
  const admin = await requireAdmin();
  const [row] = await getDb().select({
    waiting: sql<number>`count(*) filter (where ${conversations.owner} = 'human' and ${conversations.assignedTo} is null)::int`,
    mine: sql<number>`count(*) filter (where ${conversations.assignedTo} = ${admin.userId})::int`,
    automation: sql<number>`count(*) filter (where ${conversations.owner} = 'automation')::int`,
  }).from(conversations).where(and(eq(conversations.channel, 'site'), eq(conversations.status, 'open')));
  return row ?? { waiting: 0, mine: 0, automation: 0 };
}

export async function getInboxConversation(id: string) {
  const admin = await requireAdmin();
  const parsed = conversationId.safeParse(id);
  if (!parsed.success) return null;
  const conversation = await repository.readConversation(parsed.data);
  if (!conversation || conversation.channel !== 'site') return null;
  const [messages, events] = await Promise.all([
    repository.listConversationMessages(conversation.id, 200),
    repository.listConversationHandoffs(conversation.id),
  ]);
  return { conversation, messages, events, viewerUserId: admin.userId };
}

export async function assumeInboxConversation(id: string) {
  const admin = await requireAdmin();
  return repository.assumeConversationAs(conversationId.parse(id), admin.userId);
}

export async function releaseInboxConversation(id: string) {
  const admin = await requireAdmin();
  return repository.releaseConversationAs(conversationId.parse(id), admin.userId);
}

export async function closeInboxConversation(id: string) {
  const admin = await requireAdmin();
  return repository.closeConversationAs(conversationId.parse(id), admin.userId);
}

export async function replyToInboxConversation(id: string, body: unknown) {
  const admin = await requireAdmin();
  return repository.appendHumanReplyAs(conversationId.parse(id), admin.userId, replyBody.parse(body));
}
