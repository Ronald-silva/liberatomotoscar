import { and, eq, gte, sql } from 'drizzle-orm';
import type { getDb } from '@/server/db/client';
import {
  attendanceUsage, conversationMessages, conversations, handoffs, visitAppointments,
} from '@/server/db/schema';

/**
 * Métricas da Fase 6. Sem elas não há como dizer ao lojista que o agente funciona — e é a
 * única coisa que separa este projeto dos "cases de sucesso" de fornecedor, que são todos
 * auto-reportados.
 */

type Db = Pick<ReturnType<typeof getDb>, 'select'>;
export type MetricsWindow = { channel: 'site' | 'whatsapp'; since: Date };

/**
 * 6.1, 6.2 e 6.3 numa passada: conversas, handoffs, visitas e total de mensagens.
 *
 * Todo contador usa `distinct`. `handoffs` tem UMA LINHA POR EVENTO (requested, assumed,
 * released, closed), então o join multiplica: uma conversa escalada contava 3 ou 4 vezes no
 * denominador e a taxa de resolução saía alta demais — enviesada para o lado que agrada o
 * lojista, justamente na métrica que existe para provar valor a ele.
 */
export function buildConversationMetricsQuery(db: Db, { channel, since }: MetricsWindow) {
  return db.select({
    conversas: sql<number>`count(distinct ${conversations.id})`,
    // 6.1 — resolvida no canal é a conversa que nunca precisou de vendedor.
    conversasComHandoff: sql<number>`count(distinct ${handoffs.conversationId})`,
    /**
     * 6.2 — **intenção** de visita: um fato que a Dayse anotou a partir da frase do cliente
     * (`registrar_lead`). Chamar isto de "visita agendada" era a métrica que mentia: "quero
     * passar aí sábado" conta aqui mesmo que ninguém tenha marcado nada.
     */
    conversasComIntencaoDeVisita: sql<number>`count(distinct ${conversations.id})
      filter (where ${conversations.facts} @> '[{"field":"visit"}]'::jsonb)`,
    /**
     * 6.2 (de verdade) — visita **marcada**, lida de `visit_appointments`, que é a agenda que o
     * vendedor abre. `exists` e não join: `visit_appointments` tem índice único por conversa, mas
     * um join a mais neste SELECT multiplicaria as outras contagens se esse índice mudasse.
     */
    conversasComVisitaMarcada: sql<number>`count(distinct ${conversations.id}) filter (where exists (
      select 1 from ${visitAppointments}
      where ${visitAppointments.conversationId} = ${conversations.id}
    ))`,
    mensagens: sql<number>`count(distinct ${conversationMessages.id})`,
  }).from(conversations)
    .leftJoin(handoffs, eq(handoffs.conversationId, conversations.id))
    .leftJoin(conversationMessages, eq(conversationMessages.conversationId, conversations.id))
    .where(and(eq(conversations.channel, channel), gte(conversations.createdAt, since)));
}

/**
 * 6.4 — tempo médio até a primeira resposta, em segundos.
 *
 * A latência é por conversa (subconsulta agrupada) e a média é sobre elas. A primeira versão
 * agrupava no nível de fora e devolvia uma linha por conversa, cada uma com a média de um valor
 * só: quem lesse `rows[0]` teria a latência de uma conversa qualquer chamada de média.
 */
export function buildFirstReplyMetricsQuery(db: Db, { channel, since }: MetricsWindow) {
  const porConversa = db.select({
    segundos: sql<number>`extract(epoch from (
      min(${conversationMessages.createdAt}) filter (where ${conversationMessages.sender} <> 'visitor')
      - min(${conversationMessages.createdAt}) filter (where ${conversationMessages.sender} = 'visitor')
    ))`.as('segundos'),
  }).from(conversationMessages)
    .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
    .where(and(eq(conversations.channel, channel), gte(conversations.createdAt, since)))
    .groupBy(conversations.id)
    .as('por_conversa');

  return db.select({
    segundosAtePrimeiraResposta: sql<number | null>`avg(${porConversa.segundos})`,
  }).from(porConversa);
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
  conversasComIntencaoDeVisita: number;
  conversasComVisitaMarcada: number;
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
    /**
     * Dois nomes porque são dois dados. `visitaIntencaoPct` sai de `conversations.facts` (a Dayse
     * ouviu o cliente falar de visita); `visitaMarcadaPct` sai de `visit_appointments` (existe
     * linha na agenda). O primeiro é sempre maior ou igual ao segundo numa loja saudável, e a
     * diferença entre eles é o número que importa: intenção que não virou visita.
     */
    visitaIntencaoPct: taxa(raw.conversasComIntencaoDeVisita, raw.conversas),
    visitaMarcadaPct: taxa(raw.conversasComVisitaMarcada, raw.conversas),
    mensagensPorConversa: media(raw.mensagens, raw.conversas),
    segundosAtePrimeiraResposta: raw.segundosAtePrimeiraResposta,
    guardaReprovadaPct: taxa(raw.guardRejections, raw.aiRequests),
    tokensPorConversa: media(raw.inputTokens + raw.outputTokens, raw.conversas, 0),
  };
}

export type AgentMetrics = ReturnType<typeof deriveAgentMetrics>;
