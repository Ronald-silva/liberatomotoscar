'use client';

import Image from 'next/image';
import { useActionState, useState } from 'react';
import styles from '../../admin.module.css';
import { removeVehiclePhoto, type FormState } from './actions';
import { SubmitButton } from './SubmitButton';

export type GalleryPhoto = { id: string; url: string; isCover: boolean };
const initial: FormState = { message: null };

function RemoveForm({ vehicleId, version, imageId }: { vehicleId: string; version: number; imageId: string }) {
  const [state, action] = useActionState(removeVehiclePhoto, initial);
  const [confirming, setConfirming] = useState(false);
  return <div>
    {confirming ? <form className={styles.form} action={(data) => { setConfirming(false); action(data); }}>
      <input type="hidden" name="id" value={vehicleId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="imageId" value={imageId} />
      <p className={styles.notice} role="alert">Remover esta foto?</p>
      <SubmitButton label="Sim, remover" pendingLabel="Removendo..." />
      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setConfirming(false)}>Cancelar</button>
    </form> : <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setConfirming(true)}>Remover</button>}
    {state.message ? <p className={styles.notice} role="status">{state.message}</p> : null}
  </div>;
}

export function PhotoGallery({ vehicleId, version, photos }: { vehicleId: string; version: number; photos: GalleryPhoto[] }) {
  if (photos.length === 0) return <p className={styles.description}>Nenhuma foto ainda.</p>;
  return <ul className={styles.gallery}>
    {photos.map((photo, index) => <li key={photo.id} className={styles.galleryItem}>
      {/* Fotos privadas usam URL assinada: sem otimizador, que exigiria host configurado. */}
      <Image className={styles.galleryImage} src={photo.url} alt={`Foto ${index + 1} do veículo`} width={640} height={480} sizes="(max-width: 640px) 100vw, 640px" unoptimized />
      {photo.isCover ? <span className={styles.badge}>Capa</span> : null}
      <RemoveForm vehicleId={vehicleId} version={version} imageId={photo.id} />
    </li>)}
  </ul>;
}
