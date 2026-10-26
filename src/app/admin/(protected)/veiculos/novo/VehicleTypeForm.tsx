'use client';

import { useActionState } from 'react';
import styles from '../../../admin.module.css';
import { createVehicle, type FormState } from '../actions';
import { FormNotice } from '../FormNotice';
import { SubmitButton } from '../SubmitButton';

const initial: FormState = { message: null };

// Os dois botões dividem um formulário só, então `useFormStatus().pending` é verdadeiro para
// ambos durante o envio — era por isso que os dois mostravam "Criando..." juntos. O SubmitButton
// já resolvia isso em todo o resto do painel, comparando `data.get(name)` com o próprio valor:
// todos ficam desabilitados (evita toque duplo e criação duplicada), mas só o tocado troca o texto.
export function VehicleTypeForm() {
  const [state, action] = useActionState(createVehicle, initial);
  return <form className={styles.typeChoice} action={action}>
    <SubmitButton name="type" value="motorcycle" label="Moto" pendingLabel="Criando..." className={styles.typeButton} />
    <SubmitButton name="type" value="car" label="Carro" pendingLabel="Criando..." className={styles.typeButton} />
    <FormNotice message={state.message} vehicleId="" role="alert" />
  </form>;
}
