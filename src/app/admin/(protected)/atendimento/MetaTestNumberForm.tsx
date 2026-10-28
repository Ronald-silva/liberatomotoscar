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
        O cadastro direciona somente a conta de teste para <strong>{webhookUrl}</strong>.
        O callback global do app atende outros projetos e não deve ser alterado para este teste.
        O token temporário da Meta expira. Para renová-lo, gere outro em API Setup, preencha novamente os mesmos IDs
        e salve o novo token aqui.
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
          {pending ? 'Salvando…' : currentTestNumber ? 'Atualizar token do número de teste' : 'Conectar número de teste'}
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
