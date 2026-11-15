import { timingSafeEqual } from 'node:crypto';
import { runRetention } from '@/server/retention/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** O expurgo varre conversas e repete exclusões no R2; o padrão de 300 s cobre com folga. */
export const maxDuration = 300;

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

/**
 * Comparação de tempo constante. `timingSafeEqual` estoura com tamanhos diferentes, e o próprio
 * estouro vazaria o comprimento do segredo, então o tamanho é conferido antes — e o retorno
 * para tamanhos distintos é falso sem comparar byte algum.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  return secretMatches(header.slice(prefix.length), expected);
}

/**
 * GET /api/cron/retencao
 * Agendada em `vercel.json`; o Vercel Cron envia `Authorization: Bearer $CRON_SECRET`. Qualquer
 * outro agendador (Railway, cron externo) só precisa mandar o mesmo cabeçalho.
 *
 * Sem CRON_SECRET a rota não roda: uma rota de expurgo aberta apaga dado de cliente a pedido de
 * quem descobrir a URL. É 503, e não 403, porque a causa é configuração do servidor.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    console.error('[retencao] CRON_SECRET ausente; expurgo não executado', JSON.stringify({
      evento: 'retencao_sem_segredo', em: new Date().toISOString(),
    }));
    return Response.json({ error: 'Rotina de retenção não configurada.' }, { status: 503, headers });
  }
  if (!authorized(request)) {
    return Response.json({ error: 'Acesso negado' }, { status: 403, headers });
  }

  const resultado = await runRetention();
  // 500 quando alguma etapa falhou: o painel do agendador precisa mostrar a execução em vermelho,
  // senão a retenção volta a ser uma rotina que ninguém confere.
  return Response.json(resultado, { status: resultado.falhas > 0 ? 500 : 200, headers });
}
