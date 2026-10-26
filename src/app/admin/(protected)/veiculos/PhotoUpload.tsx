'use client';

import { useRef, useState } from 'react';
import styles from '../../admin.module.css';
import { addVehiclePhoto, type FormState } from './actions';
import { FormNotice } from './FormNotice';

const MAX_SIDE = 1920;
const QUALITY = 0.82;
// O corpo leva a foto MAIS os campos do formulário e o limite do servidor é 4 MB (next.config.ts).
// 3,5 MB deixa folga para esses bytes extras: a checagem do cliente sempre dispara antes do servidor.
const MAX_BYTES = 3.5 * 1024 * 1024;
const TOO_BIG = 'A foto ficou grande demais para enviar. Tente uma foto menor ou com menos detalhes.';
const BAD_FILE = 'Não foi possível preparar esta foto. Tente outra.';
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

/**
 * Várias fotos num gesto só.
 *
 * Antes era uma por envio: seis fotos eram seis toques e seis esperas. Aqui a pessoa escolhe
 * todas de uma vez e o envio segue em fila, mostrando em qual está. Cada foto incrementa a versão
 * do veículo, então a action devolve a versão nova e a próxima foto já vai com ela — sem isso a
 * segunda seria recusada por "anúncio alterado".
 *
 * Sem `capture`: forçar a câmera impedia escolher fotos já tiradas, que é o caso comum de quem
 * fotografa o veículo antes de sentar para cadastrar.
 */
export function PhotoUpload({ vehicleId, version }: { vehicleId: string; version: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function send(file: File, atVersion: number): Promise<FormState> {
    const data = new FormData();
    data.set('id', vehicleId);
    data.set('version', String(atVersion));
    data.set('photo', file);
    // A action ignora o estado anterior; ele existe na assinatura por causa de useActionState.
    return addVehiclePhoto(initial, data);
  }

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setMessage(null);
    let current = version;
    let sent = 0;
    let failure: string | null = null;

    for (const [index, file] of files.entries()) {
      setBusy(files.length > 1 ? `Enviando foto ${index + 1} de ${files.length}...` : 'Enviando a foto...');
      let photo: File;
      try {
        photo = await shrink(file);
      } catch (error) {
        failure = error instanceof Error && error.message === 'grande' ? TOO_BIG : BAD_FILE;
        break;
      }
      const state = await send(photo, current);
      // Sem versão nova, a foto não entrou: a mensagem da action diz por quê.
      if (state.version === undefined) { failure = state.message; break; }
      current = state.version;
      sent += 1;
    }

    setBusy(null);
    if (input.current) input.current.value = '';
    const done = sent === 0 ? null : sent === 1 ? 'Foto adicionada.' : `${sent} fotos adicionadas.`;
    setMessage(failure && done ? `${done} A seguinte não deu: ${failure}` : failure ?? done);
  }

  return <div className={styles.form}>
    <label className={`${styles.button} ${styles.uploadLabel} ${busy ? styles.buttonDisabled : ''}`} aria-disabled={busy !== null}>
      {busy ?? 'Adicionar fotos'}
      <input ref={input} className={styles.visuallyHidden} type="file" accept="image/*" multiple
        disabled={busy !== null} onChange={onChange} />
    </label>
    <p className={styles.chipHint}>Pode escolher várias de uma vez. A primeira vira a capa do anúncio.</p>
    <FormNotice message={message} vehicleId={vehicleId} />
  </div>;
}
