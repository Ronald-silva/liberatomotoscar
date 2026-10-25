'use server';

import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { isAdminAuthConfigured } from '@/server/auth-policy';
import { consumeLoginAttempt } from '@/server/login-rate-limit';

export async function startAdminLogin() {
  if (!isAdminAuthConfigured()) redirect('/admin/login?status=unavailable');
  if (!consumeLoginAttempt().allowed) redirect('/admin/login?status=limit');
  await getAuth().signIn('google', { redirectTo: '/admin' });
}

export async function logoutAdmin() {
  if (!isAdminAuthConfigured()) redirect('/admin/login');
  await getAuth().signOut({ redirectTo: '/admin/login' });
}
