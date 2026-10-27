'use client';

import { useActionState, useState } from 'react';
import { changeSiteMode, type ModeFormState } from './actions';
import attendanceStyles from './attendance.module.css';

const modes = [
  { value: 'disabled', label: 'Desativado', description: 'Nenhuma resposta automática para visitantes.' },
  { value: 'deterministic', label: 'Chatbot', description: 'Menu de estoque e encaminhamento, sem modelo de IA.' },
  { value: 'ai', label: 'IA', description: 'Atendimento com modelo, sujeito aos limites e à transferência humana.' },
] as const;

export function SiteModeForm({ mode, version }: { mode: ModeFormState['mode']; version: number }) {
  const [state, action, pending] = useActionState(changeSiteMode,
    { mode, version, message: null, error: false });
  const [selected, setSelected] = useState<ModeFormState['mode']>(mode);
  const [confirmed, setConfirmed] = useState(false);
  const currentMode = state.mode;

  return <form action={action} className={attendanceStyles.form}>
    <input type="hidden" name="version" value={state.version} />
    <fieldset className={attendanceStyles.choices} disabled={pending}>
      <legend>Modo do site</legend>
      {modes.map((item) => <label key={item.value} className={attendanceStyles.choice}>
        <input type="radio" name="mode" value={item.value} checked={selected === item.value}
          onChange={() => { setSelected(item.value); setConfirmed(false); }} />
        <span><strong>{item.label}</strong><small>{item.description}</small></span>
      </label>)}
    </fieldset>
    <p className={attendanceStyles.current}>Modo salvo: <strong>{modes.find((item) => item.value === currentMode)?.label}</strong></p>
    <label className={attendanceStyles.confirm}>
      <input type="checkbox" name="confirm" value="yes" checked={confirmed}
        onChange={(event) => setConfirmed(event.target.checked)} />
      Confirmo a mudança do modo de atendimento do site.
    </label>
    <button type="submit" className={attendanceStyles.submit} disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar modo do site'}
    </button>
    {state.message ? <p role="status" aria-live="polite" className={state.error ? attendanceStyles.error : attendanceStyles.success}>{state.message}</p> : null}
  </form>;
}
