import type { Metadata } from 'next';
import Link from 'next/link';
import { readAdminWhatsappSetting } from '@/server/attendance/settings';
import { listWhatsappTenants } from '@/server/whatsapp/embedded-signup';
import { TEST_TENANT_ID, TEST_WEBHOOK_URL } from '@/server/whatsapp/test-number';
import attendanceStyles from '../atendimento/attendance.module.css';
import { MetaTestNumberForm } from '../atendimento/MetaTestNumberForm';
import { WhatsAppOnboardingCard } from '../atendimento/WhatsAppOnboardingCard';
import { WhatsappModeForm } from './WhatsappModeForm';

export const metadata: Metadata = { title: 'Ajustes', robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const [tenants, setting] = await Promise.all([
    listWhatsappTenants().catch((error: unknown) => {
      console.error('Falha ao listar os números do WhatsApp', error);
      return null;
    }),
    // Sem a leitura não há versão para confirmar a troca: o controle some e a tela diz por quê.
    readAdminWhatsappSetting().catch((error: unknown) => {
      console.error('Falha ao ler o modo da Dayse', error);
      return null;
    }),
  ]);
  const connected = tenants ?? [];

  // Os IDs da Meta viajaram de atendimento/page.tsx sem alteração de comportamento.
  const rawAppId = (
    process.env.META_APP_ID ||
    process.env.NEXT_PUBLIC_META_APP_ID ||
    process.env.WHATSAPP_APP_ID ||
    ''
  )
    .replace(/['"\s]/g, '')
    .trim();
  const metaAppId =
    !rawAppId || rawAppId === '172704712193909' || !/^\d{15,20}$/.test(rawAppId)
      ? '1727047121923909'
      : rawAppId;

  const rawConfigId = (
    process.env.META_EMBEDDED_SIGNUP_CONFIG_ID ||
    process.env.NEXT_PUBLIC_META_CONFIG_ID ||
    process.env.META_CONFIG_ID ||
    ''
  )
    .replace(/['"\s]/g, '')
    .trim();
  const metaConfigId = !/^\d{10,25}$/.test(rawConfigId) ? '1590518199231570' : rawConfigId;
  const testTenant = connected.find((tenant) => tenant.tenantId === TEST_TENANT_ID && tenant.isActive);

  return <main id="conteudo" className={attendanceStyles.screen}>
    <div className={attendanceStyles.panel}>
      <Link href="/admin/atendimento" className={attendanceStyles.back}>Voltar às conversas</Link>
      <h1>Ajustes</h1>
      <p className={attendanceStyles.intro}>Como a Dayse atende no WhatsApp e qual número ela usa.</p>

      {setting
        ? <WhatsappModeForm mode={setting.mode} version={setting.version} />
        : <p className={attendanceStyles.error} role="alert">Não foi possível ler o modo da Dayse agora. Recarregue a página para tentar de novo.</p>}

      {tenants === null ? <p className={attendanceStyles.error} role="alert">Não foi possível listar os números conectados agora. Recarregue a página.</p> : null}
      <WhatsAppOnboardingCard
        initialTenants={connected.filter((tenant) => tenant.tenantId !== TEST_TENANT_ID)}
        metaAppId={metaAppId}
        metaConfigId={metaConfigId}
      />

      <MetaTestNumberForm
        webhookUrl={process.env.WHATSAPP_WEBHOOK_CALLBACK_URL || TEST_WEBHOOK_URL}
        currentTestNumber={testTenant?.displayPhoneNumber ?? testTenant?.whatsappPhoneNumberId ?? null}
        phoneNumberId={testTenant?.whatsappPhoneNumberId ?? null}
        wabaId={testTenant?.wabaId ?? null}
        hasEnvTestCredentials={Boolean(process.env.WHATSAPP_TOKEN?.trim() &&
          process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() && process.env.WHATSAPP_WEBHOOK_CALLBACK_URL?.trim())}
      />
    </div>
  </main>;
}
