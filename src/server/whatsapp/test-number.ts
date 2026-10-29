import { STORE } from '@/data/store';
import { and, desc, eq } from 'drizzle-orm';
import { ensureAttendanceTables } from '@/server/attendance/ensure-schema';
import { getDb } from '@/server/db/client';
import { whatsappTenants } from '@/server/db/schema';
import { decryptAccessToken, encryptAccessToken } from './crypto';
import { defaultUpsertTenant, listWhatsappTenants, type EmbeddedSignupDeps, type WhatsappTenantRow } from './embedded-signup';

export type RegisterTestNumberInput = {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
};

export type RegisterTestNumberDeps = Pick<EmbeddedSignupDeps, 'apiVersion' | 'encryptionKeyHex' | 'fetchImpl' | 'upsertTenant'> & {
  listTenants?: typeof listWhatsappTenants;
  webhookUrl?: string;
  webhookVerifyToken?: string;
};

export const TEST_TENANT_ID = 'liberato-motos-car-teste';
export const TEST_WEBHOOK_URL = 'https://liberatomotoscar.vercel.app/api/webhooks/whatsapp';

/** Diagnóstico de leitura: confirma se o token salvo ainda acessa o número de teste. */
export async function checkMetaTestNumberStatus(deps: {
  fetchImpl?: typeof fetch;
  loadTenant?: () => Promise<Pick<WhatsappTenantRow, 'encryptedAccessToken' | 'whatsappPhoneNumberId'> | null>;
  decryptToken?: (encrypted: string) => string;
  apiVersion?: string;
} = {}) {
  const loadTenant = deps.loadTenant ?? (async () => {
    await ensureAttendanceTables();
    const [row] = await getDb().select().from(whatsappTenants)
      .where(and(eq(whatsappTenants.tenantId, TEST_TENANT_ID), eq(whatsappTenants.isActive, true)))
      .orderBy(desc(whatsappTenants.updatedAt)).limit(1);
    return row ?? null;
  });
  const tenant = await loadTenant();
  if (!tenant) return { ok: false, message: 'Nenhum número de teste está cadastrado. Preencha os dados de API Setup abaixo.' };

  let token: string;
  try {
    token = (deps.decryptToken ?? decryptAccessToken)(tenant.encryptedAccessToken);
  } catch {
    return { ok: false, message: 'Não foi possível ler o token salvo. Cadastre um novo token de API Setup abaixo.' };
  }

  const version = (deps.apiVersion || process.env.META_GRAPH_API_VERSION || 'v21.0').trim();
  const response = await (deps.fetchImpl ?? fetch)(
    `https://graph.facebook.com/${version}/${tenant.whatsappPhoneNumberId}?fields=id`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  const data = (await response.json().catch(() => ({}))) as { id?: string; error?: { code?: number } };
  if (response.ok && data.id === tenant.whatsappPhoneNumberId) {
    return { ok: true, message: 'Token válido para o número de teste. Envie uma mensagem do celular verificado em “To” para testar a Dayse.' };
  }
  if (data.error?.code === 190) {
    return { ok: false, message: 'O token do número de teste expirou ou foi invalidado. Gere outro em WhatsApp → API Setup e salve abaixo.' };
  }
  const code = Number.isInteger(data.error?.code) ? `, código Meta ${data.error?.code}` : '';
  return { ok: false, message: `A Meta não confirmou o número de teste (HTTP ${response.status}${code}). Confira os IDs e as permissões em API Setup.` };
}

/**
 * Registra o número de teste gratuito da Meta (WhatsApp → API Setup) para validar a Dayse
 * sem conectar o número real da loja. Valida o token na Graph API, inscreve o app nos
 * webhooks da WABA de teste e salva o token criptografado como um tenant separado.
 */
export async function registerMetaTestNumber(input: RegisterTestNumberInput, deps: RegisterTestNumberDeps = {}) {
  const phoneNumberId = input.phoneNumberId.replace(/\D/g, '');
  const wabaId = input.wabaId.replace(/\D/g, '');
  const accessToken = input.accessToken.replace(/\s/g, '');
  if (!/^\d{10,25}$/.test(phoneNumberId)) throw new Error('Identificação do número de telefone inválida.');
  if (!/^\d{10,25}$/.test(wabaId)) throw new Error('Identificação da conta do WhatsApp Business inválida.');
  if (accessToken.length < 50) throw new Error('Token de acesso inválido. Copie o token completo em API Setup.');

  const version = (deps.apiVersion || process.env.META_GRAPH_API_VERSION || 'v21.0').trim();
  const fetchFn = deps.fetchImpl ?? fetch;
  const upsert = deps.upsertTenant ?? defaultUpsertTenant;
  const existingTenants = await (deps.listTenants ?? listWhatsappTenants)();
  if (existingTenants.some((tenant) => tenant.isActive && tenant.tenantId !== TEST_TENANT_ID &&
    (tenant.wabaId === wabaId || tenant.whatsappPhoneNumberId === phoneNumberId))) {
    throw new Error('Esta conta ou número já está conectado à loja. Use somente os IDs do número de teste da Meta.');
  }
  const renewingExistingNumber = existingTenants.some((tenant) => tenant.isActive &&
    tenant.tenantId === TEST_TENANT_ID && tenant.wabaId === wabaId &&
    tenant.whatsappPhoneNumberId === phoneNumberId);
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 1. Confirma que o token enxerga esse número (e obtém o número exibido)
  const phoneRes = await fetchFn(
    `https://graph.facebook.com/${version}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { method: 'GET', headers: auth, cache: 'no-store' },
  );
  const phoneData = (await phoneRes.json().catch(() => ({}))) as {
    display_phone_number?: string;
    error?: { code?: number; error_subcode?: number };
  };
  if (!phoneRes.ok) {
    if (phoneData.error?.code === 190) throw new Error('O token informado expirou ou é inválido. Gere um novo em API Setup.');
    const code = Number.isInteger(phoneData.error?.code) ? `, código Meta ${phoneData.error?.code}` : '';
    throw new Error(`A Meta recusou o token ou o número (HTTP ${phoneRes.status}${code}). Confira os dados em API Setup.`);
  }

  // Na renovação do mesmo número, o webhook já está inscrito. A validação do
  // phone_number_id com o token novo basta para trocar a credencial de envio.
  if (renewingExistingNumber) {
    return upsert({
      tenantId: TEST_TENANT_ID,
      tenantName: `${STORE.name} (Número de teste Meta)`,
      wabaId,
      whatsappPhoneNumberId: phoneNumberId,
      displayPhoneNumber: phoneData.display_phone_number ?? null,
      encryptedAccessToken: encryptAccessToken(accessToken, deps.encryptionKeyHex),
      coexistenceEnabled: false,
    });
  }

  // Confirma que o número pertence à WABA informada antes de inscrever o app nela.
  const phonesRes = await fetchFn(
    `https://graph.facebook.com/${version}/${wabaId}/phone_numbers?fields=id&limit=100`,
    { method: 'GET', headers: auth, cache: 'no-store' },
  );
  if (!phonesRes.ok) {
    throw new Error(`A Meta não confirmou a conta do WhatsApp Business (HTTP ${phonesRes.status}).`);
  }
  const phonesData = (await phonesRes.json()) as { data?: Array<{ id?: string }> };
  if (!phonesData.data?.some((phone) => phone.id === phoneNumberId)) {
    throw new Error('O número informado não pertence à conta do WhatsApp Business indicada. Confira os IDs em API Setup.');
  }

  // O callback global deste app atende o SalesNet. A WABA de teste precisa apontar
  // especificamente para a Dayse, sem alterar os demais clientes do app.
  const webhookUrl = deps.webhookUrl || process.env.WHATSAPP_WEBHOOK_CALLBACK_URL || TEST_WEBHOOK_URL;
  const webhookVerifyToken = deps.webhookVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  if (!webhookVerifyToken) throw new Error('Token de verificação do webhook não configurado no servidor.');
  if (new URL(webhookUrl).protocol !== 'https:') throw new Error('O webhook de teste precisa usar HTTPS.');

  // 2. Inscreve o app na WABA e configura o callback exclusivo do número de teste.
  const subscriptionUrl = `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`;
  const subRes = await fetchFn(subscriptionUrl, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  });
  if (!subRes.ok) {
    throw new Error(`Falha ao inscrever a conta de teste nos webhooks (HTTP ${subRes.status}). Confira as permissões do token.`);
  }
  const subscription = (await subRes.json().catch(() => ({}))) as { success?: boolean };
  if (subscription.success !== true) {
    throw new Error('A Meta não confirmou a inscrição da conta de teste nos webhooks.');
  }
  const overrideRes = await fetchFn(subscriptionUrl, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ override_callback_uri: webhookUrl, verify_token: webhookVerifyToken }),
  });
  if (!overrideRes.ok) {
    throw new Error(`Falha ao direcionar o webhook da conta de teste para a Dayse (HTTP ${overrideRes.status}).`);
  }
  const override = (await overrideRes.json().catch(() => ({}))) as { success?: boolean };
  if (override.success !== true) {
    throw new Error('A Meta não confirmou o callback exclusivo do número de teste.');
  }

  // 3. Salva criptografado como tenant de teste, separado da loja real
  return upsert({
    tenantId: TEST_TENANT_ID,
    tenantName: `${STORE.name} (Número de teste Meta)`,
    wabaId,
    whatsappPhoneNumberId: phoneNumberId,
    displayPhoneNumber: phoneData.display_phone_number ?? null,
    encryptedAccessToken: encryptAccessToken(accessToken, deps.encryptionKeyHex),
    coexistenceEnabled: false,
  });
}
