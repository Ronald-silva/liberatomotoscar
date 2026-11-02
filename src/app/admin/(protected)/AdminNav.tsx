'use client';

import { usePathname } from 'next/navigation';
import { AdminTabBar, type Destination } from './AdminTabBar';
import type { TabCounts } from './tabCounts';

/** Só o cliente sabe a rota atual (layout não relê a cada navegação); daí este pequeno casco em volta da barra. */
export function activeDestination(pathname: string): Destination | null {
  if (pathname.startsWith('/admin/ajustes')) return null;
  if (pathname.startsWith('/admin/agenda')) return 'agenda';
  if (pathname.startsWith('/admin/divulgar')) return 'divulgar';
  if (pathname.startsWith('/admin/atendimento')) return 'conversas';
  return 'estoque';
}

export function AdminNav({ counts }: { counts: TabCounts }) {
  return <AdminTabBar active={activeDestination(usePathname())} counts={counts} />;
}
