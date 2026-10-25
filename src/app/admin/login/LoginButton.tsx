'use client';

import { useFormStatus } from 'react-dom';
import styles from '../admin.module.css';

export function LoginButton() {
  const { pending } = useFormStatus();
  return <button className={styles.button} type="submit" disabled={pending} aria-busy={pending}>
    {pending ? 'Abrindo acesso…' : 'Entrar com Google'}
  </button>;
}
