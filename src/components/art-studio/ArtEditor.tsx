'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import type Konva from 'konva';
import styles from '@/app/admin/admin.module.css';
import artStyles from './art-studio.module.css';
import { artFormats, templatesForStatus, type ArtFormat, type ArtTemplate } from './templates';

const ArtCanvas = dynamic(() => import('./ArtCanvas'), { ssr: false,
  loading: () => <p role="status">Preparando a prévia da arte…</p> });

type ArtVehicle = { id: string; version: number; status: string; title: string; year: number | null;
  price: string; slug: string };

export function ArtEditor({ vehicle, photos, phone, exportProblem }: {
  vehicle: ArtVehicle; photos: { id: string; isCover: boolean }[]; phone: string; exportProblem: string | null;
}) {
  const choices = templatesForStatus(vehicle.status);
  const [format, setFormat] = useState<ArtFormat>('feed');
  const [template, setTemplate] = useState<ArtTemplate>(choices[0].id);
  const [photoId, setPhotoId] = useState(photos.find((photo) => photo.isCover)?.id ?? photos[0]?.id ?? '');
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [note, setNote] = useState('');
  const [noteApproved, setNoteApproved] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const onPhotoLoad = useCallback((loaded: boolean) => setPhotoLoaded(loaded), []);
  const photoUrl = photoId ? `/api/admin/vehicles/${vehicle.id}/art-photo/${photoId}` : null;
  const canCrop = format !== 'story' && format !== 'tiktok' && template !== 'classic';
  const defaultNote = vehicle.status === 'sold' ? 'Peça opções semelhantes no WhatsApp' :
    vehicle.status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp' : 'Consulte disponibilidade e condições';

  async function download(type: 'png' | 'jpeg') {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (note.trim() && !noteApproved) throw new Error('Revise e confirme o texto auxiliar antes de baixar.');
      const response = await fetch(`/api/admin/vehicles/${vehicle.id}/art-check?version=${vehicle.version}`, { cache: 'no-store' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível conferir o anúncio. Tente de novo.');
      if (!photoLoaded || !stageRef.current) throw new Error('A foto ainda não carregou. Aguarde ou escolha outra foto.');
      await document.fonts.ready;
      const blob = await stageRef.current.toBlob({ mimeType: `image/${type}`, quality: 0.92, pixelRatio: 1 });
      if (!blob) throw new Error('Não foi possível gerar a arte neste aparelho.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `liberato-${vehicle.slug}-${format}.${type === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Arte ${type === 'jpeg' ? 'JPEG' : 'PNG'} pronta para baixar. Confira antes de publicar.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar a arte. Tente de novo.');
    } finally { setBusy(false); }
  }

  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <div className={artStyles.editor}>
      <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact} ${artStyles.backLink}`} href={`/admin/veiculos/${vehicle.id}`}>Voltar ao veículo</Link>
      <h1 id="art-options-title" className={styles.heading}>Criar arte</h1>
      <p className={styles.description}>{vehicle.title} · {vehicle.price}</p>
      {exportProblem ? <p className={artStyles.warning} role="status">Prévia disponível. Para baixar: {exportProblem}</p> : null}
      <div className={artStyles.layout}>
        <div className={artStyles.controls}>
          <fieldset className={artStyles.group}>
            <legend>1. Formato</legend>
            <div className={`${artStyles.options} ${artStyles.formats}`}>{Object.entries(artFormats).map(([key, value]) =>
              <button key={key} type="button" className={artStyles.option} aria-pressed={format === key}
                onClick={() => setFormat(key as ArtFormat)}>{value.label}<small>{value.width} × {value.height}</small></button>)}</div>
            <p className={artStyles.hint}>Textos e marca ficam dentro da área central nos formatos verticais. Confira a prévia no aplicativo antes de publicar.</p>
            {format === 'story' ? <p className={artStyles.hint}>Esta saída é uma imagem para Stories. Reels em vídeo exigem edição separada.</p> : null}
            {format === 'tiktok' ? <p className={artStyles.hint}>Esta saída é uma foto para postagem. Anúncios em carrossel exigem mais imagens e conferência no TikTok Ads Manager.</p> : null}
          </fieldset>
          <fieldset className={artStyles.group}>
            <legend>2. Foto</legend>
            {photos.length === 0 ? <p>Adicione uma foto no cadastro para montar a peça.</p> :
              <div className={artStyles.photos}>{photos.map((photo, index) =>
                <button key={photo.id} type="button" className={artStyles.photoOption} aria-pressed={photoId === photo.id}
                  onClick={() => { setPhotoLoaded(false); setPhotoId(photo.id); }}>
                  {/* A imagem já pertence ao anúncio e passa pela rota autenticada. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/admin/vehicles/${vehicle.id}/art-photo/${photo.id}`} alt="" />
                  <span>Foto {index + 1}{photo.isCover ? ' · capa' : ''}</span>
                </button>)}</div>}
            <label className={artStyles.slider}>Enquadramento horizontal
              <input type="range" min="0" max="100" value={focalX} disabled={!canCrop}
                onChange={(event) => setFocalX(Number(event.target.value))} /></label>
            <label className={artStyles.slider}>Enquadramento vertical
              <input type="range" min="0" max="100" value={focalY} disabled={!canCrop}
                onChange={(event) => setFocalY(Number(event.target.value))} /></label>
            {!canCrop ? <p className={artStyles.hint}>Neste formato a foto aparece inteira para evitar cortes no veículo.</p> : null}
          </fieldset>
          <fieldset className={artStyles.group}>
            <legend>3. Modelo e texto</legend>
            <div className={`${artStyles.options} ${artStyles.templates}`}>{choices.map((choice) =>
              <button key={choice.id} type="button" className={artStyles.option} aria-pressed={template === choice.id}
                onClick={() => setTemplate(choice.id)}>{choice.label}</button>)}</div>
            {template === 'offer' ? <p className={artStyles.hint}>Este modelo mostra apenas o preço do cadastro. Desconto e validade não são anunciados sem aprovação.</p> : null}
            <label className={`${styles.field} ${artStyles.noteField}`}>Texto auxiliar opcional
              <input className={styles.input} type="text" maxLength={50} value={note}
                onChange={(event) => { setNote(event.target.value); setNoteApproved(false); }} placeholder={defaultNote} /></label>
            {note.trim() ? <label className={artStyles.confirmNote}>
              <input type="checkbox" checked={noteApproved} onChange={(event) => setNoteApproved(event.target.checked)} />
              Confirmei que o texto auxiliar está correto e autorizado.
            </label> : null}
            <p className={artStyles.hint}>Marca, modelo, ano e preço vêm do cadastro. Revise o texto auxiliar antes de publicar.</p>
          </fieldset>
          <a className={`${styles.button} ${styles.buttonSecondary} ${artStyles.mobileJump}`} href="#art-preview-title">Ver prévia da arte</a>
        </div>
        <section className={artStyles.preview} aria-labelledby="art-preview-title">
          <h2 id="art-preview-title">4. Conferir e baixar</h2>
          <p className={artStyles.hint}>Prévia no formato escolhido. O arquivo mantém a dimensão indicada acima.</p>
          <ArtCanvas format={format} template={template} photoUrl={photoUrl} title={vehicle.title}
            year={vehicle.year} price={vehicle.price} phone={phone} status={vehicle.status} note={note}
            focalX={focalX} focalY={focalY} stageRef={stageRef} onPhotoLoad={onPhotoLoad} />
          <div className={artStyles.downloads}>
            <button className={styles.button} type="button" disabled={busy || Boolean(exportProblem)} onClick={() => void download('png')}>
              {busy ? 'Conferindo anúncio…' : 'Baixar PNG'}</button>
            <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy || Boolean(exportProblem)} onClick={() => void download('jpeg')}>Baixar JPEG</button>
          </div>
          <p className={artStyles.hint} role="status" aria-live="polite">{message}</p>
          <a className={`${styles.button} ${styles.buttonSecondary} ${artStyles.mobileJump}`} href="#art-options-title">Alterar opções</a>
        </section>
      </div>
    </div>
  </main>;
}
