'use client';

import { useFormStatus } from 'react-dom';
import styles from '../../admin.module.css';

type Props = { label: string; pendingLabel?: string; name?: string; value?: string; secondary?: boolean; className?: string };

// Com `name`/`value`, vários botões dividem o mesmo formulário: todos ficam desabilitados durante o envio
// (evita toque duplo), mas só o que foi tocado troca o texto.
export function SubmitButton({ label, pendingLabel = 'Salvando...', name, value, secondary = false, className }: Props) {
  const { pending, data } = useFormStatus();
  const mine = pending && (name === undefined || data?.get(name) === value);
  const classes = [styles.button, secondary ? styles.buttonSecondary : '', className ?? ''].filter(Boolean).join(' ');
  return <button className={classes} type="submit" name={name} value={value}
    disabled={pending} aria-busy={mine}>{mine ? pendingLabel : label}</button>;
}
