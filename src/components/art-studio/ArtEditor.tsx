'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type Konva from 'konva';
import styles from '@/app/admin/admin.module.css';
import artStyles from './art-studio.module.css';
import { createCaption, PLATFORM_LABELS,
  type CaptionVehicle, type SocialPlatform } from './caption';
import { checkVersion, deliverArt, runArtDelivery } from './share-art';
import { artFormats, templatesForStatus, type ArtFormat, type ArtTemplate } from './templates';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ArtCanvas = dynamic(() => import('./ArtCanvas'), { ssr: false,
  loading: () => <p role="status">Preparando a prévia da arte…</p> });

type ArtVehicle = CaptionVehicle & { id: string; version: number; slug: string };

const formatLabels: Record<ArtFormat, string> = {
  feed: 'Feed vertical', square: 'Feed quadrado', story: 'Stories / Status', tiktok: 'Foto vertical · TikTok',
};

type ShareSupport = 'checking' | 'available' | 'insecure' | 'unsupported';
const subscribeShareSupport = () => () => {};
function readShareSupport(): ShareSupport {
  if (!window.isSecureContext) return 'insecure';
  return typeof navigator.share === 'function' ? 'available' : 'unsupported';
}

export function ArtEditor({ vehicle, photos, phone, exportProblem }: {
  vehicle: ArtVehicle; photos: { id: string; isCover: boolean }[]; phone: string; exportProblem: string | null;
}) {
  const choices = templatesForStatus(vehicle.status);
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [format, setFormat] = useState<ArtFormat>('feed');
  const shareSupport = useSyncExternalStore(subscribeShareSupport, readShareSupport, () => 'checking');
  const [template, setTemplate] = useState<ArtTemplate>(choices[0].id);
  const [photoId, setPhotoId] = useState(photos.find((photo) => photo.isCover)?.id ?? photos[0]?.id ?? '');
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [note, setNote] = useState('');
  const [noteApproved, setNoteApproved] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [captionMessage, setCaptionMessage] = useState<string | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({});
  const [captionApprovals, setCaptionApprovals] = useState<Record<string, boolean>>({});
  const stageRef = useRef<Konva.Stage | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const onPhotoLoad = useCallback((loaded: boolean) => setPhotoLoaded(loaded), []);
  const photoUrl = photoId ? `/api/admin/vehicles/${vehicle.id}/art-photo/${photoId}` : null;
  const canCrop = photos.length > 0 && format !== 'story' && format !== 'tiktok' && template !== 'classic';
  const defaultNote = vehicle.status === 'sold' ? 'Peça opções semelhantes no WhatsApp' :
    vehicle.status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp' : 'Consulte disponibilidade e condições';
  const captionKey = `${platform}:${format}`;
  const generatedCaption = createCaption(vehicle, platform, format, phone);
  const caption = captionEdits[captionKey] ?? generatedCaption;
  const captionNeedsApproval = Boolean(caption.trim()) && caption !== generatedCaption;
  const captionApproved = !captionNeedsApproval || Boolean(captionApprovals[captionKey]);
  const verifyVehicle = () => checkVersion(() => fetch(
    `/api/admin/vehicles/${vehicle.id}/art-check?version=${vehicle.version}`, { cache: 'no-store' }));

  async function copyCaption() {
    if (copyBusy) return;
    setCopyBusy(true);
    setCaptionMessage('Conferindo o anúncio…');
    try {
      if (!captionApproved) { setCaptionMessage('Revise e confirme a legenda editada antes de copiar.'); return; }
      const checked = await verifyVehicle();
      if (!checked.ok) { setCaptionMessage(checked.error); return; }
      await navigator.clipboard.writeText(caption);
      setCaptionMessage('Legenda copiada. Cole no aplicativo ao publicar.');
    } catch {
      captionRef.current?.focus();
      captionRef.current?.select();
      setCaptionMessage('Selecione e copie a legenda acima.');
    } finally {
      setCopyBusy(false);
    }
  }

  // Imagem e versão são preparadas em paralelo após o toque. A entrega só acontece quando
  // ambas estão prontas, para reduzir a espera sem divulgar dados que mudaram no cadastro.
  async function deliver(mode: 'share' | 'download') {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (note.trim() && !noteApproved) throw new Error('Revise e confirme o texto auxiliar antes de enviar.');
      if (!photoLoaded || !stageRef.current) throw new Error('A foto ainda não carregou. Aguarde ou escolha outra foto.');
      const stage = stageRef.current;
      const canNativeShare = mode === 'share' && typeof navigator.share === 'function';
      const result = await runArtDelivery({
        mode,
        // JPEG: foto de veículo em PNG passa de vários MB e o WhatsApp recomprime de qualquer forma.
        render: async () => { await document.fonts.ready; return stage.toBlob({ mimeType: 'image/jpeg', quality: 0.92, pixelRatio: 1 }); },
        check: verifyVehicle,
        deliver: (blob) => deliverArt({
          blob, filename: `liberato-${vehicle.slug}-${format}.jpg`, download: downloadBlob,
          fallback: mode === 'share' ? 'none' : 'download',
          share: canNativeShare ? (data) => navigator.share(data) : undefined,
          canShare: canNativeShare ? (data) => typeof navigator.canShare === 'function'
            ? navigator.canShare(data) : true : undefined,
        }),
      });
      setMessage(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar a arte. Tente de novo.');
    } finally { setBusy(false); }
  }

  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <div className={artStyles.editor}>
      <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact} ${artStyles.backLink}`} href={`/admin/veiculos/${vehicle.id}`}>Voltar ao veículo</Link>
      <h1 id="art-options-title" className={styles.heading}>Criar arte</h1>
      <p className={styles.description}>{vehicle.title} · {vehicle.price}</p>
      {exportProblem ? <p className={artStyles.warning} role="status">Prévia disponível. Para enviar ou baixar: {exportProblem}</p> : null}
      <div className={artStyles.layout}>
        <div className={artStyles.controls}>
          <fieldset className={artStyles.group}>
            <legend>1. Formato da arte</legend>
            <div className={`${artStyles.options} ${artStyles.formats}`}>{(Object.keys(artFormats) as ArtFormat[]).map((value) =>
              <button key={value} type="button" className={artStyles.option} aria-pressed={format === value}
                onClick={() => { setFormat(value); if (value === 'tiktok') setPlatform('tiktok');
                  else if (platform === 'tiktok') setPlatform('instagram'); setCaptionMessage(null); }}>
                {formatLabels[value]}
                <small>{artFormats[value].width} × {artFormats[value].height}</small>
              </button>)}</div>
            <p className={artStyles.hint}>Nos formatos verticais, a prévia mostra a arte inteira. Confira no aplicativo antes de publicar: a posição dos controles muda conforme a plataforma.</p>
            {format === 'story' ? <p className={artStyles.hint}>Esta saída é uma imagem para Stories e Status. Reels em vídeo exigem edição separada.</p> : null}
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
            {canCrop ? <><label className={artStyles.slider}>Enquadramento horizontal
              <input type="range" min="0" max="100" value={focalX}
                onChange={(event) => setFocalX(Number(event.target.value))} /></label>
            <label className={artStyles.slider}>Enquadramento vertical
              <input type="range" min="0" max="100" value={focalY}
                onChange={(event) => setFocalY(Number(event.target.value))} /></label></> : null}
            {photos.length > 0 && !canCrop ? <p className={artStyles.hint}>Neste formato a foto aparece inteira para evitar cortes no veículo.</p> : null}
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
          <h2 id="art-preview-title">4. Conferir e compartilhar</h2>
          <p className={artStyles.hint}>Prévia no formato escolhido. O arquivo mantém a dimensão indicada acima.</p>
          <ArtCanvas format={format} template={template} photoUrl={photoUrl} title={vehicle.title}
            year={vehicle.year} price={vehicle.price} phone={phone} status={vehicle.status} note={note}
            focalX={focalX} focalY={focalY} stageRef={stageRef} onPhotoLoad={onPhotoLoad} />
          <details className={artStyles.captionDetails}>
            <summary>Legenda e hashtags para copiar (opcional)</summary>
            <div className={artStyles.captionDetailsBody}>
              <p className={artStyles.hint}>Selecione a rede e copie a sugestão antes de abrir o aplicativo.</p>
              <div className={`${artStyles.options} ${artStyles.platforms}`}>{(Object.keys(PLATFORM_LABELS) as SocialPlatform[]).map((value) =>
                <button key={value} type="button" className={artStyles.option} aria-pressed={platform === value}
                  onClick={() => { setPlatform(value); setCaptionMessage(null); }}>{PLATFORM_LABELS[value]}</button>)}</div>
              <label className={`${styles.field} ${artStyles.captionField}`}>Legenda para {PLATFORM_LABELS[platform]}
                <textarea ref={captionRef} className={styles.input} value={caption} maxLength={1800} rows={11}
                  onChange={(event) => { setCaptionEdits((current) => ({ ...current, [captionKey]: event.target.value }));
                    setCaptionApprovals((current) => ({ ...current, [captionKey]: false })); setCaptionMessage(null); }} />
              </label>
              {captionNeedsApproval ? <label className={artStyles.confirmNote}>
                <input type="checkbox" checked={Boolean(captionApprovals[captionKey])}
                  onChange={(event) => setCaptionApprovals((current) => ({ ...current, [captionKey]: event.target.checked }))} />
                Revisei e autorizo a legenda editada.
              </label> : null}
              <div className={artStyles.captionActions}>
                <button className={`${styles.button} ${styles.buttonSecondary}`} type="button"
                  disabled={copyBusy || Boolean(exportProblem)} onClick={() => void copyCaption()}>
                  {copyBusy ? 'Conferindo anúncio…' : 'Copiar legenda'}</button>
                {captionEdits[captionKey] !== undefined ? <button className={`${styles.button} ${styles.buttonSecondary}`}
                  type="button" onClick={() => setCaptionEdits((current) => {
                    const next = { ...current }; delete next[captionKey]; return next;
                  })}>Restaurar sugestão</button> : null}
              </div>
              <p className={artStyles.hint} role="status" aria-live="polite">{captionMessage}</p>
            </div>
          </details>
          <div className={artStyles.downloads}>
            <button className={styles.button} type="button"
              disabled={busy || Boolean(exportProblem) || shareSupport !== 'available'}
              style={shareSupport !== 'available' ? { cursor: 'not-allowed' } : undefined}
              onClick={() => void deliver('share')}>
              {busy ? 'Preparando arte…' : 'Compartilhar'}</button>
            <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy || Boolean(exportProblem)} onClick={() => void deliver('download')}>Baixar</button>
          </div>
          <p className={artStyles.hint}>{shareSupport === 'insecure'
            ? 'O compartilhamento direto exige HTTPS no celular. Este endereço da rede local permite somente Baixar.'
            : shareSupport === 'unsupported'
              ? 'Este navegador não abre aplicativos instalados. Use o painel no celular com HTTPS ou toque em Baixar.'
              : 'Toque em Compartilhar, escolha um aplicativo instalado e finalize a publicação nele. Se precisar de texto, copie a legenda acima antes de compartilhar.'}</p>
          <p className={artStyles.hint} role="status" aria-live="polite">{message}</p>
          <a className={`${styles.button} ${styles.buttonSecondary} ${artStyles.mobileJump}`} href="#art-options-title">Alterar opções</a>
        </section>
      </div>
    </div>
  </main>;
}
