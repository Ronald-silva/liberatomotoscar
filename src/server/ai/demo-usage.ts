import { and, eq, lt, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { demoAiUsage } from '@/server/db/schema';

export const DEMO_DAILY_LIMIT = 20;

export class DemoLimitError extends Error {
  constructor() { super('O limite diário da demonstração foi atingido.'); }
}

export async function reserveDemoRequest(adminUserId: string, now = new Date()) {
  const dayUtc = now.toISOString().slice(0, 10);
  const [row] = await getDb().insert(demoAiUsage).values({ adminUserId, dayUtc, requests: 1 })
    .onConflictDoUpdate({
      target: [demoAiUsage.adminUserId, demoAiUsage.dayUtc],
      set: { requests: sql`${demoAiUsage.requests} + 1`, updatedAt: now },
      setWhere: lt(demoAiUsage.requests, DEMO_DAILY_LIMIT),
    }).returning({ requests: demoAiUsage.requests });
  if (!row) throw new DemoLimitError();
  return { dayUtc, requests: row.requests };
}

export async function recordDemoTokens(adminUserId: string, dayUtc: string, inputTokens: number, outputTokens: number) {
  await getDb().update(demoAiUsage).set({
    inputTokens: sql`${demoAiUsage.inputTokens} + ${Math.max(0, Math.floor(inputTokens))}`,
    outputTokens: sql`${demoAiUsage.outputTokens} + ${Math.max(0, Math.floor(outputTokens))}`,
    updatedAt: new Date(),
  }).where(and(eq(demoAiUsage.adminUserId, adminUserId), eq(demoAiUsage.dayUtc, dayUtc)));
}
