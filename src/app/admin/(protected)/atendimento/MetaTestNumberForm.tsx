'use client';

import { useActionState } from 'react';
import { connectMetaTestNumber, type TestNumberState } from './actions';
import attendanceStyles from './attendance.module.css';

const initialState: TestNumberState = { message: null, error: false };

/** Conecta o número de teste gratuito da Meta para validar a Dayse sem usar o número real da loja. */
export function MetaTestNumberForm({ webhookUrl, currentTestNumber }: { webhookUrl: string; currentTestNumber: string | null }) {
  const [state, action, pending] = useActionState(connectMetaTestNumber, initialState);

  return (
    <details className={attendanceStyles.history}>
      <summary>🧪 Testar a Dayse com o número de teste da Meta (sem usar o número da loja)</summary>
      {currentTestNumber ? <p className={attendanceStyles.current}>Número de teste registrado: <strong>{currentTestNumber}</strong>.</p> : null}
      <p className={attendanceStyles.current}>
        Em developers.facebook.com → seu app → <strong>WhatsApp → API Setup</strong>, copie os três dados abaixo e
        cadastre o seu celular em “To”. Use apenas os IDs do número de teste, sem informar os dados da loja.
        Em <strong>WhatsApp → Configuration</strong>, configure o callback
        <strong> {webhookUrl}</strong> com o token de verificação
        do servidor e assine o campo <strong>messages</strong>. O token temporário da Meta expira; quando isso
        acontecer, gere outro em API Setup e registre novamente aqui.
      </p>
      <form action={action} className={attendanceStyles.form}>
        <div className={attendanceStyles.fieldGrid}>
          <label className={attendanceStyles.fieldLabel}>
            Phone number ID
            <input name="phoneNumberId" inputMode="numeric" required className={attendanceStyles.textInput} autoComplete="off" />
          </label>
          <label className={attendanceStyles.fieldLabel}>
            WhatsApp Business Account ID
            <input name="wabaId" inputMode="numeric" required className={attendanceStyles.textInput} autoComplete="off" />
          </label>
        </div>
        <label className={attendanceStyles.fieldLabel}>
          Token de acesso (temporário ou de usuário do sistema)
          <input name="accessToken" type="password" required className={attendanceStyles.textInput} autoComplete="off" />
        </label>
        <button type="submit" className={attendanceStyles.submit} disabled={pending}>
          {pending ? 'Conectando…' : 'Conectar número de teste'}
        </button>
        {state.message ? (
          <p role="status" aria-live="polite" className={state.error ? attendanceStyles.error : attendanceStyles.success}>
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
