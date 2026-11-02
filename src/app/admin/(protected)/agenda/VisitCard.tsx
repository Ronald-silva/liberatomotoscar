'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { STORE_TIME_ZONE, storeClock } from '@/server/attendance/visit-slot';
import styles from '../../admin.module.css';
import { semGritar } from '../atendimento/ficha';
import { cancelarVisita, corrigirVisita, type AgendaFormState } from './actions';
import { VisitFields, type VisitValues } from './VisitFields';

export type VehicleOption = { id: string; label: string };
export type VisitView = {
  id: string;
  /** ISO. Nulo é "combinado, sem hora certa". */
  scheduledFor: string | null;
  passou: boolean;
  customerName: string | null;
  customerPhone: string | null;
  quote: string;
  conversationId: string | null;
  vehicleId: string | null;
  vehicle: { label: string; year: number | null; price: string | null } | null;
};

const initial: AgendaFormState = { message: null, ok: false };
const SERVER_DOWN = 'Não foi possível salvar agora. Tente de novo.';
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: STORE_TIME_ZONE });
const dayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: STORE_TIME_ZONE });
const pad = (n: number) => String(n).padStart(2, '0');

function initialValues(visit: VisitView): VisitValues {
  if (!visit.scheduledFor) return { data: '', hora: '', vehicleId: visit.vehicleId ?? '' };
  const c = storeClock(new Date(visit.scheduledFor));
  return { data: `${c.year}-${pad(c.month)}-${pad(c.day)}`, hora: `${pad(c.hour)}:${pad(c.minute)}`, vehicleId: visit.vehicleId ?? '' };
}

// DDI 55 quando o número vem só com DDD; o que já começa com 55 e tem 12 ou 13 dígitos fica como está.
function whatsappLink(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}

/** Roda uma action do cartão; devolve o estado, trocando uma queda de rede por uma explicação. */
function useCardAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run(action: (state: AgendaFormState, data: FormData) => Promise<AgendaFormState>, data: FormData) {
    setBusy(true);
    setMessage(null);
    const state = await action(initial, data).catch((): AgendaFormState => ({ message: SERVER_DOWN, ok: false }));
    setBusy(false);
    if (!state.ok) { setMessage(state.message); return false; }
    router.refresh();
    return true;
  }
  return { busy, message, run };
}

function CancelVisit({ visit }: { visit: VisitView }) {
  const [confirming, setConfirming] = useState(false);
  const { busy, message, run } = useCardAction();
  const confirm = () => {
    const data = new FormData();
    data.set('id', visit.id);
    return run(cancelarVisita, data);
  };
  if (!confirming) {
    return <button className={`${styles.button} ${styles.buttonDestructive} ${styles.buttonCompact}`} type="button"
      onClick={() => setConfirming(true)}>Cancelar visita</button>;
  }
  return <div className={styles.visitConfirm}>
    <p className={styles.notice} role="group" aria-label="Confirmar cancelamento">
      Cancelar a visita de {visit.customerName ?? 'este cliente'}? Ela some da agenda.
    </p>
    <button className={`${styles.button} ${styles.buttonDestructive} ${styles.buttonCompact}`} type="button" disabled={busy}
      onClick={() => void confirm()}>{busy ? 'Cancelando...' : 'Sim, cancelar'}</button>
    <button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} type="button" disabled={busy}
      onClick={() => setConfirming(false)}>Manter visita</button>
    {message ? <p className={styles.notice} role="alert">{message}</p> : null}
  </div>;
}

function CorrectVisit({ visit, vehicles, vehiclesAvailable }: { visit: VisitView; vehicles: VehicleOption[]; vehiclesAvailable: boolean }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<VisitValues>(() => initialValues(visit));
  const { busy, message, run } = useCardAction();
  // Veículo fora da lista (descartado, por exemplo) continua escolhido: sem a opção, o select
  // enviaria "sem veículo" e salvar só a hora desvincularia o carro.
  const options = visit.vehicleId && !vehicles.some((v) => v.id === visit.vehicleId)
    ? [{ id: visit.vehicleId, label: visit.vehicle?.label ?? 'Veículo que saiu do estoque' }, ...vehicles] : vehicles;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set('id', visit.id);
    if (await run(corrigirVisita, data)) setOpen(false);
  }

  if (!open) {
    return <button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} type="button"
      onClick={() => setOpen(true)}>Corrigir</button>;
  }
  return <form onSubmit={submit} className={styles.visitForm}>
    <VisitFields idPrefix={`corrigir-${visit.id}`} values={values} onChange={setValues} vehicles={options} vehiclesAvailable={vehiclesAvailable} />
    <button className={`${styles.button} ${styles.buttonCompact}`} type="submit" disabled={busy} aria-busy={busy}>
      {busy ? 'Salvando...' : 'Salvar correção'}
    </button>
    <button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} type="button" disabled={busy}
      onClick={() => setOpen(false)}>Fechar</button>
    {message ? <p className={styles.notice} role="alert">{message}</p> : null}
  </form>;
}

export function VisitCard({ visit, vehicles, vehiclesAvailable = true, showDay = false }: {
  visit: VisitView; vehicles: VehicleOption[]; vehiclesAvailable?: boolean; showDay?: boolean;
}) {
  const when = visit.scheduledFor ? new Date(visit.scheduledFor) : null;
  const whatsapp = whatsappLink(visit.customerPhone);
  const vehicleLine = visit.vehicle
    ? [visit.vehicle.label, visit.vehicle.year, visit.vehicle.price].filter((part) => part !== null && part !== '').join(' · ')
    : null;
  return <li className={`${styles.visitCard} ${visit.passou ? styles.visitCardPassou : ''}`}
    data-passou={visit.passou ? 'true' : undefined}>
    <div className={styles.visitWhen}>
      {when ? <>
        <span className={styles.visitTime}>{timeFormat.format(when)}</span>
        {showDay ? <span className={styles.visitDay}>{dayFormat.format(when)}</span> : null}
      </> : <span className={styles.visitDay}>Sem hora certa</span>}
      {visit.passou ? <span className={styles.badge}>Já passou</span> : null}
    </div>
    <p className={styles.visitName}>{visit.customerName ?? 'Cliente sem nome'}</p>
    {visit.customerPhone ? <p className={styles.visitMeta}>{visit.customerPhone}</p> : null}
    <p className={styles.visitMeta}>{vehicleLine ?? 'Veículo não definido'}</p>
    {visit.quote ? <p className={styles.visitQuote} title={visit.quote}>“{semGritar(visit.quote)}”</p> : null}
    <div className={styles.visitActions}>
      {whatsapp ? <a className={`${styles.button} ${styles.buttonCompact}`} href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a> : null}
      {visit.conversationId
        ? <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href={`/admin/atendimento?conversa=${visit.conversationId}`}>Ver conversa</Link>
        : null}
      <CorrectVisit visit={visit} vehicles={vehicles} vehiclesAvailable={vehiclesAvailable} />
      <CancelVisit visit={visit} />
    </div>
  </li>;
}
