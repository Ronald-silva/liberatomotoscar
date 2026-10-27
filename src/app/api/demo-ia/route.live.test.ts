/** Ensaio opt-in: exige branch Neon isolada; jamais executar em CI por padrão. */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { loadEnvConfig } from '@next/env';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { closeDb, getDb } from '@/server/db/client';
import { adminGrants, demoAiUsage } from '@/server/db/schema';

loadEnvConfig(process.cwd());

const auth = vi.hoisted(() => ({ userId: '' }));
vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: async () => ({ userId: auth.userId }),
}));

import { POST } from './route';

describe.skipIf(process.env.RUN_LIVE_OPENROUTER !== 'true' || !process.env.ISOLATED_NEON_TEST_BRANCH_ID)
  ('rota P0 com modelo real e banco isolado', () => {
  afterAll(async () => { await closeDb(); });

  it('transmite progresso, anuncia veículos reais e contabiliza tokens sem expor a chave', async () => {
    const expectedBranch = process.env.ISOLATED_NEON_TEST_BRANCH_ID;
    const sharedBranch = process.env.NEON_DEVELOPMENT_BRANCH_ID;
    expect(expectedBranch).toMatch(/^br-[a-z0-9-]+$/);
    expect(sharedBranch).toMatch(/^br-[a-z0-9-]+$/);
    expect(expectedBranch).not.toBe(sharedBranch);
    const [branch] = await getDb().execute(sql`SELECT current_setting('neon.branch_id', true) AS id`);
    expect(branch.id).toBe(expectedBranch);
    expect(process.env.OPENROUTER_API_KEY).toBeTruthy();

    const [grant] = await getDb().select({ userId: adminGrants.userId }).from(adminGrants)
      .where(isNull(adminGrants.revokedAt)).limit(1);
    expect(grant?.userId).toBeTruthy();
    auth.userId = grant.userId;
    process.env.DEMO_AI_ENABLED = 'true';

    const response = await POST(new Request('http://localhost:3000/api/demo-ia', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ message: 'Quero uma moto para trabalhar até 18 mil', state: null }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('event: status');
    expect(body).not.toContain(process.env.OPENROUTER_API_KEY!);
    const answerLine = body.split('\n').find((line) => line.startsWith('data: {"answer":'));
    expect(answerLine).toBeTruthy();
    const answer = JSON.parse(answerLine!.slice(6));
    expect(answer.model).toBe('deepseek/deepseek-v4-pro-0813');
    expect(answer.cards.length).toBeGreaterThan(0);
    expect(answer.cards.every((card: { type: string; priceCents: number }) =>
      card.type === 'motorcycle' && card.priceCents <= 1_800_000)).toBe(true);
    expect(answer.state).toBeTruthy();

    const dayUtc = new Date().toISOString().slice(0, 10);
    const [usage] = await getDb().select({ requests: demoAiUsage.requests, inputTokens: demoAiUsage.inputTokens })
      .from(demoAiUsage).where(and(eq(demoAiUsage.adminUserId, auth.userId), eq(demoAiUsage.dayUtc, dayUtc))).limit(1);
    expect(usage?.requests).toBeGreaterThan(0);
    expect(usage?.inputTokens).toBeGreaterThan(0);
  }, 60_000);
});
