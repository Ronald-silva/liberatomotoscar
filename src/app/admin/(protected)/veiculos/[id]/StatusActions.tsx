'use client';

import { useActionState, useState } from 'react';
import styles from '../../../admin.module.css';
import { changeStatus, type FormState } from '../actions';
import { FormNotice } from '../FormNotice';
import { SubmitButton } from '../SubmitButton';
import { actionLabels, statusLabels, type VehicleStatus } from '../status';

const initial: FormState = { message: null };

// `targets` vem do servidor, derivado de allowedStatusTransitions: a tela só oferece o que o
// serviço aceita. `publishBlocked` traz o que falta para publicar, pela mesma regra que o
// serviço usa — o botão fica desabilitado com o motivo à vista, em vez de recusar depois do toque.
export function StatusActions({ vehicleId, version, status, targets, publishBlocked = [] }: {
  vehicleId: string; version: number; status: VehicleStatus; targets: VehicleStatus[]; publishBlocked?: readonly string[];
}) {
  const [state, action] = useActionState(changeStatus, initial);
  const [confirming, setConfirming] = useState(false);
  const [seen, setSeen] = useState(state);
  // O formulário de confirmação fica montado durante o envio (para o botão mostrar "Publicando...")
  // e só fecha quando chega o resultado da action.
  if (seen !== state) { setSeen(state); setConfirming(false); }
  const hidden = <>
    <input type="hidden" name="id" value={vehicleId} />
    <input type="hidden" name="version" value={version} />
  </>;
  return <section aria-labelledby="estado-title">
    <h2 id="estado-title" className={styles.subheading}>Situação: {statusLabels[status]}</h2>
    {confirming ? <form className={styles.form} action={action}>
      {hidden}
      <input type="hidden" name="status" value="published" />
      <input type="hidden" name="confirmAvailability" value="true" />
      <p className={styles.notice} role="alert">Este veículo está disponível para venda?</p>
      <SubmitButton label="Sim, publicar" pendingLabel="Publicando..." />
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setConfirming(false)}>Cancelar</button>
    </form> : <form className={styles.statusActions} action={action}>
      {hidden}
      {targets.map((target) => target === 'published'
        ? <button key={target} className={styles.button} type="button" disabled={publishBlocked.length > 0}
          aria-describedby={publishBlocked.length > 0 ? 'publicar-bloqueado' : undefined}
          onClick={() => setConfirming(true)}>{actionLabels[target]}</button>
        : <SubmitButton key={target} secondary name="status" value={target} label={actionLabels[target]} pendingLabel="Atualizando..." />)}
      {publishBlocked.length > 0 ? <p id="publicar-bloqueado" className={styles.chipHint}>
        Para publicar, complete: {publishBlocked.join(', ')}.
      </p> : null}
    </form>}
    <FormNotice message={state.message} vehicleId={vehicleId} />
  </section>;
}
