'use client';

import Image from 'next/image';
import { useActionState } from 'react';
import styles from '../../admin.module.css';
import { removeVehiclePhoto, type FormState } from './actions';
import { SubmitButton } from './SubmitButton';

export type GalleryPhoto = { id: string; url: string; isCover: boolean };
const initial: FormState = { message: null };

function RemoveForm({ vehicleId, version, imageId }: { vehicleId: string; version: number; imageId: string }) {
  const [state, action] = useActionState(removeVehiclePhoto, initial);
  return <form action={action} onSubmit={(event) => { if (!window.confirm('Remover esta foto?')) event.preventDefault(); }}>
    <input type="hidden" name="id" value={vehicleId} />
    <input type="hidden" name="version" value={version} />
    <input type="hidden" name="imageId" value={imageId} />
    <SubmitButton label="Remover" pendingLabel="Removendo..." />
    {state.message ? <p className={styles.notice} role="status">{state.message}</p> : null}
  </form>;
}

export function PhotoGallery({ vehicleId, version, photos }: { vehicleId: string; version: number; photos: GalleryPhoto[] }) {
  if (photos.length === 0) return <p className={styles.description}>Nenhuma foto ainda.</p>;
  return <ul className={styles.gallery}>
    {photos.map((photo, index) => <li key={photo.id} className={styles.galleryItem}>
      {/* Fotos privadas usam URL assinada de 60 s: sem otimizador, que exigiria host configurado. */}
      <Image className={styles.galleryImage} src={photo.url} alt={`Foto ${index + 1} do veículo`} width={640} height={480} sizes="(max-width: 640px) 100vw, 640px" unoptimized />
      {photo.isCover ? <span className={styles.badge}>Capa</span> : null}
      <RemoveForm vehicleId={vehicleId} version={version} imageId={photo.id} />
    </li>)}
  </ul>;
}
