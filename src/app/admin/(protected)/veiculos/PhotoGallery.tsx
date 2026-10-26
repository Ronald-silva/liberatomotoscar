'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from '../../admin.module.css';
import { removeVehiclePhoto, setVehicleCover, type FormState } from './actions';
import { FormNotice } from './FormNotice';
import type { VehicleDraft } from './[id]/useVehicleDraft';

export type GalleryPhoto = { id: string; url: string | null; isCover: boolean };
const initial: FormState = { message: null };

function PhotoActions({ vehicleId, draft, photo }: { vehicleId: string; draft: VehicleDraft; photo: GalleryPhoto }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function act(action: typeof removeVehiclePhoto | typeof setVehicleCover) {
    setBusy(true);
    setMessage(null);
    const state = await draft.enqueue((version) => {
      const data = new FormData();
      data.set('id', vehicleId);
      data.set('version', String(version));
      data.set('imageId', photo.id);
      return action(initial, data);
    }).catch((): FormState => ({ message: 'Não foi possível atualizar esta foto. Tente de novo.' }));
    setBusy(false);
    if (state.version === undefined) { setMessage(state.message); return; }
    setConfirming(false);
    if (action === removeVehiclePhoto) draft.photoRemoved();
    router.refresh();
  }

  return <div className={styles.photoActions}>
    {!photo.isCover ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy}
      onClick={() => void act(setVehicleCover)}>Definir como capa</button> : <span className={styles.badge}>Capa</span>}
    {confirming ? <div>
      <p className={styles.notice} role="alert">Remover esta foto?</p>
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy}
        onClick={() => void act(removeVehiclePhoto)}>{busy ? 'Removendo...' : 'Sim, remover'}</button>
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy}
        onClick={() => setConfirming(false)}>Cancelar</button>
    </div> : <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy}
      onClick={() => setConfirming(true)}>Remover</button>}
    <FormNotice message={message} vehicleId={vehicleId} />
  </div>;
}

export function PhotoGallery({ vehicleId, draft, photos }: { vehicleId: string; draft: VehicleDraft; photos: GalleryPhoto[] }) {
  if (photos.length === 0) return <p className={styles.description}>Nenhuma foto ainda.</p>;
  return <ul className={styles.gallery}>
    {photos.map((photo, index) => <li key={photo.id} className={styles.galleryItem}>
      {photo.url
        ? <Image className={styles.galleryImage} src={photo.url} alt={`Foto ${index + 1} do veículo`} width={640} height={480} sizes="(max-width: 640px) 100vw, 640px" unoptimized />
        : <span className={styles.galleryEmpty} role="img" aria-label={`Foto ${index + 1} indisponível no momento`}>Foto indisponível</span>}
      <PhotoActions vehicleId={vehicleId} draft={draft} photo={photo} />
    </li>)}
  </ul>;
}
