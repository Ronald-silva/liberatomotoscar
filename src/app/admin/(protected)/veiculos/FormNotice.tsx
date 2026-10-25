import Link from 'next/link';
import styles from '../../admin.module.css';
import { isStaleMessage } from './feedback';

// Só a mensagem de anúncio desatualizado ganha o link: é a única que não se resolve tentando de novo,
// porque a versão oculta do formulário continua velha até a tela ser recarregada.
export function FormNotice({ message, vehicleId, role = 'status' }: { message: string | null; vehicleId: string; role?: 'status' | 'alert' }) {
  if (!message) return null;
  return <p className={styles.notice} role={role}>
    {message}
    {isStaleMessage(message)
      ? <> <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href={`/admin/veiculos/${vehicleId}`} prefetch={false}>Recarregar a página</Link></>
      : null}
  </p>;
}
