'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from '../../../admin.module.css';
import { changeStatus, discardVehicleDraft, type FormState } from '../actions';
import { FormNotice } from '../FormNotice';
import type { VehicleDraft } from './useVehicleDraft';

const initial: FormState = { message: null };

export function DangerActions({ vehicleId, draft, canDiscard, archiveTargetAvailable }: {
  vehicleId: string; draft: VehicleDraft; canDiscard: boolean; archiveTargetAvailable: boolean;
}) {
  const [confirming, setConfirming] = useState<'archive' | 'discard' | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function execute() {
    if (!confirming) return;
    setBusy(true);
    if (!await draft.saveBeforeAction()) { setBusy(false); return; }
    const action = confirming === 'archive' ? changeStatus : discardVehicleDraft;
    const state = await draft.enqueue((version) => {
      const data = new FormData();
      data.set('id', vehicleId);
      data.set('version', String(version));
      if (confirming === 'archive') data.set('status', 'archived');
      return action(initial, data);
    }).catch((): FormState => ({ message: 'Não foi possível concluir esta ação. Tente de novo.' }));
    setBusy(false);
    if (state.version === undefined) { setMessage(state.message); return; }
    setConfirming(null);
    router.refresh();
  }

  if (!canDiscard && !archiveTargetAvailable) return null;
  return <section className={styles.dangerActions} aria-labelledby="gerenciar-anuncio-title">
    <h2 id="gerenciar-anuncio-title" className={styles.subheading}>Gerenciar anúncio</h2>
    <p className={styles.description}>Estas ações são opcionais e separadas da publicação.</p>
    {confirming ? <>
      <p className={styles.notice} role="alert">{confirming === 'discard'
        ? 'Excluir este rascunho? As fotos enviadas serão apagadas e esta ação não pode ser desfeita.'
        : 'Arquivar este anúncio? Ele sairá do catálogo público. Para voltar a publicar, abra o rascunho novamente.'}</p>
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy}
        onClick={() => void execute()}>{busy ? 'Aguarde...' : confirming === 'discard' ? 'Sim, excluir rascunho' : 'Sim, arquivar'}</button>
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy}
        onClick={() => setConfirming(null)}>Cancelar</button>
    </> : <>
      {archiveTargetAvailable ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button"
        onClick={() => setConfirming('archive')}>Arquivar</button> : null}
      {canDiscard ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button"
        onClick={() => setConfirming('discard')}>Excluir rascunho</button> : null}
    </>}
    <FormNotice message={message} vehicleId={vehicleId} />
  </section>;
}
