'use client';

import { useFormStatus } from 'react-dom';
import styles from '../../admin.module.css';

export function SubmitButton({ label, pendingLabel = 'Salvando...' }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button className={styles.button} type="submit" disabled={pending} aria-busy={pending}>{pending ? pendingLabel : label}</button>;
}
