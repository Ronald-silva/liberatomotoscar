import { AccessDeniedError, requireAdmin } from '@/server/authz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  try {
    await requireAdmin();
    return Response.json({ status: 'ok' }, { headers });
  } catch (error) {
    if (error instanceof AccessDeniedError) return Response.json({ error: 'Acesso negado' }, { status: 403, headers });
    return Response.json({ error: 'Serviço indisponível' }, { status: 503, headers });
  }
}
