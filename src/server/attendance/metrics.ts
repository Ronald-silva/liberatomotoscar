import { and, count, eq, gte, sql } from 'drizzle-orm';
import type { getDb } from '@/server/db/client';
import { attendanceUsage, conversationMessages, conversations, handoffs } from '@/server/db/schema';

/**
 * Métricas da Fase 6. Sem elas não há como dizer ao lojista que o agente funciona — e é a
 * única coisa que separa este projeto dos "cases de sucesso" de fornecedor, que são todos
 * auto-reportados.
 */

type Db = Pick<ReturnType<typeof getDb>, 'select'>;
export type MetricsWindow = { channel: 'site' | 'whatsapp'; since: Date };

/** 6.1, 6.2 e 6.3 numa passada: conversas, handoffs, visitas e total de mensagens. */
export function buildConversationMetricsQuery(db: Db, { channel, since }: MetricsWindow) {
  return db.select({
    conversas: count(conversations.id),
    // 6.1 — resolvida no canal é a conversa que nunca precisou de vendedor.
    conversasComHandoff: sql<number>`count(distinct ${handoffs.conversationId})`,
    // 6.2 — a visita é um fato anotado por registrar_lead, não uma coluna própria.
    conversasComVisita: sql<number>`count(*) filter (where ${conversations.facts} @> '[{"field":"visit"}]'::jsonb)`,
    mensagens: sql<number>`(select count(*) from ${conversationMessages}
      where ${conversationMessages.conversationId} = any(array_agg(${conversations.id})))`,
  }).from(conversations)
    .leftJoin(handoffs, eq(handoffs.conversationId, conversations.id))
    .where(and(eq(conversations.channel, channel), gte(conversations.createdAt, since)));
}

/** 6.4 — tempo até a primeira resposta, em segundos, medido por conversa e agregado. */
export function buildFirstReplyMetricsQuery(db: Db, { channel, since }: MetricsWindow) {
  const primeiraDoCliente = sql`min(${conversationMessages.createdAt})
    filter (where ${conversationMessages.sender} = 'visitor')`;
  const primeiraResposta = sql`min(${conversationMessages.createdAt})
    filter (where ${conversationMessages.sender} <> 'visitor')`;
  return db.select({
    segundosAtePrimeiraResposta: sql<number | null>`avg(extract(epoch from (${primeiraResposta} - ${primeiraDoCliente})))`,
  }).from(conversationMessages)
    .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
    .where(and(eq(conversations.channel, channel), gte(conversations.createdAt, since)))
    .groupBy(conversations.id);
}

/** 6.3 (custo) e 6.5 — requisições, tokens e guardas reprovadas acumuladas por dia. */
export function buildUsageMetricsQuery(
  db: Db,
  { channel, sinceDayUtc }: { channel: 'site' | 'whatsapp'; sinceDayUtc: string },
) {
  return db.select({
    aiRequests: sql<number>`coalesce(sum(${attendanceUsage.aiRequests}), 0)`,
    inputTokens: sql<number>`coalesce(sum(${attendanceUsage.inputTokens}), 0)`,
    outputTokens: sql<number>`coalesce(sum(${attendanceUsage.outputTokens}), 0)`,
    guardRejections: sql<number>`coalesce(sum(${attendanceUsage.guardRejections}), 0)`,
  }).from(attendanceUsage)
    .where(and(eq(attendanceUsage.channel, channel), gte(attendanceUsage.dayUtc, sinceDayUtc)));
}

export type RawAgentMetrics = {
  conversas: number;
  conversasComHandoff: number;
  conversasComVisita: number;
  mensagens: number;
  segundosAtePrimeiraResposta: number | null;
  aiRequests: number;
  guardRejections: number;
  inputTokens: number;
  outputTokens: number;
};

/** null, e não zero, quando ainda não há base: "0% resolvidas" e "sem dados" dizem coisas opostas. */
function taxa(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((Math.max(0, parte) / total) * 1000) / 10;
}

function media(total: number, divisor: number, casas = 1): number | null {
  if (divisor <= 0) return null;
  const fator = 10 ** casas;
  return Math.round((total / divisor) * fator) / fator;
}

export function deriveAgentMetrics(raw: RawAgentMetrics) {
  // Handoff acima do total é dado inconsistente (conversa expurgada com handoff ainda contado).
  // Reportar 0% de resolução é honesto; reportar taxa negativa é relatório quebrado.
  const resolvidas = Math.max(0, raw.conversas - raw.conversasComHandoff);
  return {
    conversas: raw.conversas,
    resolvidasNoCanalPct: taxa(resolvidas, raw.conversas),
    visitaAgendadaPct: taxa(raw.conversasComVisita, raw.conversas),
    mensagensPorConversa: media(raw.mensagens, raw.conversas),
    segundosAtePrimeiraResposta: raw.segundosAtePrimeiraResposta,
    guardaReprovadaPct: taxa(raw.guardRejections, raw.aiRequests),
    tokensPorConversa: media(raw.inputTokens + raw.outputTokens, raw.conversas, 0),
  };
}
