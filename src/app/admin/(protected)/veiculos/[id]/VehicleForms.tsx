'use client';

import { useActionState, useState, type ChangeEvent } from 'react';
import styles from '../../../admin.module.css';
import { saveDetails, savePrice, type FormState } from '../actions';
import { FormNotice } from '../FormNotice';
import { SubmitButton } from '../SubmitButton';

type Vehicle = {
  id: string; versionNumber: number; brand: string | null; model: string | null; version: string | null;
  year: number | null; mileageKm: number | null; color: string | null; description: string | null; priceCents: number | null;
};

const initial: FormState = { message: null };
const priceText = (cents: number | null) => cents ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(cents / 100) : '';

function Message({ state, vehicleId }: { state: FormState; vehicleId: string }) {
  return <FormNotice message={state.message} vehicleId={vehicleId} />;
}

// Campos controlados: o React 19 limpa campos não controlados depois de toda action, até com erro.
// Sem `key` por versão, salvar um formulário não apaga o que foi digitado no outro.
export function VehicleForms({ vehicle }: { vehicle: Vehicle }) {
  const [details, detailsAction] = useActionState(saveDetails, initial);
  const [price, priceAction] = useActionState(savePrice, initial);
  const [fields, setFields] = useState({
    brand: vehicle.brand ?? '', model: vehicle.model ?? '', versionName: vehicle.version ?? '', year: String(vehicle.year ?? ''),
    mileageKm: String(vehicle.mileageKm ?? ''), color: vehicle.color ?? '', description: vehicle.description ?? '',
  });
  const [priceValue, setPriceValue] = useState(priceText(vehicle.priceCents));
  const bind = (name: keyof typeof fields) => ({
    name, value: fields[name], autoComplete: 'off', className: styles.input,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields((current) => ({ ...current, [name]: event.target.value })),
  });
  const hidden = <>
    <input type="hidden" name="id" value={vehicle.id} />
    <input type="hidden" name="version" value={vehicle.versionNumber} />
  </>;
  return <>
    <form className={styles.form} action={detailsAction}>
      {hidden}
      <label className={styles.field}>Marca<input {...bind('brand')} maxLength={160} /></label>
      <label className={styles.field}>Modelo<input {...bind('model')} maxLength={160} /></label>
      <label className={styles.field}>Versão<input {...bind('versionName')} maxLength={160} /></label>
      <label className={styles.field}>Ano<input {...bind('year')} inputMode="numeric" maxLength={4} /></label>
      <label className={styles.field}>Quilometragem (km)<input {...bind('mileageKm')} inputMode="decimal" /></label>
      <label className={styles.field}>Cor<input {...bind('color')} maxLength={160} /></label>
      <label className={styles.field}>Descrição<textarea {...bind('description')} maxLength={5000} rows={5} /></label>
      <SubmitButton label="Salvar dados" />
      <Message state={details} vehicleId={vehicle.id} />
    </form>
    <form className={styles.form} action={priceAction}>
      {hidden}
      <label className={styles.field}>Preço (R$)<input className={styles.input} name="price" value={priceValue} onChange={(event) => setPriceValue(event.target.value)} inputMode="decimal" placeholder="18.500,00" autoComplete="off" /></label>
      <SubmitButton label="Salvar preço" />
      <Message state={price} vehicleId={vehicle.id} />
    </form>
  </>;
}
