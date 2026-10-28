import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AccessDeniedError, requireAdmin } from '@/server/authz';
import { completeEmbeddedSignup, listWhatsappTenants } from '@/server/whatsapp/embedded-signup';

export const runtime = 'nodejs';

const embeddedSignupSchema = z.object({
  tenantId: z.string().trim().min(2).max(80),
  tenantName: z.string().trim().min(2).max(120),
  code: z.string().trim().min(10),
  wabaId: z.string().trim().min(3).max(64),
  phoneNumberId: z.string().trim().min(3).max(64),
  displayPhoneNumber: z.string().trim().max(40).optional().nullable(),
  coexistenceEnabled: z.boolean().optional(),
});

/** Lista os clientes (tenants) conectados ao Tech Provider (sem expor o access_token). */
export async function GET() {
  try {
    await requireAdmin();
    const tenants = await listWhatsappTenants();
    return NextResponse.json({ tenants });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Não foi possível listar conexões do WhatsApp.' }, { status: 500 });
  }
}

/**
 * Recebe o `code`, `wabaId` e `phoneNumberId` retornados pelo SDK de Embedded Signup da Meta,
 * troca pelo token permanente da WABA, inscreve o Webhook e salva criptografado por tenant.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 });
    }
    throw error;
  }

  const parsed = embeddedSignupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados de Embedded Signup inválidos.' }, { status: 400 });
  }

  try {
    const tenant = await completeEmbeddedSignup(parsed.data);
    return NextResponse.json({ ok: true, tenant }, { status: 200 });
  } catch (error) {
    console.error('Erro no Embedded Signup WhatsApp:', error instanceof Error ? error.message : 'erro');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível concluir o Embedded Signup.' },
      { status: 502 },
    );
  }
}
