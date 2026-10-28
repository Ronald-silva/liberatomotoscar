'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { VehicleType } from '@/data/catalogo-marcas-modelos';
import styles from '../../../admin.module.css';
import { changeStatus, type FormState } from '../actions';
import { FormNotice } from '../FormNotice';
import { PhotoGallery, type GalleryPhoto } from '../PhotoGallery';
import { PhotoUpload } from '../PhotoUpload';
import type { VehicleStatus } from '../status';
import { DangerActions } from './DangerActions';
import { StatusActions } from './StatusActions';
import { VehicleForms } from './VehicleForms';
import { useVehicleDraft, type DraftFields } from './useVehicleDraft';

const initial: FormState = { message: null };
const checks = ['Marca', 'Modelo', 'Preço', 'Pelo menos uma foto'] as const;

export function VehicleEditor({ vehicleId, slug, type, status, isNew, canDiscard, targets, initialVersion, initialFields,
  initialMissing, photos, currentYear }: {
  vehicleId: string; slug: string; type: VehicleType; status: VehicleStatus; isNew: boolean; canDiscard: boolean;
  targets: VehicleStatus[]; initialVersion: number; initialFields: DraftFields; initialMissing: readonly string[];
  photos: GalleryPhoto[]; currentYear: number;
}) {
  const draft = useVehicleDraft({ vehicleId, initialVersion, initialFields, initialMissing, initialPhotoCount: photos.length });
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [publishedNow, setPublishedNow] = useState(false);
  const [editingField, setEditingField] = useState(false);
  const [openingArt, setOpeningArt] = useState(false);
  const router = useRouter();
  const name = [draft.fields.brand, draft.fields.model].filter(Boolean).join(' ');
  const title = isNew && (!draft.fields.brand || !draft.fields.model)
    ? `Cadastrar ${type === 'motorcycle' ? 'moto' : 'carro'}` : name || 'Veículo sem título';
  const canPublish = status === 'draft' && targets.includes('published');
  const blocked = draft.missing.length > 0 || draft.saveState === 'error' || draft.saveState === 'saving' || publishing;

  useEffect(() => {
    const isField = (element: Element | null) => element?.matches('input, textarea, select') ?? false;
    const update = () => setEditingField(isField(document.activeElement));
    const keepFocusedFieldVisible = () => {
      const focused = document.activeElement;
      if (isField(focused)) requestAnimationFrame(() => focused?.scrollIntoView({ block: 'center', behavior: 'auto' }));
    };
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    window.addEventListener('resize', keepFocusedFieldVisible);
    window.visualViewport?.addEventListener('resize', keepFocusedFieldVisible);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      window.removeEventListener('resize', keepFocusedFieldVisible);
      window.visualViewport?.removeEventListener('resize', keepFocusedFieldVisible);
    };
  }, []);

  async function publish() {
    setPublishing(true);
    setPublishMessage(null);
    if (!await draft.saveBeforeAction()) { setPublishing(false); setConfirming(false); return; }
    const state = await draft.enqueue((version) => {
      const data = new FormData();
      data.set('id', vehicleId);
      data.set('version', String(version));
      data.set('status', 'published');
      data.set('confirmAvailability', 'true');
      return changeStatus(initial, data);
    }).catch((): FormState => ({ message: 'Não foi possível publicar agora. Tente de novo.' }));
    setPublishing(false);
    setConfirming(false);
    setPublishMessage(state.version === undefined ? state.message : 'Anúncio publicado. Situação: Publicado.');
    if (state.version !== undefined) { setPublishedNow(true); router.refresh(); }
  }

  async function openArt() {
    setOpeningArt(true);
    try {
      if (await draft.saveBeforeAction()) router.push(`/admin/veiculos/${vehicleId}/arte`);
    } finally { setOpeningArt(false); }
  }

  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <div className={styles.listPanel}>
      <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href="/admin">Voltar ao estoque</Link>
      <h1 id="editar-title" className={styles.heading}>{title}</h1>
      {isNew ? <p className={styles.description}>Siga de cima para baixo. O que você preencher é salvo automaticamente.</p> : null}
      {(status === 'published' || status === 'reserved' || status === 'sold' || publishedNow) ?
        <div className={styles.publishedNotice} role="status">
          <strong>{publishedNow ? 'Anúncio publicado.' : `Situação: ${status === 'reserved' ? 'Reservado' : status === 'sold' ? 'Vendido' : 'Publicado'}.`}</strong>
          <Link href={`/veiculos/${slug}`} target="_blank" rel="noopener noreferrer">Ver anúncio público</Link>
        </div> : null}

      <section aria-labelledby="veiculo-title">
        <h2 id="veiculo-title" className={styles.subheading}>{isNew ? <span className={styles.step}>1</span> : null}O veículo</h2>
        <VehicleForms draft={draft} type={type} currentYear={currentYear} />
      </section>

      <section aria-labelledby="fotos-title">
        <h2 id="fotos-title" className={styles.subheading}>{isNew ? <span className={styles.step}>2</span> : null}Fotos</h2>
        <PhotoGallery vehicleId={vehicleId} draft={draft} photos={photos} />
        <PhotoUpload vehicleId={vehicleId} draft={draft} />
        <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={openingArt}
          onClick={() => void openArt()}>{openingArt ? 'Salvando anúncio…' : 'Criar arte'}</button>
      </section>

      {canPublish && !publishedNow ? <section aria-labelledby="conferir-title">
        <h2 id="conferir-title" className={styles.subheading}>{isNew ? <span className={styles.step}>3</span> : null}Conferir e publicar</h2>
        <p className={styles.description}>{draft.missing.length === 0
          ? 'Tudo pronto. Pode publicar.' : 'Falta isto para o anúncio poder ser publicado:'}</p>
        <ul className={styles.checklist}>
          {checks.map((label) => {
            const done = !draft.missing.includes(label);
            return <li key={label} className={done ? `${styles.checkItem} ${styles.checkItemOn}` : styles.checkItem}>
              <span className={styles.checkMark} aria-hidden="true">{done ? '✓' : '○'}</span>
              <span className={styles.visuallyHidden}>{done ? 'Pronto: ' : 'Falta: '}</span>{label}
            </li>;
          })}
        </ul>
        <div className={`${styles.editorFooter} ${editingField ? styles.editorFooterKeyboard : ''}`}>
          <div className={styles.editorFooterInner}>
            {confirming ? <div className={styles.confirmPublish}>
              <p className={styles.notice} role="alert">Este veículo está disponível para venda?</p>
              <button className={styles.button} type="button" disabled={publishing} onClick={() => void publish()}>
                {publishing ? 'Publicando...' : 'Sim, publicar anúncio'}
              </button>
              <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={publishing}
                onClick={() => setConfirming(false)}>Cancelar</button>
            </div> : <>
              <button className={styles.button} type="button" disabled={blocked}
                aria-describedby={blocked ? 'publicar-bloqueado' : undefined} onClick={() => setConfirming(true)}>Publicar anúncio</button>
              {blocked ? <p id="publicar-bloqueado" className={styles.chipHint}>
                {draft.saveState === 'error' ? 'A gravação falhou. Tente de novo antes de publicar.'
                  : draft.saveState === 'saving' ? 'Aguarde a gravação terminar.'
                    : `Para publicar, complete: ${draft.missing.join(', ')}.`}
              </p> : null}
            </>}
          </div>
        </div>
      </section> : null}

      <StatusActions vehicleId={vehicleId} draft={draft} status={publishedNow ? 'published' : status}
        targets={publishedNow ? [] : targets} />

      <DangerActions vehicleId={vehicleId} draft={draft} canDiscard={canDiscard}
        archiveTargetAvailable={!publishedNow && targets.includes('archived')} />
      <FormNotice message={publishMessage} vehicleId={vehicleId} role="alert" />
    </div>

  </main>;
}
