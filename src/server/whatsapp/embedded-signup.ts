import { and, desc, eq } from 'drizzle-orm';
import { ensureAttendanceTables } from '@/server/attendance/ensure-schema';
import { getDb } from '@/server/db/client';
import { whatsappTenants } from '@/server/db/schema';
import { encryptAccessToken } from './crypto';

export type WhatsappTenantRow = typeof whatsappTenants.$inferSelect;

export type CompleteEmbeddedSignupInput = {
  tenantId: string;
  tenantName: string;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
  coexistenceEnabled?: boolean;
};

export type EmbeddedSignupDeps = {
  appId?: string;
  appSecret?: string;
  apiVersion?: string;
  encryptionKeyHex?: string;
  fetchImpl?: typeof fetch;
  upsertTenant?: (row: {
    tenantId: string;
    tenantName: string;
    wabaId: string;
    whatsappPhoneNumberId: string;
    displayPhoneNumber: string | null;
    encryptedAccessToken: string;
    coexistenceEnabled: boolean;
  }) => Promise<Pick<WhatsappTenantRow, 'id' | 'tenantId' | 'tenantName' | 'wabaId' | 'whatsappPhoneNumberId' | 'coexistenceEnabled'>>;
};

async function defaultUpsertTenant(row: {
  tenantId: string;
  tenantName: string;
  wabaId: string;
  whatsappPhoneNumberId: string;
  displayPhoneNumber: string | null;
  encryptedAccessToken: string;
  coexistenceEnabled: boolean;
}) {
  await ensureAttendanceTables();
  const db = getDb();
  const [saved] = await db
    .insert(whatsappTenants)
    .values({
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      wabaId: row.wabaId,
      whatsappPhoneNumberId: row.whatsappPhoneNumberId,
      displayPhoneNumber: row.displayPhoneNumber,
      encryptedAccessToken: row.encryptedAccessToken,
      coexistenceEnabled: row.coexistenceEnabled,
      isActive: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: whatsappTenants.whatsappPhoneNumberId,
      set: {
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        wabaId: row.wabaId,
        displayPhoneNumber: row.displayPhoneNumber,
        encryptedAccessToken: row.encryptedAccessToken,
        coexistenceEnabled: row.coexistenceEnabled,
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: whatsappTenants.id,
      tenantId: whatsappTenants.tenantId,
      tenantName: whatsappTenants.tenantName,
      wabaId: whatsappTenants.wabaId,
      whatsappPhoneNumberId: whatsappTenants.whatsappPhoneNumberId,
      coexistenceEnabled: whatsappTenants.coexistenceEnabled,
    });
  return saved!;
}

/**
 * Fluxo oficial de Tech Provider (RonalDigital ISP Platform - App ID 172704712193909):
 * 1. Troca o `code` retornado pelo SDK de Embedded Signup por um `access_token` permanente da WABA.
 * 2. Inscreve o App nos Webhooks da WABA (`POST /{waba_id}/subscribed_apps`).
 * 3. Criptografa o `access_token` com AES-256-GCM e persiste na tabela multi-tenant `whatsapp_tenants`.
 */
export async function completeEmbeddedSignup(
  input: CompleteEmbeddedSignupInput,
  deps: EmbeddedSignupDeps = {},
) {
  const appId = deps.appId ?? process.env.META_APP_ID ?? '172704712193909';
  const appSecret = deps.appSecret ?? process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;
  const version = deps.apiVersion ?? process.env.META_GRAPH_API_VERSION ?? 'v21.0';
  const fetchFn = deps.fetchImpl ?? fetch;
  const upsert = deps.upsertTenant ?? defaultUpsertTenant;

  if (!appSecret) {
    throw new Error('META_APP_SECRET não configurado no servidor.');
  }

  // 1. Trocar authorization code pelo access_token da WABA
  const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('code', input.code);

  const tokenRes = await fetchFn(tokenUrl.toString(), { method: 'GET', cache: 'no-store' });
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: { message?: string };
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error?.message ?? 'Falha ao trocar código OAuth pelo access_token na Meta.');
  }

  const plainAccessToken = tokenData.access_token;

  // 2. Inscrever o App nos Webhooks da WABA do cliente
  const subscribeUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(input.wabaId)}/subscribed_apps`;
  const subRes = await fetchFn(subscribeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${plainAccessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!subRes.ok) {
    const errText = await subRes.text().catch(() => '');
    throw new Error(`Falha ao inscrever WABA ${input.wabaId} nos webhooks: ${errText.slice(0, 200)}`);
  }

  // 3. Criptografar token e persistir no banco por cliente
  const encryptedAccessToken = encryptAccessToken(plainAccessToken, deps.encryptionKeyHex);

  return upsert({
    tenantId: input.tenantId.trim(),
    tenantName: input.tenantName.trim(),
    wabaId: input.wabaId.trim(),
    whatsappPhoneNumberId: input.phoneNumberId.trim(),
    displayPhoneNumber: input.displayPhoneNumber?.trim() || null,
    encryptedAccessToken,
    coexistenceEnabled: input.coexistenceEnabled ?? true,
  });
}

export async function findActiveTenantByPhoneNumberId(phoneNumberId: string): Promise<WhatsappTenantRow | null> {
  await ensureAttendanceTables();
  const [row] = await getDb()
    .select()
    .from(whatsappTenants)
    .where(and(eq(whatsappTenants.whatsappPhoneNumberId, phoneNumberId), eq(whatsappTenants.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function listWhatsappTenants(): Promise<
  Array<Omit<WhatsappTenantRow, 'encryptedAccessToken'>>
> {
  await ensureAttendanceTables();
  const rows = await getDb()
    .select({
      id: whatsappTenants.id,
      tenantId: whatsappTenants.tenantId,
      tenantName: whatsappTenants.tenantName,
      wabaId: whatsappTenants.wabaId,
      whatsappPhoneNumberId: whatsappTenants.whatsappPhoneNumberId,
      displayPhoneNumber: whatsappTenants.displayPhoneNumber,
      coexistenceEnabled: whatsappTenants.coexistenceEnabled,
      isActive: whatsappTenants.isActive,
      createdAt: whatsappTenants.createdAt,
      updatedAt: whatsappTenants.updatedAt,
    })
    .from(whatsappTenants)
    .orderBy(desc(whatsappTenants.updatedAt));
  return rows;
}

