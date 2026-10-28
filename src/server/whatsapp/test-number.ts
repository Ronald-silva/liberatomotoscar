import { STORE } from '@/data/store';
import { encryptAccessToken } from './crypto';
import { defaultUpsertTenant, listWhatsappTenants, type EmbeddedSignupDeps } from './embedded-signup';

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
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 1. Confirma que o token enxerga esse número (e obtém o número exibido)
  const phoneRes = await fetchFn(
    `https://graph.facebook.com/${version}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { method: 'GET', headers: auth, cache: 'no-store' },
  );
  const phoneData = (await phoneRes.json().catch(() => ({}))) as {
    display_phone_number?: string;
  };
  if (!phoneRes.ok) {
    throw new Error(`A Meta recusou o token ou o número (HTTP ${phoneRes.status}). Confira os dados em API Setup.`);
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
