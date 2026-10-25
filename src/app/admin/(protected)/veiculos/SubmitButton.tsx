'use client';

import { useFormStatus } from 'react-dom';
import styles from '../../admin.module.css';

type Props = { label: string; pendingLabel?: string; name?: string; value?: string; secondary?: boolean };

// Com `name`/`value`, vários botões dividem o mesmo formulário: todos ficam desabilitados durante o envio
// (evita toque duplo), mas só o que foi tocado troca o texto.
export function SubmitButton({ label, pendingLabel = 'Salvando...', name, value, secondary = false }: Props) {
  const { pending, data } = useFormStatus();
  const mine = pending && (name === undefined || data?.get(name) === value);
  return <button className={secondary ? `${styles.button} ${styles.buttonSecondary}` : styles.button} type="submit" name={name} value={value}
    disabled={pending} aria-busy={mine}>{mine ? pendingLabel : label}</button>;
}
