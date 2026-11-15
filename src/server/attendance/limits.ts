import { createHmac } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { attendanceRateLimits, attendanceUsage } from '@/server/db/schema';
import { ensureAttendanceTables } from './ensure-schema';

export class AttendanceLimitError extends Error {
  constructor(message = 'Muitas mensagens em pouco tempo. Aguarde um instante e tente novamente.') {
    super(message);
    this.name = 'AttendanceLimitError';
  }
}

export function whatsappAiDailyLimit() {
  const value = Number(process.env.WHATSAPP_AI_DAILY_LIMIT ?? 150);
  return Number.isSafeInteger(value) && value >= 0 ? value : 150;
}

/**
 * Por que a cota não liberou a chamada paga.
 *
 * Antes isto era `null` para os dois casos, e quem chamava não tinha como escolher resposta nem
 * log: "a loja gastou a cota do dia" e "o banco não respondeu" exigem mensagens, alertas e
 * tratamentos diferentes. O único ponto em comum é que nenhum dos dois autoriza gastar token —
 * essa parte continua idêntica, e é o que `limite` e `indisponivel` têm de garantir juntos.
 */
export type AiQuotaOutcome =
  | { status: 'reservado'; dayUtc: string }
  | { status: 'limite' }
  | { status: 'indisponivel' };

async function reserveAiRequest(channel: 'site' | 'whatsapp', now: Date, limit: number): Promise<AiQuotaOutcome> {
  const dayUtc = now.toISOString().slice(0, 10);
  if (limit <= 0) return { status: 'limite' };
  try {
    await ensureAttendanceTables();
    const [row] = await getDb().insert(attendanceUsage).values({ channel, dayUtc, aiRequests: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: [attendanceUsage.channel, attendanceUsage.dayUtc],
        set: { aiRequests: sql`${attendanceUsage.aiRequests} + 1`, updatedAt: now },
        setWhere: lt(attendanceUsage.aiRequests, limit),
      }).returning({ aiRequests: attendanceUsage.aiRequests });
    return row ? { status: 'reservado', dayUtc } : { status: 'limite' };
  } catch (error) {
    // Sem confirmação no banco, NUNCA autorizar uma chamada paga ao modelo. O teto de custo não
    // pode sumir quando o controle falha — e quem chamou precisa saber que foi falha, não limite.
    console.error('[attendance] falha ao reservar cota de IA; chamada bloqueada', JSON.stringify({
      evento: 'cota_ia_indisponivel', canal: channel,
      detalhe: error instanceof Error ? error.message : String(error), em: now.toISOString(),
    }));
    return { status: 'indisponivel' };
  }
}

export async function reserveWhatsappAiRequest(now = new Date(), limit = whatsappAiDailyLimit()): Promise<AiQuotaOutcome> {
  return reserveAiRequest('whatsapp', now, limit);
}

async function recordAiTokens(channel: 'site' | 'whatsapp', dayUtc: string, inputTokens: number, outputTokens: number) {
  await ensureAttendanceTables();
  await getDb().update(attendanceUsage).set({
    inputTokens: sql`${attendanceUsage.inputTokens} + ${Math.max(0, Math.floor(inputTokens))}`,
    outputTokens: sql`${attendanceUsage.outputTokens} + ${Math.max(0, Math.floor(outputTokens))}`,
    updatedAt: new Date(),
  }).where(and(eq(attendanceUsage.channel, channel), eq(attendanceUsage.dayUtc, dayUtc)));
}

/** Métrica 6.5 — a contagem fica ao lado das requisições do dia, para a taxa ser comparável. */
async function recordGuardRejection(channel: 'site' | 'whatsapp', dayUtc: string) {
  await ensureAttendanceTables();
  await getDb().update(attendanceUsage)
    .set({ guardRejections: sql`${attendanceUsage.guardRejections} + 1`, updatedAt: new Date() })
    .where(and(eq(attendanceUsage.channel, channel), eq(attendanceUsage.dayUtc, dayUtc)));
}

export async function recordWhatsappGuardRejection(dayUtc: string) {
  return recordGuardRejection('whatsapp', dayUtc);
}

export async function recordWhatsappAiTokens(dayUtc: string, inputTokens: number, outputTokens: number) {
  return recordAiTokens('whatsapp', dayUtc, inputTokens, outputTokens);
}

export function rateLimitKey(scope: string, clientAddress: string, secret: string) {
  return `${scope}:${createHmac('sha256', secret).update(clientAddress).digest('base64url').slice(0, 32)}`;
}

/**
 * Resultado de consumir uma janela de limite.
 *
 * `limite` e `indisponivel` **bloqueiam igual** — é o que mantém o teto de custo de pé quando o
 * controle falha. O que muda é o que o chamador deve fazer depois: limite atingido é operação
 * normal e previsível; banco indisponível é incidente, e quem atende um cliente precisa tratar os
 * dois de formas diferentes sem nunca deixar a pessoa sem resposta.
 */
export type RateLimitOutcome = 'liberado' | 'limite' | 'indisponivel';

/**
 * Janela fixa compartilhada entre instâncias serverless (estado no Postgres).
 * Nunca devolve `liberado` sem confirmação do banco.
 */
export async function consumeRateLimit(
  bucketKey: string, max: number, windowMs: number, now = new Date(),
): Promise<RateLimitOutcome> {
  try {
    await ensureAttendanceTables();
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const [row] = await getDb().insert(attendanceRateLimits).values({ bucketKey, windowStart, hits: 1 })
      .onConflictDoUpdate({
        target: [attendanceRateLimits.bucketKey, attendanceRateLimits.windowStart],
        set: { hits: sql`${attendanceRateLimits.hits} + 1` },
        setWhere: lt(attendanceRateLimits.hits, max),
      }).returning({ hits: attendanceRateLimits.hits });
    return row ? 'liberado' : 'limite';
  } catch (error) {
    // O limite é distribuído: se o banco falhar, não há autorização para consumir.
    console.error('[attendance] falha ao verificar rate limit; requisição bloqueada', JSON.stringify({
      evento: 'rate_limit_indisponivel', bucket: bucketKey,
      detalhe: error instanceof Error ? error.message : String(error), em: now.toISOString(),
    }));
    return 'indisponivel';
  }
}
