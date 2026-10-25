import { redirect } from 'next/navigation';
import { requireAdmin, AccessDeniedError } from '@/server/authz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  let denied = false;
  try { await requireAdmin(); } catch (error) {
    if (error instanceof AccessDeniedError) denied = true;
    else throw error;
  }
  if (denied) redirect('/admin/login');
  return children;
}
