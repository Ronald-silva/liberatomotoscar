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

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '172704712193909';
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID || '';

export function WhatsAppOnboardingCard({ initialTenants }: { initialTenants: ConnectedTenant[] }) {
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
    if (window.FB) return;
    await new Promise<void>((resolve, reject) => {
      window.fbAsyncInit = () => {
        window.FB?.init({
          appId: META_APP_ID,
          autoLogAppEvents: true,
          xfbml: true,
          version: 'v21.0',
        });
        resolve();
      };
      const existing = document.getElementById('facebook-jssdk');
      if (existing) {
        resolve();
        return;
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
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      };

      if (META_CONFIG_ID) {
        loginOptions.config_id = META_CONFIG_ID;
      } else {
        loginOptions.scope = 'whatsapp_business_management,whatsapp_business_messaging';
      }

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
    <section aria-labelledby="whatsapp-onboarding-title" className={attendanceStyles.inboxSection}>
      <div className={attendanceStyles.inboxHeader}>
        <h2 id="whatsapp-onboarding-title">WhatsApp da Loja (Dayse)</h2>
      </div>
      <p className={attendanceStyles.intro}>
        Conecte o WhatsApp Business da Liberato Motos Car em 1 clique. O aplicativo no celular da loja continuará funcionando normalmente e, sempre que um vendedor responder pelo aparelho, a Dayse pausa sozinha naquela conversa.
      </p>

      <div className={attendanceStyles.choices}>
        {activeConnection ? (
          <div className={attendanceStyles.tenantItem}>
            <div>
              <strong className={attendanceStyles.success}>● WhatsApp Conectado</strong> ·{' '}
              <strong>{activeConnection.tenantName}</strong>{' '}
              {activeConnection.displayPhoneNumber ? `(${activeConnection.displayPhoneNumber})` : ''}
            </div>
            <div>Celular da loja + Dayse ativos</div>
          </div>
        ) : (
          <p className={attendanceStyles.current}>
            Status: <strong>Ainda não conectado</strong>. Clique no botão abaixo para abrir a janela oficial da Meta e conectar o WhatsApp da loja.
          </p>
        )}

        <div className={attendanceStyles.operatorButtons}>
          <button
            type="button"
            className={attendanceStyles.submit}
            disabled={busy}
            onClick={() => void handleOneClickConnect()}
          >
            {busy
              ? 'Conectando WhatsApp da loja…'
              : activeConnection
                ? 'Reconectar WhatsApp da Loja'
                : 'Conectar WhatsApp da Loja'}
          </button>
        </div>

        {statusMessage ? <p className={attendanceStyles.success}>{statusMessage}</p> : null}
        {errorMessage ? <p className={attendanceStyles.error}>{errorMessage}</p> : null}
      </div>
    </section>
  );
}
