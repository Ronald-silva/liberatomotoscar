import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AccessDeniedError, requireAdmin } from '@/server/authz';
import { completeEmbeddedSignup, listWhatsappTenants } from '@/server/whatsapp/embedded-signup';

export const runtime = 'nodejs';

const embeddedSignupSchema = z.object({
  code: z.string().trim().min(5),
  tenantId: z.string().trim().min(2).max(80).optional(),
  tenantName: z.string().trim().min(2).max(120).optional(),
  wabaId: z.string().trim().max(64).optional(),
  phoneNumberId: z.string().trim().max(64).optional(),
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
 * Recebe apenas o `code` (e opcionalmente `wabaId` / `phoneNumberId`) do botão oficial da Meta,
 * descobre automaticamente a conta e o número caso necessário, inscreve o Webhook e salva criptografado.
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
    return NextResponse.json({ error: 'Não foi possível validar a resposta da Meta.' }, { status: 400 });
  }

  try {
    const tenant = await completeEmbeddedSignup(parsed.data);
    return NextResponse.json({ ok: true, tenant }, { status: 200 });
  } catch (error) {
    console.error('Erro no Embedded Signup WhatsApp:', error instanceof Error ? error.message : 'erro');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível concluir a conexão do WhatsApp.' },
      { status: 502 },
    );
  }
}
