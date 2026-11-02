import { redirect } from 'next/navigation';
import { requireAdmin, AccessDeniedError } from '@/server/authz';
import styles from '../admin.module.css';
import { AdminNav } from './AdminNav';
import { loadTabCounts } from './tabCounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  let denied = false;
  try { await requireAdmin(); } catch (error) {
    if (error instanceof AccessDeniedError) denied = true;
    else throw error;
  }
  if (denied) redirect('/admin/login');
  // A barra mora aqui (e não em cada tela) para estar em toda tela protegida; o login fica fora deste grupo.
  const counts = await loadTabCounts(new Date());
  return <div className={styles.shell}>
    {children}
    <AdminNav counts={counts} />
  </div>;
}
