'use client';

import { useActionState, useState } from 'react';
import styles from '../../../admin.module.css';
import { changeStatus, type FormState } from '../actions';
import { SubmitButton } from '../SubmitButton';
import { actionLabels, statusLabels, type VehicleStatus } from '../status';

const initial: FormState = { message: null };

// `targets` vem do servidor, derivado de allowedStatusTransitions: a tela só oferece o que o serviço aceita.
export function StatusActions({ vehicleId, version, status, targets }: {
  vehicleId: string; version: number; status: VehicleStatus; targets: VehicleStatus[];
}) {
  const [state, action] = useActionState(changeStatus, initial);
  const [confirming, setConfirming] = useState(false);
  const hidden = <>
    <input type="hidden" name="id" value={vehicleId} />
    <input type="hidden" name="version" value={version} />
  </>;
  return <section aria-labelledby="estado-title">
    <h2 id="estado-title" className={styles.subheading}>Situação: {statusLabels[status]}</h2>
    {confirming ? <form className={styles.form} action={(data) => { setConfirming(false); action(data); }}>
      {hidden}
      <input type="hidden" name="status" value="published" />
      <input type="hidden" name="confirmAvailability" value="true" />
      <p className={styles.notice} role="alert">Este veículo está disponível para venda?</p>
      <SubmitButton label="Sim, publicar" pendingLabel="Publicando..." />
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setConfirming(false)}>Cancelar</button>
    </form> : <form className={styles.statusActions} action={action}>
      {hidden}
      {targets.map((target) => target === 'published'
        ? <button key={target} className={styles.button} type="button" onClick={() => setConfirming(true)}>{actionLabels[target]}</button>
        : <button key={target} className={`${styles.button} ${styles.buttonSecondary}`} type="submit" name="status" value={target}>{actionLabels[target]}</button>)}
    </form>}
    {state.message ? <p className={styles.notice} role="status">{state.message}</p> : null}
  </section>;
}
