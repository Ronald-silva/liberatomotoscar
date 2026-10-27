import { requireAdmin, AccessDeniedError } from '@/server/authz';
import { getAuthSecret } from '@/server/env';
import { runDemoAgent } from '@/server/ai/demo-agent';
import { demoRequestSchema } from '@/server/ai/demo-contracts';
import { InvalidDemoSessionError, readDemoSession, signDemoSession } from '@/server/ai/demo-session';
import { DemoLimitError, recordDemoTokens, reserveDemoRequest } from '@/server/ai/demo-usage';
import { DemoProviderError, getDemoProviderConfig } from '@/server/ai/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: noStore });
}

function safeError(error: unknown): { message: string; status: number; code?: string } {
  if (error instanceof InvalidDemoSessionError) return { message: error.message, status: 400 };
  if (error instanceof DemoLimitError) return { message: error.message, status: 429 };
  if (error instanceof DemoProviderError) {
    console.error('Falha no provedor da demonstração de IA:', error.code);
    return { message: error.message, status: 503, code: error.code };
  }
  if (error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError')) {
    return { message: 'Mensagem ou estado inválido.', status: 400 };
  }
  console.error('Falha na demonstração de IA', error instanceof Error ? error.name : 'erro desconhecido');
  return { message: 'Não consegui consultar o estoque com a IA agora. Consulte o catálogo ou fale com a loja.', status: 503 };
}

export async function POST(request: Request) {
  if (process.env.DEMO_AI_ENABLED !== 'true') return fail('A demonstração de IA está desativada.', 503);
  if (request.headers.get('origin') !== new URL(request.url).origin) return fail('Origem da solicitação inválida.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('Envie uma mensagem em JSON.', 415);

  let admin: { userId: string };
  try { admin = await requireAdmin(); }
  catch (error) {
    if (error instanceof AccessDeniedError) return fail('Acesso restrito à demonstração.', 401);
    return fail('Não foi possível verificar o acesso.', 503);
  }

  try {
    const raw = await request.text();
    if (raw.length > 25_000) return fail('Mensagem muito longa.', 413);
    const { message, state } = demoRequestSchema.parse(JSON.parse(raw));
    const secret = getAuthSecret();
    const session = readDemoSession(state, admin.userId, secret);
    if (session.handoffRequested) return fail('Esta conversa foi encaminhada ao atendimento humano.', 409);
    if (session.turns.length >= 8) return fail('Esta conversa chegou ao limite de turnos. Inicie outra.', 429);

    getDemoProviderConfig();
    const reservation = await reserveDemoRequest(admin.userId);
    const answer = async (onProgress?: (status: 'inventory_checked' | 'preparing_answer') => void) => {
      const result = await runDemoAgent(session, message, onProgress, request.signal);
      await recordDemoTokens(admin.userId, reservation.dayUtc, result.usage.inputTokens, result.usage.outputTokens)
        .catch(() => console.error('Falha ao registrar contagem de tokens da demonstração.'));
      const newState = signDemoSession({ ...session, handoffRequested: result.handoffRequested, facts: result.lead.facts,
        turns: [...session.turns, { user: message, assistant: result.answer }] }, secret);
      return { ...result, state: newState };
    };

    if (request.headers.get('accept')?.includes('text/event-stream')) {
      const encoder = new TextEncoder();
      let open = true;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: string, payload: unknown) => {
            if (!open) return;
            try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)); }
            catch { open = false; }
          };
          send('status', { status: 'consulting_inventory' });
          void answer((status) => send('status', { status }))
            .then((result) => send('answer', result))
            .catch((error) => send('error', safeError(error)))
            .finally(() => { if (open) controller.close(); });
        },
        cancel() { open = false; },
      });
      return new Response(stream, { headers: { ...noStore, 'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
    }

    return Response.json(await answer(), { headers: noStore });
  } catch (error) {
    const { message, status } = safeError(error);
    return fail(message, status);
  }
}
