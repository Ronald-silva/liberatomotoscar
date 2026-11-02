'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import styles from '../../admin.module.css';
import { marcarVisita, type AgendaFormState } from './actions';
import type { VehicleOption } from './VisitCard';
import { VisitFields, type VisitValues } from './VisitFields';

const initial: AgendaFormState = { message: null, ok: false };
const emptyValues: VisitValues = { data: '', hora: '', vehicleId: '' };
const SERVER_DOWN = 'Não foi possível salvar agora. Tente de novo.';

// Controlado e sem `action`: a React 19 zera o formulário não controlado ao fim de toda ação, mesmo
// quando ela falha, e quem errou o horário perderia o nome e o telefone que acabou de digitar.
export function ManualVisitForm({ vehicles, vehiclesAvailable = true, minDate }: { vehicles: VehicleOption[]; vehiclesAvailable?: boolean; minDate?: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [values, setValues] = useState<VisitValues>(emptyValues);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgendaFormState>(initial);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(initial);
    const data = new FormData(event.currentTarget);
    const state = await marcarVisita(initial, data).catch((): AgendaFormState => ({ message: SERVER_DOWN, ok: false }));
    setBusy(false);
    setResult(state);
    if (!state.ok) return;
    setName(''); setPhone(''); setValues(emptyValues);
    router.refresh();
  }

  return <form onSubmit={submit} className={styles.visitForm}>
    <label className={styles.field} htmlFor="visita-nome">Nome do cliente
      <input id="visita-nome" className={styles.input} name="customerName" required autoComplete="off"
        value={name} onChange={(event) => setName(event.target.value)} />
    </label>
    <label className={styles.field} htmlFor="visita-telefone">Telefone com DDD
      <input id="visita-telefone" className={styles.input} name="customerPhone" type="tel" inputMode="tel" required autoComplete="off"
        value={phone} onChange={(event) => setPhone(event.target.value)} />
    </label>
    <VisitFields idPrefix="visita" values={values} onChange={setValues} vehicles={vehicles} vehiclesAvailable={vehiclesAvailable} minDate={minDate} />
    <button className={styles.button} type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Marcando...' : 'Marcar visita'}</button>
    {result.message ? <p className={styles.notice} role={result.ok ? 'status' : 'alert'}>{result.message}</p> : null}
  </form>;
}
