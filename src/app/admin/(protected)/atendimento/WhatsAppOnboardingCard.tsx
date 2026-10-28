'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import attendanceStyles from './attendance.module.css';

type ConnectedTenant = {
  id: string;
  tenantId: string;
  tenantName: string;
  wabaId: string;
  whatsappPhoneNumberId: string;
  displayPhoneNumber: string | null;
  coexistenceEnabled: boolean;
  isActive: boolean;
};

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>,
      ) => void;
    };
  }
}

const OFFICIAL_META_APP_ID = '1727047121923909';
const OFFICIAL_CONFIG_ID = '1590518199231570';

function sanitizeAppId(value?: string): string {
  const clean = (value ?? '').replace(/['"\s]/g, '').trim();
  if (!clean || clean === '172704712193909' || !/^\d{15,20}$/.test(clean)) {
    return OFFICIAL_META_APP_ID;
  }
  return clean;
}

function sanitizeConfigId(value?: string): string {
  const clean = (value ?? '').replace(/['"\s]/g, '').trim();
  if (!/^\d{10,25}$/.test(clean)) {
    return OFFICIAL_CONFIG_ID;
  }
  return clean;
}

const DEFAULT_META_APP_ID = sanitizeAppId(process.env.NEXT_PUBLIC_META_APP_ID);
const DEFAULT_CONFIG_ID = sanitizeConfigId(process.env.NEXT_PUBLIC_META_CONFIG_ID);

function WhatsAppLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.82 14.01c-.24.68-1.41 1.3-1.95 1.38-.5.08-1.13.11-1.83-.11-.42-.13-.97-.31-1.67-.61-2.94-1.27-4.86-4.25-5.01-4.45-.15-.2-1.2-1.59-1.2-3.04 0-1.45.76-2.16 1.03-2.46.27-.3.59-.37.79-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.24.59.82 2.01.89 2.16.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.61.17.3.76 1.26 1.64 2.04 1.13 1 2.08 1.31 2.38 1.46.3.15.47.12.64-.07.17-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.73.82 2.03.97.3.15.5.22.57.35.07.12.07.72-.17 1.4z" />
    </svg>
  );
}

export function WhatsAppOnboardingCard({
  initialTenants,
  metaAppId = DEFAULT_META_APP_ID,
  metaConfigId = DEFAULT_CONFIG_ID,
}: {
  initialTenants: ConnectedTenant[];
  metaAppId?: string;
  metaConfigId?: string;
}) {
  const router = useRouter();
  const [tenants, setTenants] = useState<ConnectedTenant[]>(initialTenants);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionInfoRef = useRef<{ waba_id?: string; phone_number_id?: string }>({});

  useEffect(() => {
    function handleMetaMessage(event: MessageEvent) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
        return;
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA')) {
          sessionInfoRef.current = {
            waba_id: data.data?.waba_id,
            phone_number_id: data.data?.phone_number_id,
          };
        }
      } catch {
        // Ignora mensagens de terceiros
      }
    }

    window.addEventListener('message', handleMetaMessage);
    return () => window.removeEventListener('message', handleMetaMessage);
  }, []);

  async function ensureFacebookSdk(): Promise<void> {
    const validAppId = sanitizeAppId(metaAppId);
    if (window.FB) {
      window.FB.init({
        appId: validAppId,
        autoLogAppEvents: true,
        xfbml: false,
        version: 'v21.0',
      });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      window.fbAsyncInit = () => {
        window.FB?.init({
          appId: validAppId,
          autoLogAppEvents: true,
          xfbml: false,
          version: 'v21.0',
        });
        resolve();
      };
      const existing = document.getElementById('facebook-jssdk');
      if (existing) {
        existing.remove();
      }
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Não foi possível abrir a janela da Meta. Verifique sua conexão.'));
      document.body.appendChild(script);
    });
  }

  async function finishAutomaticConnection(code: string) {
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const response = await fetch('/api/whatsapp/embedded-signup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          wabaId: sessionInfoRef.current.waba_id,
          phoneNumberId: sessionInfoRef.current.phone_number_id,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Não foi possível concluir a conexão com o WhatsApp.');
      }
      setStatusMessage('Pronto! O WhatsApp da loja foi conectado à Dayse com sucesso.');
      const listRes = await fetch('/api/whatsapp/embedded-signup', { credentials: 'same-origin' });
      if (listRes.ok) {
        const listData = (await listRes.json()) as { tenants?: ConnectedTenant[] };
        if (listData.tenants) setTenants(listData.tenants);
      }
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao conectar WhatsApp.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOneClickConnect() {
    setErrorMessage(null);
    setStatusMessage(null);
    sessionInfoRef.current = {};

    try {
      await ensureFacebookSdk();

      const loginOptions: Record<string, unknown> = {
        config_id: sanitizeConfigId(metaConfigId),
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          version: 'v4',
        },
      };

      window.FB?.login((response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setErrorMessage('A janela da Meta foi fechada antes de concluir a conexão.');
          return;
        }
        void finishAutomaticConnection(code);
      }, loginOptions);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível iniciar a conexão com a Meta.');
    }
  }

  const activeConnection = tenants[0] ?? null;

  return (
    <section aria-labelledby="whatsapp-onboarding-title" className={attendanceStyles.whatsappCard}>
      <div className={attendanceStyles.whatsappCardInfo}>
        <h2 id="whatsapp-onboarding-title" className={attendanceStyles.whatsappCardTitle}>
          <span className={attendanceStyles.whatsappBadgeIcon}>
            <WhatsAppLogo size={20} />
          </span>
          WhatsApp da Loja · Dayse
        </h2>
        {activeConnection ? (
          <p className={attendanceStyles.current}>
            <strong className={attendanceStyles.success}>● Conectado</strong> ·{' '}
            <strong>{activeConnection.tenantName}</strong>{' '}
            {activeConnection.displayPhoneNumber ? `(${activeConnection.displayPhoneNumber})` : ''} — Celular da loja e Dayse funcionando juntos.
          </p>
        ) : (
          <p className={attendanceStyles.current}>
            Conecte o WhatsApp Business da loja em 1 clique. O aplicativo no celular continua funcionando normalmente e, quando você responder pelo aparelho, a Dayse pausa sozinha.
          </p>
        )}
        {statusMessage ? <p className={attendanceStyles.success}>{statusMessage}</p> : null}
        {errorMessage ? <p className={attendanceStyles.error}>{errorMessage}</p> : null}
      </div>

      <button
        type="button"
        className={attendanceStyles.whatsappConnectBtn}
        disabled={busy}
        onClick={() => void handleOneClickConnect()}
      >
        <WhatsAppLogo size={20} />
        {busy
          ? 'Conectando ao WhatsApp…'
          : activeConnection
            ? 'Reconectar WhatsApp'
            : 'Conectar com WhatsApp'}
      </button>
    </section>
  );
}
