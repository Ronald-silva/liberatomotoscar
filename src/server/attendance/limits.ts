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

/** Teto diário global de chamadas de IA no site; ajustável por ambiente. */
export function siteAiDailyLimit() {
  const value = Number(process.env.SITE_CHAT_AI_DAILY_LIMIT ?? 150);
  return Number.isSafeInteger(value) && value >= 0 ? value : 150;
}

export function whatsappAiDailyLimit() {
  const value = Number(process.env.WHATSAPP_AI_DAILY_LIMIT ?? 150);
  return Number.isSafeInteger(value) && value >= 0 ? value : 150;
}

async function reserveAiRequest(channel: 'site' | 'whatsapp', now: Date, limit: number) {
  const dayUtc = now.toISOString().slice(0, 10);
  if (limit <= 0) return null;
  try {
    await ensureAttendanceTables();
    const [row] = await getDb().insert(attendanceUsage).values({ channel, dayUtc, aiRequests: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: [attendanceUsage.channel, attendanceUsage.dayUtc],
        set: { aiRequests: sql`${attendanceUsage.aiRequests} + 1`, updatedAt: now },
        setWhere: lt(attendanceUsage.aiRequests, limit),
      }).returning({ aiRequests: attendanceUsage.aiRequests });
    return row ? { dayUtc } : null;
  } catch {
    return { dayUtc };
  }
}

export async function reserveSiteAiRequest(now = new Date(), limit = siteAiDailyLimit()) {
  return reserveAiRequest('site', now, limit);
}

export async function reserveWhatsappAiRequest(now = new Date(), limit = whatsappAiDailyLimit()) {
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

export async function recordSiteAiTokens(dayUtc: string, inputTokens: number, outputTokens: number) {
  return recordAiTokens('site', dayUtc, inputTokens, outputTokens);
}

export async function recordWhatsappAiTokens(dayUtc: string, inputTokens: number, outputTokens: number) {
  return recordAiTokens('whatsapp', dayUtc, inputTokens, outputTokens);
}

export function rateLimitKey(scope: string, clientAddress: string, secret: string) {
  return `${scope}:${createHmac('sha256', secret).update(clientAddress).digest('base64url').slice(0, 32)}`;
}

/**
 * Janela fixa compartilhada entre instâncias serverless (estado no Postgres).
 * Devolve `false` quando o limite da janela foi atingido.
 */
export async function consumeRateLimit(bucketKey: string, max: number, windowMs: number, now = new Date()) {
  try {
    await ensureAttendanceTables();
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const [row] = await getDb().insert(attendanceRateLimits).values({ bucketKey, windowStart, hits: 1 })
      .onConflictDoUpdate({
        target: [attendanceRateLimits.bucketKey, attendanceRateLimits.windowStart],
        set: { hits: sql`${attendanceRateLimits.hits} + 1` },
        setWhere: lt(attendanceRateLimits.hits, max),
      }).returning({ hits: attendanceRateLimits.hits });
    return Boolean(row);
  } catch {
    return true;
  }
}
