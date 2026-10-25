import { getAuth } from '@/server/auth';
import { isAdminAuthConfigured } from '@/server/auth-policy';
import { consumeLoginAttempt } from '@/server/login-rate-limit';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateHeaders = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export function GET(request: NextRequest) {
  if (!isAdminAuthConfigured()) return Response.json({ error: 'Login indisponível' }, { status: 503, headers: privateHeaders });
  return getAuth().handlers.GET(request);
}

export function POST(request: NextRequest) {
  if (!isAdminAuthConfigured()) return Response.json({ error: 'Login indisponível' }, { status: 503, headers: privateHeaders });
  if (new URL(request.url).pathname.startsWith('/api/auth/signin')) {
    const limit = consumeLoginAttempt();
    if (!limit.allowed) return Response.json({ error: 'Tente novamente mais tarde' }, {
      status: 429, headers: { ...privateHeaders, 'Retry-After': String(limit.retryAfterSeconds) },
    });
  }
  return getAuth().handlers.POST(request);
}
