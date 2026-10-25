import type { Metadata } from 'next';
import Image from 'next/image';
import { logoutAdmin } from '../actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Painel', robots: { index: false, follow: false } };

export default function AdminPage() {
  return <main id="conteudo" className={styles.screen}>
    <section className={styles.panel} aria-labelledby="admin-title">
      <Image className={styles.logo} src="/logo-liberato-negativo.png" alt="Liberato Motos Car" width={160} height={75} priority />
      <p className={styles.eyebrow}>Área do proprietário</p>
      <h1 id="admin-title" className={styles.heading}>Acesso confirmado</h1>
      <p className={styles.description}>O painel está protegido. O cadastro de veículos será adicionado na próxima etapa.</p>
      <form className={styles.form} action={logoutAdmin}>
        <button className={`${styles.button} ${styles.buttonSecondary}`} type="submit">Sair do painel</button>
      </form>
    </section>
  </main>;
}
