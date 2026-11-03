'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  feed: 'Feed · Instagram/Facebook (4:5)', square: 'Feed quadrado (1:1)',
  story: 'Stories / Status (9:16)', tiktok: 'TikTok (9:16)',
};

type ShareSupport = 'checking' | 'available' | 'insecure' | 'unsupported';
const subscribeShareSupport = () => () => {};
function readShareSupport(): ShareSupport {
  if (!window.isSecureContext) return 'insecure';
  return typeof navigator.share === 'function' ? 'available' : 'unsupported';
}

export function ArtEditor({ vehicle, photos, phone, exportProblem }: {
  vehicle: ArtVehicle; photos: { id: string; isCover: boolean; src: string }[]; phone: string; exportProblem: string | null;
}) {
  const choices = templatesForStatus(vehicle.status);
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [format, setFormat] = useState<ArtFormat>('story');
  const shareSupport = useSyncExternalStore(subscribeShareSupport, readShareSupport, () => 'checking');
  const [template, setTemplate] = useState<ArtTemplate>(choices[0].id);
  const [photoId, setPhotoId] = useState(photos.find((photo) => photo.isCover)?.id ?? photos[0]?.id ?? '');
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [note, setNote] = useState('');
  const [noteApproved, setNoteApproved] = useState(false);
  const [photoState, setPhotoState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoRetry, setPhotoRetry] = useState(0);
  const [prepared, setPrepared] = useState<{ key: string; blob: Blob } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareRetry, setPrepareRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [captionMessage, setCaptionMessage] = useState<string | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({});
  const [captionApprovals, setCaptionApprovals] = useState<Record<string, boolean>>({});
  const stageRef = useRef<Konva.Stage | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const onPhotoLoad = useCallback((state: 'loading' | 'ready' | 'error', error?: string) => {
    setPhotoState(state);
    setPhotoError(error ?? null);
  }, [setPhotoState, setPhotoError]);
  const photoUrl = photos.find((photo) => photo.id === photoId)?.src ?? null;
  const artTitle = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || vehicle.title;
  const canCrop = photos.length > 0 && format !== 'story' && format !== 'tiktok' && template !== 'classic';
  const defaultNote = vehicle.status === 'sold' ? 'Peça opções semelhantes no WhatsApp' :
    vehicle.status === 'reserved' ? 'Consulte a disponibilidade no WhatsApp' : 'Consulte disponibilidade e condições';
  const captionKey = `${platform}:${format}`;
  const generatedCaption = createCaption(vehicle, platform, format, phone);
  const caption = captionEdits[captionKey] ?? generatedCaption;
  const captionNeedsApproval = Boolean(caption.trim()) && caption !== generatedCaption;
  const captionApproved = !captionNeedsApproval || Boolean(captionApprovals[captionKey]);
  const verifyVehicle = useCallback(() => checkVersion(() => fetch(
    `/api/admin/vehicles/${vehicle.id}/art-check?version=${vehicle.version}`, { cache: 'no-store' })),
    [vehicle.id, vehicle.version]);
  const artKey = JSON.stringify([vehicle.version, vehicle.title, vehicle.year, vehicle.price, vehicle.status,
    phone, photoId, photoRetry, format, template, focalX, focalY, note]);

  // A geração e a conferência acontecem antes do toque: Safari e outros navegadores
  // encerram a ativação do usuário se o compartilhamento esperar por canvas ou rede.
  useEffect(() => {
    if (photoState !== 'ready' || exportProblem) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setPreparing(true);
      setPrepareError(null);
      void (async () => {
        try {
          await document.fonts.ready;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const blob = await stageRef.current?.toBlob({ mimeType: 'image/jpeg', quality: 0.92, pixelRatio: 1 });
          if (!blob) throw new Error('Este aparelho não conseguiu gerar a imagem. Tente outra foto.');
          const checked = await verifyVehicle();
          if (!checked.ok) throw new Error(checked.error);
          if (active) { setPrepared({ key: artKey, blob }); setMessage(null); }
        } catch (error) {
          if (active) setPrepareError(error instanceof Error ? error.message : 'Não foi possível preparar a arte.');
        } finally { if (active) setPreparing(false); }
      })();
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [artKey, photoState, exportProblem, verifyVehicle, prepareRetry]);

  // O cadastro pode mudar com a tela aberta. Revalidamos a arte pronta sem refazer o JPEG.
  useEffect(() => {
    if (!prepared || prepared.key !== artKey) return;
    let active = true;
    const timer = window.setInterval(() => {
      setPreparing(true);
      void verifyVehicle().then((checked) => {
        if (!active) return;
        if (!checked.ok) { setPrepared(null); setPrepareError(checked.error); }
      }).finally(() => { if (active) setPreparing(false); });
    }, 120000);
    return () => { active = false; window.clearInterval(timer); };
  }, [prepared, artKey, verifyVehicle]);

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

  // O arquivo compartilhável já está pronto neste ponto; a chamada nativa ocorre no mesmo toque.
  async function deliver(mode: 'share' | 'download') {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (exportProblem) throw new Error(exportProblem);
      if (mode === 'share' && shareSupport !== 'available') throw new Error(shareSupport === 'insecure'
        ? 'O envio direto exige HTTPS. Abra o endereço publicado no Chrome do celular.'
        : 'Este navegador não oferece o menu de aplicativos. Abra esta página diretamente no Chrome.');
      if (note.trim() && !noteApproved) throw new Error('Revise e confirme o texto auxiliar antes de enviar.');
      if (photoState !== 'ready' || !stageRef.current) throw new Error(photoError || 'A foto ainda não carregou. Aguarde ou escolha outra foto.');
      if (mode === 'share') {
        if (!prepared || prepared.key !== artKey || preparing) throw new Error(prepareError || 'Aguarde a arte ficar pronta para compartilhar.');
        let shareFailure: string | null = null;
        const outcome = await deliverArt({
          blob: prepared.blob, filename: `liberato-${vehicle.slug}-${format}.jpg`, download: downloadBlob,
          fallback: 'none',
          share: typeof navigator.share === 'function' ? (data) => navigator.share(data) : undefined,
          canShare: (data) => typeof navigator.canShare === 'function' ? navigator.canShare(data) : true,
          onShareError: (error) => {
            const name = error instanceof Error ? error.name : '';
            shareFailure = name === 'NotAllowedError'
              ? 'O navegador bloqueou o envio. Abra esta página diretamente no Chrome e tente novamente.'
              : name === 'TypeError'
                ? 'Este navegador não aceita compartilhar a imagem. Abra esta página diretamente no Chrome.'
                : 'Não foi possível abrir o menu de aplicativos. Tente novamente ou use Baixar.';
          },
        });
        setMessage(outcome === 'shared' ? 'Arte entregue ao menu do aparelho. Conclua a publicação no aplicativo.'
          : outcome === 'cancelled' ? 'Compartilhamento cancelado. Se nenhum aplicativo apareceu, abra esta página no Chrome.'
            : outcome === 'unavailable' ? shareFailure || 'Este navegador não oferece o envio de imagens. Abra esta página no Chrome ou use Baixar.' : null);
        return;
      }
      const stage = stageRef.current;
      const result = await runArtDelivery({
        mode,
        // JPEG: foto de veículo em PNG passa de vários MB e o WhatsApp recomprime de qualquer forma.
        render: async () => { await document.fonts.ready; return stage.toBlob({ mimeType: 'image/jpeg', quality: 0.92, pixelRatio: 1 }); },
        check: verifyVehicle,
        deliver: (blob) => deliverArt({ blob, filename: `liberato-${vehicle.slug}-${format}.jpg`,
          download: downloadBlob }),
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
            <p className={artStyles.hint}>{format === 'feed' || format === 'square'
              ? 'Este arquivo é para publicações no feed. Para TikTok, Stories ou Status, escolha um formato 9:16 antes de compartilhar.'
              : 'Este arquivo ocupa a tela vertical. Textos e preço ficam acima dos controles inferiores; confira a prévia no aplicativo antes de publicar.'}</p>
            {format === 'story' ? <p className={artStyles.hint}>Esta saída é uma imagem para Stories e Status. Reels em vídeo exigem edição separada.</p> : null}
            {format === 'tiktok' ? <p className={artStyles.hint}>Esta saída é uma foto para postagem. Anúncios em carrossel exigem mais imagens e conferência no TikTok Ads Manager.</p> : null}
          </fieldset>
          <fieldset className={artStyles.group}>
            <legend>2. Foto</legend>
            {photos.length === 0 ? <p>Adicione uma foto no cadastro para montar a peça.</p> :
              <div className={artStyles.photos}>{photos.map((photo, index) =>
                <button key={photo.id} type="button" className={artStyles.photoOption} aria-pressed={photoId === photo.id}
                  onClick={() => {
                    if (photoId === photo.id) return;
                    setPhotoState('loading'); setPhotoId(photo.id);
                  }}>
                  {/* Fotos antigas usam /images; fotos R2 passam pela rota autenticada. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.src} alt="" loading="lazy" />
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
          <ArtCanvas format={format} template={template} photoUrl={photoUrl} photoRetry={photoRetry} title={artTitle}
            year={vehicle.year} price={vehicle.price} phone={phone} status={vehicle.status} note={note}
            focalX={focalX} focalY={focalY} stageRef={stageRef} onPhotoLoad={onPhotoLoad} />
          {photoState === 'error' ? <div className={artStyles.warning} role="alert">
            <p>{photoError}</p>
            <button type="button" className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={() => { setPhotoState('loading'); setPhotoRetry((value) => value + 1); }}>Tentar carregar foto novamente</button>
          </div> : null}
          {photoState === 'loading' ? <p className={artStyles.hint} role="status">Carregando foto da arte…</p> : null}
          {photoState === 'ready' && preparing ? <p className={artStyles.hint} role="status">Preparando arquivo para compartilhar…</p> : null}
          {prepareError ? <div className={artStyles.warning} role="alert">
            <p>{prepareError}</p>
            <button type="button" className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={() => { setPrepared(null); setPrepareRetry((value) => value + 1); }}>Tentar preparar novamente</button>
          </div> : null}
          <details className={artStyles.captionDetails}>
            <summary>Legenda e hashtags para copiar (opcional)</summary>
            <div className={artStyles.captionDetailsBody}>
              <p className={artStyles.hint}>Selecione a rede e copie a sugestão antes de abrir o aplicativo.</p>
              <div className={`${artStyles.options} ${artStyles.platforms}`}>{(Object.keys(PLATFORM_LABELS) as SocialPlatform[]).map((value) =>
                <button key={value} type="button" className={artStyles.option} aria-pressed={platform === value}
                  onClick={() => { setPlatform(value); if (value === 'tiktok') setFormat('tiktok');
                    if (value === 'whatsapp') setFormat('story'); setCaptionMessage(null); }}>{PLATFORM_LABELS[value]}</button>)}</div>
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
          <p className={artStyles.hint}>Arquivo selecionado: {formatLabels[format]} · {artFormats[format].width} × {artFormats[format].height}</p>
          <p className={artStyles.hint} role="status" aria-live="polite">{message}</p>
          <div className={artStyles.downloads}>
            <button className={styles.button} type="button"
              disabled={busy}
              onClick={() => void deliver('share')}>
              {busy ? 'Abrindo aplicativos…' : preparing ? 'Preparando arte…' : 'Compartilhar'}</button>
            <button className={`${styles.button} ${styles.buttonSecondary}`} type="button"
              disabled={busy || photoState !== 'ready' || Boolean(exportProblem)}
              onClick={() => void deliver('download')}>Baixar</button>
          </div>
          <p className={artStyles.hint}>{shareSupport === 'insecure'
            ? 'O compartilhamento direto exige HTTPS no celular. Este endereço da rede local permite somente Baixar.'
            : shareSupport === 'unsupported'
              ? 'Este navegador não abre aplicativos instalados. Use o painel no celular com HTTPS ou toque em Baixar.'
              : 'Toque em Compartilhar, escolha um aplicativo instalado e finalize a publicação nele. Se precisar de texto, copie a legenda acima antes de compartilhar.'}</p>
          <a className={`${styles.button} ${styles.buttonSecondary} ${artStyles.mobileJump}`} href="#art-options-title">Alterar opções</a>
        </section>
      </div>
    </div>
  </main>;
}
