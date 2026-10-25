'use client';

import { useActionState } from 'react';
import styles from '../../../admin.module.css';
import { saveDetails, savePrice, type FormState } from '../actions';
import { SubmitButton } from '../SubmitButton';

type Vehicle = {
  id: string; versionNumber: number; brand: string | null; model: string | null; version: string | null;
  year: number | null; mileageKm: number | null; color: string | null; description: string | null; priceCents: number | null;
};

const initial: FormState = { message: null };
const priceText = (cents: number | null) => cents ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(cents / 100) : '';

function Message({ state }: { state: FormState }) {
  return state.message ? <p className={styles.notice} role="status">{state.message}</p> : null;
}

export function VehicleForms({ vehicle }: { vehicle: Vehicle }) {
  const [details, detailsAction] = useActionState(saveDetails, initial);
  const [price, priceAction] = useActionState(savePrice, initial);
  const hidden = <>
    <input type="hidden" name="id" value={vehicle.id} />
    <input type="hidden" name="version" value={vehicle.versionNumber} />
  </>;
  return <>
    <form className={styles.form} action={detailsAction} key={`d${vehicle.versionNumber}`}>
      {hidden}
      <label className={styles.field}>Marca<input className={styles.input} name="brand" defaultValue={vehicle.brand ?? ''} maxLength={160} autoComplete="off" /></label>
      <label className={styles.field}>Modelo<input className={styles.input} name="model" defaultValue={vehicle.model ?? ''} maxLength={160} autoComplete="off" /></label>
      <label className={styles.field}>Versão<input className={styles.input} name="versionName" defaultValue={vehicle.version ?? ''} maxLength={160} autoComplete="off" /></label>
      <label className={styles.field}>Ano<input className={styles.input} name="year" defaultValue={vehicle.year ?? ''} inputMode="numeric" maxLength={4} autoComplete="off" /></label>
      <label className={styles.field}>Quilometragem (km)<input className={styles.input} name="mileageKm" defaultValue={vehicle.mileageKm ?? ''} inputMode="numeric" autoComplete="off" /></label>
      <label className={styles.field}>Cor<input className={styles.input} name="color" defaultValue={vehicle.color ?? ''} maxLength={160} autoComplete="off" /></label>
      <label className={styles.field}>Descrição<textarea className={styles.input} name="description" defaultValue={vehicle.description ?? ''} maxLength={5000} rows={5} /></label>
      <SubmitButton label="Salvar dados" />
      <Message state={details} />
    </form>
    <form className={styles.form} action={priceAction} key={`p${vehicle.versionNumber}`}>
      {hidden}
      <label className={styles.field}>Preço (R$)<input className={styles.input} name="price" defaultValue={priceText(vehicle.priceCents)} inputMode="numeric" placeholder="18.500,00" autoComplete="off" /></label>
      <SubmitButton label="Salvar preço" />
      <Message state={price} />
    </form>
  </>;
}
