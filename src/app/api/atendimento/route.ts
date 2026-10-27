import { z } from 'zod';
import { AccessDeniedError, requireAdmin } from '@/server/authz';
import { getAuthSecret } from '@/server/env';
import { DemoProviderError } from '@/server/ai/provider';
import { consumeRateLimit, rateLimitKey } from '@/server/attendance/limits';
import { getSiteChatView, handleSiteTurn, SiteChatError } from '@/server/attendance/site-chat';
import { RETENTION_NO_LEAD_DAYS } from '@/server/attendance/conversation-repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const SITE_CHAT_COOKIE = 'liberato_atendimento';
const noStore = { 'Cache-Control': 'no-store' };

const turnSchema = z.object({
  message: z.string().trim().min(1).max(1000).optional(),
  choice: z.enum(['motorcycles', 'cars', 'financing', 'trade_in', 'human']).optional(),
  clientMessageId: z.uuid(),
}).strict().refine((value) => Boolean(value.message) !== Boolean(value.choice), 'Envie texto ou uma opção.');

function fail(message: string, status: number, code: string, headers: Record<string, string> = {}) {
  return Response.json({ error: message, code }, { status, headers: { ...noStore, ...headers } });
}

/**
 * Portão de publicação, independente do modo do painel:
 * `public` abre a qualquer visitante; `admin` permite ensaio só por administradores;
 * qualquer outro valor mantém a rota fechada.
 */
export function siteChatAccess(): 'public' | 'admin' | 'off' {
  const value = process.env.SITE_CHAT_ACCESS;
  if (value === 'admin') return 'admin';
  if (value === 'disabled') return 'off';
  return 'public';
}

async function guardAccess() {
  const access = siteChatAccess();
  if (access === 'off') return fail('O atendimento do site ainda não foi liberado.', 404, 'off');
  if (access === 'admin') {
    try { await requireAdmin(); } catch (error) {
      if (error instanceof AccessDeniedError) return fail('Atendimento em ensaio restrito.', 404, 'off');
      return fail('Não foi possível verificar o acesso.', 503, 'unavailable');
    }
  }
  return null;
}

function readToken(request: Request) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SITE_CHAT_COOKIE) return rest.join('=') || null;
  }
  return null;
}

function tokenCookie(request: Request, token: string | null) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const maxAge = token ? RETENTION_NO_LEAD_DAYS * 24 * 60 * 60 : 0;
  return `${SITE_CHAT_COOKIE}=${token ?? ''}; Path=/api/atendimento; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clientAddress(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

async function limited(request: Request, scope: string, max: number) {
  const key = rateLimitKey(scope, clientAddress(request), getAuthSecret());
  return !(await consumeRateLimit(key, max, 60_000));
}

function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

function safeError(error: unknown) {
  if (error instanceof SiteChatError) return fail(error.message, error.status, error.code);
  if (error instanceof DemoProviderError) {
    console.error('Falha no provedor de IA do atendimento:', error.code);
    return fail('O assistente está indisponível agora. Chame um vendedor ou use o WhatsApp.', 503, 'provider');
  }
  console.error('Falha no atendimento do site', error instanceof Error ? error.name : 'erro desconhecido');
  return fail('Não consegui responder agora. Tente novamente ou fale com a loja pelo WhatsApp.', 503, 'unavailable');
}

export async function GET(request: Request) {
  const denied = await guardAccess();
  if (denied) return denied;
  try {
    if (await limited(request, 'site-chat-read', 40)) return fail('Aguarde um instante.', 429, 'rate_limited', { 'Retry-After': '30' });
    const view = await getSiteChatView(readToken(request));
    return Response.json({ view }, { headers: noStore });
  } catch (error) {
    return safeError(error);
  }
}

export async function POST(request: Request) {
  const denied = await guardAccess();
  if (denied) return denied;
  if (!sameOrigin(request)) return fail('Origem da solicitação inválida.', 403, 'origin');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('Envie a mensagem em JSON.', 415, 'content_type');
  try {
    const raw = await request.text();
    if (raw.length > 4_000) return fail('Mensagem muito longa.', 413, 'too_large');
    const parsed = turnSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return fail('Mensagem inválida.', 400, 'invalid_message');
    if (await limited(request, 'site-chat-write', 12)) {
      return fail('Muitas mensagens em pouco tempo. Aguarde um instante.', 429, 'rate_limited', { 'Retry-After': '60' });
    }
    const result = await handleSiteTurn(readToken(request), parsed.data, undefined, request.signal);
    const headers: Record<string, string> = { ...noStore };
    if (result.token) headers['Set-Cookie'] = tokenCookie(request, result.token);
    return Response.json({ view: result.view }, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return fail('Mensagem inválida.', 400, 'invalid_message');
    return safeError(error);
  }
}

/** Nova conversa: o navegador esquece o token. O histórico segue a retenção no banco. */
export async function DELETE(request: Request) {
  const denied = await guardAccess();
  if (denied) return denied;
  if (!sameOrigin(request)) return fail('Origem da solicitação inválida.', 403, 'origin');
  return new Response(null, { status: 204, headers: { ...noStore, 'Set-Cookie': tokenCookie(request, null) } });
}
