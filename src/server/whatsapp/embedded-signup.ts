import { and, desc, eq } from 'drizzle-orm';
import { STORE } from '@/data/store';
import { ensureAttendanceTables } from '@/server/attendance/ensure-schema';
import { getDb } from '@/server/db/client';
import { whatsappTenants } from '@/server/db/schema';
import { encryptAccessToken } from './crypto';

export type WhatsappTenantRow = typeof whatsappTenants.$inferSelect;

export type CompleteEmbeddedSignupInput = {
  code: string;
  tenantId?: string;
  tenantName?: string;
  wabaId?: string;
  phoneNumberId?: string;
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
  }) => Promise<
    Pick<
      WhatsappTenantRow,
      'id' | 'tenantId' | 'tenantName' | 'wabaId' | 'whatsappPhoneNumberId' | 'displayPhoneNumber' | 'coexistenceEnabled'
    >
  >;
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
      displayPhoneNumber: whatsappTenants.displayPhoneNumber,
      coexistenceEnabled: whatsappTenants.coexistenceEnabled,
    });
  return saved!;
}

/**
 * Descobre automaticamente o WABA ID e o Phone Number ID na Graph API usando o token recém-emitido,
 * caso o navegador envie apenas o `code` OAuth (fluxo 1-clique sem campos técnicos).
 */
async function discoverWabaAndPhone(params: {
  accessToken: string;
  appId: string;
  appSecret: string;
  version: string;
  fetchFn: typeof fetch;
  knownWabaId?: string;
  knownPhoneNumberId?: string;
}): Promise<{ wabaId: string; phoneNumberId: string; displayPhoneNumber: string | null }> {
  let wabaId = params.knownWabaId?.trim() ?? '';
  let phoneNumberId = params.knownPhoneNumberId?.trim() ?? '';
  let displayPhoneNumber: string | null = null;

  if (!wabaId) {
    const debugUrl = new URL(`https://graph.facebook.com/${params.version}/debug_token`);
    debugUrl.searchParams.set('input_token', params.accessToken);
    debugUrl.searchParams.set('access_token', `${params.appId}|${params.appSecret}`);

    const debugRes = await params.fetchFn(debugUrl.toString(), { method: 'GET', cache: 'no-store' });
    if (debugRes.ok) {
      const debugData = (await debugRes.json()) as {
        data?: {
          granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
        };
      };
      const wabaScope = debugData.data?.granular_scopes?.find(
        (s) => s.scope === 'whatsapp_business_management' || s.scope === 'whatsapp_business_messaging',
      );
      wabaId = wabaScope?.target_ids?.[0] ?? '';
    }
  }

  if (!wabaId) {
    throw new Error('Não foi possível identificar a conta do WhatsApp Business (WABA) na Meta.');
  }

  if (!phoneNumberId) {
    const phonesUrl = `https://graph.facebook.com/${params.version}/${encodeURIComponent(wabaId)}/phone_numbers`;
    const phonesRes = await params.fetchFn(phonesUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.accessToken}` },
      cache: 'no-store',
    });
    if (phonesRes.ok) {
      const phonesData = (await phonesRes.json()) as {
        data?: Array<{ id?: string; display_phone_number?: string }>;
      };
      phoneNumberId = phonesData.data?.[0]?.id ?? '';
      displayPhoneNumber = phonesData.data?.[0]?.display_phone_number ?? null;
    }
  }

  if (!phoneNumberId) {
    throw new Error('Nenhum número de WhatsApp foi encontrado na conta conectada.');
  }

  return { wabaId, phoneNumberId, displayPhoneNumber };
}

/**
 * Fluxo 1-clique de Tech Provider (RonalDigital ISP Platform - App ID 172704712193909):
 * 1. Troca o `code` retornado pelo botão da Meta por um `access_token` permanente da WABA.
 * 2. Descobre automaticamente o `waba_id` e `phone_number_id` (se não vierem no evento da janela).
 * 3. Inscreve o App nos Webhooks da WABA (`POST /{waba_id}/subscribed_apps`).
 * 4. Criptografa o `access_token` com AES-256-GCM e persiste em `whatsapp_tenants`.
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

  // 2. Resolver WABA ID e Phone Number ID automaticamente caso não tenham vindo no evento postMessage
  const discovered = await discoverWabaAndPhone({
    accessToken: plainAccessToken,
    appId,
    appSecret,
    version,
    fetchFn,
    knownWabaId: input.wabaId,
    knownPhoneNumberId: input.phoneNumberId,
  });

  // 3. Inscrever o App nos Webhooks da WABA do cliente
  const subscribeUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(discovered.wabaId)}/subscribed_apps`;
  const subRes = await fetchFn(subscribeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${plainAccessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!subRes.ok) {
    const errText = await subRes.text().catch(() => '');
    throw new Error(`Falha ao inscrever WABA ${discovered.wabaId} nos webhooks: ${errText.slice(0, 200)}`);
  }

  // 4. Criptografar token e persistir no banco por cliente
  const encryptedAccessToken = encryptAccessToken(plainAccessToken, deps.encryptionKeyHex);

  return upsert({
    tenantId: input.tenantId?.trim() || 'liberato-motos-car',
    tenantName: input.tenantName?.trim() || STORE.name,
    wabaId: discovered.wabaId,
    whatsappPhoneNumberId: discovered.phoneNumberId,
    displayPhoneNumber: input.displayPhoneNumber?.trim() || discovered.displayPhoneNumber || STORE.phoneDisplay,
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
