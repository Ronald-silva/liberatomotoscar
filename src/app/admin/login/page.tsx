import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { isAdminAuthConfigured } from '@/server/auth-policy';
import { hasAdminGrant } from '@/server/authz';
import { logoutAdmin, startAdminLogin } from '../actions';
import styles from '../admin.module.css';
import { LoginButton } from './LoginButton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Entrar no painel', robots: { index: false, follow: false } };

type LoginPageProps = { searchParams: Promise<{ status?: string; error?: string }> };

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const configured = isAdminAuthConfigured();
  const session = configured ? await getAuth().auth() : null;
  const signedIn = Boolean(session?.user?.id);
  if (session?.user?.id && await hasAdminGrant(session.user.id)) redirect('/admin');
  const params = await searchParams;
  const blocked = signedIn;
  const limited = params.status === 'limit';
  const failed = Boolean(params.error);

  return <main id="conteudo" className={styles.screen}>
    <section className={styles.panel} aria-labelledby="admin-login-title">
      <Image className={styles.logo} src="/logo-liberato-negativo.png" alt="Liberato Motos Car" width={160} height={75} priority />
      <p className={styles.eyebrow}>Área do proprietário</p>
      <h1 id="admin-login-title" className={styles.heading}>Entrar no painel</h1>
      <p className={styles.description}>Use a conta Google autorizada para acessar os veículos pelo celular.</p>
      {!configured && <p className={styles.notice} role="status">O acesso ainda está em preparação. Configure a conta autorizada no servidor.</p>}
      {limited && <p className={styles.notice} role="alert">Muitas tentativas de entrada. Aguarde alguns minutos e tente novamente.</p>}
      {failed && !limited && <p className={styles.notice} role="alert">Não foi possível entrar. Confira a conta Google e tente novamente.</p>}
      {blocked && <p className={styles.notice} role="status">Esta conta ainda não tem acesso ao painel. Peça a liberação ao responsável pelo sistema.</p>}
      {configured && !blocked && <form className={styles.form} action={startAdminLogin}><LoginButton /></form>}
      {blocked && <form className={styles.form} action={logoutAdmin}><button className={`${styles.button} ${styles.buttonSecondary}`} type="submit">Sair desta conta</button></form>}
      <p className={styles.small}>O acesso é exclusivo do proprietário autorizado.</p>
    </section>
  </main>;
}
