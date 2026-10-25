'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import styles from '../../../admin.module.css';
import { createVehicle, type FormState } from '../actions';

const initial: FormState = { message: null };

function TypeButton({ type, label }: { type: string; label: string }) {
  const { pending } = useFormStatus();
  return <button className={`${styles.button} ${styles.typeButton}`} type="submit" name="type" value={type} disabled={pending} aria-busy={pending}>{pending ? 'Criando...' : label}</button>;
}

export function VehicleTypeForm() {
  const [state, action] = useActionState(createVehicle, initial);
  return <form className={styles.typeChoice} action={action}>
    <TypeButton type="motorcycle" label="Moto" />
    <TypeButton type="car" label="Carro" />
    {state.message ? <p className={styles.notice} role="alert">{state.message}</p> : null}
  </form>;
}
