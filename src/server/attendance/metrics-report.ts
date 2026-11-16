import { z } from 'zod';
import { requireAdmin } from '@/server/authz';
import { getDb } from '@/server/db/client';
import { ensureAttendanceTables } from './ensure-schema';
import {
  buildIncidentBreakdownQuery, buildUnattendedConversationsQuery, deriveIncidentSummary,
  type IncidentBreakdownRow, type IncidentSummary,
} from './incidents';
import {
  buildConversationMetricsQuery, buildFirstReplyMetricsQuery, buildUsageMetricsQuery,
  deriveAgentMetrics, type AgentMetrics,
} from './metrics';

/**
 * O relatório que a tela de métricas lê. `metrics.ts` monta as consultas e `incidents.ts` grava e
 * agrega os incidentes; aqui é onde isso vira uma chamada só, autorizada, com a janela aplicada.
 *
 * Toda leitura passa por `requireAdmin()`: a barreira é por função, não só pelo layout protegido
 * — é a mesma regra do resto do painel (ver `inbox.ts`).
 */

export const metricsChannelSchema = z.enum(['site', 'whatsapp']).catch('whatsapp');
export const metricsDaysSchema = z.coerce.number().int().pipe(z.union([z.literal(7), z.literal(30)])).catch(30);

export type MetricsChannel = z.infer<typeof metricsChannelSchema>;
export type MetricsDays = 7 | 30;

/** Dia UTC no formato que `attendance_usage.day_utc` guarda (texto 'YYYY-MM-DD'). */
export function dayUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type MetricsReport = {
  channel: MetricsChannel;
  dias: MetricsDays;
  desde: Date;
  metrics: AgentMetrics;
  incidentes: IncidentSummary;
  /** Conversas que ficaram sem confirmação de vendedor, para o lojista poder abrir cada uma. */
  semAtendimento: { conversationId: string | null; evento: string; motivo: string | null; occurredAt: Date }[];
};

export type MetricsReportDeps = {
  /** Só `select`: é tudo que o relatório faz, e assim o teste não precisa fingir um Drizzle inteiro. */
  db?: Pick<ReturnType<typeof getDb>, 'select'>;
  ensureTables?: () => Promise<void>;
  now?: () => Date;
};

/**
 * Uma leitura por janela e canal. As cinco consultas vão juntas (`Promise.all`) porque são
 * independentes e a tela só rende quando todas voltam; serializar multiplicaria a latência do
 * Neon por cinco sem nenhum ganho.
 */
export async function loadMetricsReport(
  { channel, dias }: { channel: MetricsChannel; dias: MetricsDays },
  deps: MetricsReportDeps = {},
): Promise<MetricsReport> {
  await requireAdmin();
  const ensureTables = deps.ensureTables ?? ensureAttendanceTables;
  await ensureTables();
  const db = deps.db ?? getDb();
  const agora = (deps.now ?? (() => new Date()))();
  const desde = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);

  const [conversaRows, primeiraRespostaRows, usoRows, incidenteRows, semAtendimento] = await Promise.all([
    buildConversationMetricsQuery(db, { channel, since: desde }),
    buildFirstReplyMetricsQuery(db, { channel, since: desde }),
    buildUsageMetricsQuery(db, { channel, sinceDayUtc: dayUtc(desde) }),
    buildIncidentBreakdownQuery(db, { channel, since: desde }),
    buildUnattendedConversationsQuery(db, { channel, since: desde }),
  ]);

  const conversa = conversaRows[0];
  const uso = usoRows[0];
  const metrics = deriveAgentMetrics({
    conversas: Number(conversa?.conversas ?? 0),
    conversasComHandoff: Number(conversa?.conversasComHandoff ?? 0),
    conversasComIntencaoDeVisita: Number(conversa?.conversasComIntencaoDeVisita ?? 0),
    conversasComVisitaMarcada: Number(conversa?.conversasComVisitaMarcada ?? 0),
    mensagens: Number(conversa?.mensagens ?? 0),
    // `avg` do Postgres volta null sem linhas, e null aqui significa "sem dado", não zero.
    segundosAtePrimeiraResposta: primeiraRespostaRows[0]?.segundosAtePrimeiraResposta == null
      ? null
      : Math.round(Number(primeiraRespostaRows[0].segundosAtePrimeiraResposta)),
    aiRequests: Number(uso?.aiRequests ?? 0),
    guardRejections: Number(uso?.guardRejections ?? 0),
    inputTokens: Number(uso?.inputTokens ?? 0),
    outputTokens: Number(uso?.outputTokens ?? 0),
  });

  return {
    channel,
    dias,
    desde,
    metrics,
    incidentes: deriveIncidentSummary(incidenteRows as IncidentBreakdownRow[]),
    semAtendimento,
  };
}
