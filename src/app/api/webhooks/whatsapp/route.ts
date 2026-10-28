import { NextResponse } from 'next/server';
import { verifyMetaWebhookSignature } from '@/server/whatsapp/crypto';
import { processMetaWebhookPayload, type MetaWebhookPayload } from '@/server/whatsapp/webhook-handler';

export const runtime = 'nodejs';

/**
 * GET /api/webhooks/whatsapp
 * Validação oficial do Webhook no painel Meta for Developers (RonalDigital ISP Platform).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.json({ error: 'Token de verificação do Webhook inválido.' }, { status: 403 });
}

/**
 * POST /api/webhooks/whatsapp
 * Recepção de eventos Multi-Tenant da WhatsApp Cloud API com verificação X-Hub-Signature-256.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-hub-signature-256');

  if (!verifyMetaWebhookSignature(rawBody, signatureHeader)) {
    return NextResponse.json({ error: 'Assinatura X-Hub-Signature-256 inválida.' }, { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  try {
    const result = await processMetaWebhookPayload(payload);
    return NextResponse.json({ received: true, ...result }, { status: 200 });
  } catch (error) {
    console.error('Erro ao processar evento do Webhook WhatsApp:', error instanceof Error ? error.message : 'erro');
    return NextResponse.json({ error: 'Falha ao processar evento.' }, { status: 500 });
  }
}

