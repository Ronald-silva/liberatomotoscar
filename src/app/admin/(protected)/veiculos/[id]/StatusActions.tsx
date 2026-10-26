'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const ordinary = targets.filter((target) => target !== 'published' && target !== 'archived');

  async function change(target: VehicleStatus) {
    setBusy(true);
    if (!await draft.saveBeforeAction()) { setBusy(false); return; }
    const state = await draft.enqueue((version) => {
      const data = new FormData();
      data.set('id', vehicleId);
      data.set('version', String(version));
      data.set('status', target);
      return changeStatus(initial, data);
    }).catch((): FormState => ({ message: 'Não foi possível atualizar o anúncio. Tente de novo.' }));
    setBusy(false);
    setMessage(state.version === undefined ? state.message : null);
    if (state.version !== undefined) router.refresh();
  }

  return <section aria-labelledby="estado-title">
    <h2 id="estado-title" className={styles.subheading}>Situação: {statusLabels[status]}</h2>
    {ordinary.length > 0 ? <div className={styles.statusActions}>
      {ordinary.map((target) => <button key={target} className={`${styles.button} ${styles.buttonSecondary}`}
        type="button" disabled={busy} onClick={() => void change(target)}>
        {busy ? 'Atualizando...' : actionLabels[target]}
      </button>)}
    </div> : null}
    <FormNotice message={message} vehicleId={vehicleId} />
  </section>;
}
