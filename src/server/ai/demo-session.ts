import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { leadFactSchema } from './demo-contracts';

const turnSchema = z.object({ user: z.string().min(1).max(1000), assistant: z.string().max(500) }).strict();
const payloadSchema = z.object({
  v: z.literal(2),
  sessionId: z.uuid(),
  adminUserId: z.string().min(1),
  expiresAt: z.number().int(),
  handoffRequested: z.boolean(),
  facts: z.array(leadFactSchema).max(7),
  turns: z.array(turnSchema).max(8),
}).strict();

export type DemoTurn = z.infer<typeof turnSchema>;
export type DemoSession = z.infer<typeof payloadSchema>;

export class InvalidDemoSessionError extends Error {
  constructor() { super('Conversa expirada ou inválida. Inicie uma nova conversa.'); }
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signDemoSession(session: DemoSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(payloadSchema.parse(session))).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function readDemoSession(token: string | null, adminUserId: string, secret: string, now = Date.now()): DemoSession {
  if (!token) return { v: 2, sessionId: randomUUID(), adminUserId, expiresAt: now + 30 * 60_000,
    handoffRequested: false, facts: [], turns: [] };
  if (token.length > 20_000) throw new InvalidDemoSessionError();
  const [payload, mac, extra] = token.split('.');
  if (!payload || !mac || extra) throw new InvalidDemoSessionError();
  const actual = Buffer.from(mac, 'base64url');
  const expected = Buffer.from(signature(payload, secret), 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new InvalidDemoSessionError();
  try {
    const parsed = payloadSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (parsed.adminUserId !== adminUserId || parsed.expiresAt < now) throw new InvalidDemoSessionError();
    return parsed;
  } catch {
    throw new InvalidDemoSessionError();
  }
}
