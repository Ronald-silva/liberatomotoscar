import { CalendarDays, Car, Megaphone, MessageCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import styles from '../admin.module.css';
import type { TabCounts } from './tabCounts';

export type Destination = 'estoque' | 'agenda' | 'divulgar' | 'conversas';

const destinations: readonly { id: Destination; label: string; href: string; Icon: LucideIcon; unit?: string }[] = [
  { id: 'estoque', label: 'Estoque', href: '/admin', Icon: Car },
  { id: 'agenda', label: 'Agenda', href: '/admin/agenda', Icon: CalendarDays, unit: 'visitas hoje' },
  { id: 'divulgar', label: 'Divulgar', href: '/admin/divulgar', Icon: Megaphone },
  { id: 'conversas', label: 'Conversas', href: '/admin/atendimento', Icon: MessageCircle, unit: 'aguardando vendedor' },
];

/**
 * Barra fixa de quatro destinos, em toda tela protegida. `active` é null em telas que não são
 * destino (Ajustes). Contagem null ou zero: sem selo, para o número só aparecer quando há o que fazer.
 */
export function AdminTabBar({ active, counts }: { active: Destination | null; counts: TabCounts }) {
  return <nav aria-label="Seções do painel" className={styles.tabBar}>
    {destinations.map(({ id, label, href, Icon, unit }) => {
      const count = id === 'agenda' ? counts.agenda : id === 'conversas' ? counts.conversas : null;
      const shown = count !== null && count > 0 ? count : null;
      return <Link key={id} href={href} className={styles.tabLink}
        aria-label={shown !== null ? `${label}, ${shown} ${unit}` : undefined} aria-current={active === id ? 'page' : undefined}>
        <span className={styles.tabIcon}>
          <Icon size={22} aria-hidden="true" />
          {shown !== null ? <span className={styles.tabBadge} aria-hidden="true">{shown}</span> : null}
        </span>
        <span>{label}</span>
      </Link>;
    })}
  </nav>;
}
