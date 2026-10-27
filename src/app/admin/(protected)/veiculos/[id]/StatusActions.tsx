'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import styles from '../../../admin.module.css';
import { changeStatus, type FormState } from '../actions';
import { FormNotice } from '../FormNotice';
import { actionLabels, statusLabels, type VehicleStatus } from '../status';
import type { VehicleDraft } from './useVehicleDraft';

const initial: FormState = { message: null };

export function StatusActions({ vehicleId, draft, status, targets }: {
  vehicleId: string; draft: VehicleDraft; status: VehicleStatus; targets: VehicleStatus[];
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<VehicleStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const buttons = useRef(new Map<VehicleStatus, HTMLButtonElement>());
  const router = useRouter();
  const ordinary = targets.filter((target) => target !== 'archived' && (target !== 'published' || status !== 'draft'));

  async function change(target: VehicleStatus) {
    setBusy(true);
    setMessage(null);
    if (!await draft.saveBeforeAction()) { setBusy(false); setConfirming(null); return; }
    const state = await draft.enqueue((version) => {
      const data = new FormData();
      data.set('id', vehicleId);
      data.set('version', String(version));
      data.set('status', target);
      if (target === 'published') data.set('confirmAvailability', 'true');
      if (target === 'sold') data.set('confirmSale', 'true');
      return changeStatus(initial, data);
    }).catch((): FormState => ({ message: 'Não foi possível atualizar o anúncio. Tente de novo.' }));
    setBusy(false);
    setConfirming(null);
    setMessage(state.version === undefined ? state.message : null);
    if (state.version !== undefined) router.refresh();
  }

  function cancelConfirmation() {
    const target = confirming;
    setConfirming(null);
    if (target) buttons.current.get(target)?.focus();
  }

  return <section aria-labelledby="estado-title">
    <h2 id="estado-title" className={styles.subheading}>Situação: {statusLabels[status]}</h2>
    {ordinary.length > 0 ? <div className={styles.statusActions}>
      {ordinary.map((target) => <button key={target} className={`${styles.button} ${styles.buttonSecondary}`}
        ref={(node) => { if (node) buttons.current.set(target, node); else buttons.current.delete(target); }}
        type="button" disabled={busy} aria-expanded={target === 'sold' || target === 'published' ? confirming === target : undefined}
        aria-controls={confirming === target ? 'status-confirmation' : undefined}
        onClick={() => target === 'sold' || target === 'published' ? setConfirming(target) : void change(target)}>
        {busy ? 'Atualizando...' : target === 'published' ? 'Republicar' : actionLabels[target]}
      </button>)}
    </div> : null}
    {confirming ? <div id="status-confirmation" className={styles.statusActions}>
      <p className={styles.notice} role="alert">{confirming === 'sold'
        ? 'Confirmar venda? O anúncio sairá da lista de disponíveis e a página pública informará que foi vendido.'
        : 'A disponibilidade foi conferida com a loja? Republicar fará o veículo voltar à lista de disponíveis.'}</p>
      <button className={styles.button} type="button" disabled={busy} onClick={() => void change(confirming)}>
        {busy ? 'Atualizando...' : confirming === 'sold' ? 'Sim, marcar vendido' : 'Sim, republicar'}
      </button>
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy}
        onClick={cancelConfirmation}>Cancelar</button>
    </div> : null}
    <FormNotice message={message} vehicleId={vehicleId} role="alert" />
  </section>;
}
