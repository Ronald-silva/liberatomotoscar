'use client';

import { useActionState, useState } from 'react';
import { whatsappModes } from '@/server/attendance/mode-labels';
import type { AttendanceMode } from '@/server/attendance/settings';
import attendanceStyles from '../atendimento/attendance.module.css';
import { changeWhatsappMode, type ModeFormState } from '../atendimento/actions';

/**
 * Modo da Dayse no WhatsApp. Escolher não grava: abre uma confirmação que diz o que vai mudar, e
 * só o toque nela envia. Os radios ficam FORA do <form> (Enter num radio não confirma) e não há
 * campo `confirm` escondido: ele só existe como valor do botão tocado, igual ao modo escolhido.
 * Um campo fixo ou ligado ao radio deixaria a trava do servidor decorativa, como o antigo `confirm=yes`.
 */
export function WhatsappModeForm({ mode, version }: { mode: AttendanceMode; version: number }) {
  const [state, action, pending] = useActionState(changeWhatsappMode, { mode, version, message: null, error: false } satisfies ModeFormState);
  const [selected, setSelected] = useState<AttendanceMode>(mode);
  const chosen = whatsappModes.find((option) => option.value === selected);
  const changing = selected !== state.mode;
  // Sucesso só vale enquanto a escolha é o modo gravado; erro fica até a pessoa resolver.
  const message = state.message && (state.error || !changing) ? state.message : null;

  return <section aria-labelledby="modo-title" className={attendanceStyles.form}>
    <h2 id="modo-title">Atendimento da Dayse no WhatsApp</h2>
    <p className={attendanceStyles.current}>Define como a Dayse responde aos clientes que escrevem para a loja.</p>
    <fieldset className={attendanceStyles.choices} disabled={pending}>
      <legend>Modo da Dayse</legend>
      {whatsappModes.map((option) => <label key={option.value} className={attendanceStyles.choice}>
        <input type="radio" name="modo-escolhido" value={option.value} checked={selected === option.value}
          onChange={() => setSelected(option.value)} />
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
      </label>)}
    </fieldset>
    {changing && chosen ? <form action={action} className={attendanceStyles.form}>
      <p className={attendanceStyles.current} role="alert">
        Trocar para “{chosen.label}”? {chosen.description} Vale já para as próximas mensagens.
      </p>
      <input type="hidden" name="mode" value={selected} />
      <input type="hidden" name="version" value={state.version} />
      <button className={attendanceStyles.submit} type="submit" name="confirm" value={selected} disabled={pending}>
        {pending ? 'Trocando…' : `Sim, trocar para ${chosen.label}`}
      </button>
      <button className={attendanceStyles.secondaryButton} type="button" disabled={pending}
        onClick={() => setSelected(state.mode)}>Manter como está</button>
    </form> : null}
    {message ? <p className={state.error ? attendanceStyles.error : attendanceStyles.success} role={state.error ? 'alert' : 'status'}>{message}</p> : null}
  </section>;
}
