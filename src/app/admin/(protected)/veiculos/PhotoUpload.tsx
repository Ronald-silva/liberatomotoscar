'use client';

import { startTransition, useActionState, useRef, useState } from 'react';
import styles from '../../admin.module.css';
import { addVehiclePhoto, type FormState } from './actions';

const MAX_SIDE = 1920;
const QUALITY = 0.82;
// Limite de corpo da Vercel é 4,5 MB; a margem cobre o restante do formulário.
const MAX_BYTES = 4 * 1024 * 1024;
const TOO_BIG = 'A foto ficou grande demais para enviar. Tente uma foto menor ou com menos detalhes.';
const initial: FormState = { message: null };

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  }
}

// Foto de câmera (3 a 8 MB) estoura o limite de corpo da Vercel; reduz antes de enviar. O resultado é sempre JPEG.
async function shrink(file: File): Promise<File> {
  const image = await decode(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('toBlob');
    if (blob.size > MAX_BYTES) throw new Error('grande');
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
  } finally {
    image.release();
  }
}

export function PhotoUpload({ vehicleId, version }: { vehicleId: string; version: number }) {
  const [state, action, sending] = useActionState(addVehiclePhoto, initial);
  const [preparing, setPreparing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = preparing || sending;

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLocalError(null);
    setPreparing(true);
    try {
      const photo = await shrink(file);
      const data = new FormData();
      data.set('id', vehicleId);
      data.set('version', String(version));
      data.set('photo', photo);
      startTransition(() => action(data));
    } catch (error) {
      setLocalError(error instanceof Error && error.message === 'grande' ? TOO_BIG : 'Não foi possível preparar esta foto. Tente outra.');
    } finally {
      setPreparing(false);
      if (input.current) input.current.value = '';
    }
  }

  const message = localError ?? state.message;
  return <div className={styles.form}>
    <label className={`${styles.button} ${styles.uploadLabel} ${busy ? styles.buttonDisabled : ''}`} aria-disabled={busy}>
      {preparing ? 'Preparando a foto...' : sending ? 'Enviando a foto...' : 'Tirar ou escolher foto'}
      <input ref={input} className={styles.visuallyHidden} type="file" accept="image/*" capture="environment" disabled={busy} onChange={onChange} />
    </label>
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
  </div>;
}
