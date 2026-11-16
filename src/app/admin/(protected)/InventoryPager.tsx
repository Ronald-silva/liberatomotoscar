import Link from 'next/link';
import styles from '../admin.module.css';
import { inventoryHref } from './inventoryQuery';
import type { VehicleStatus } from './veiculos/status';

/**
 * Anterior/próxima, e só quando há mais de uma página.
 *
 * Com o estoque de hoje este componente não desenha nada — é essa a intenção. Paginar onze
 * veículos seria pôr um controle a mais na tela para resolver um problema que ainda não existe;
 * o que o limite do servidor evita é a tela de duzentos veículos baixar duzentas capas assinadas.
 *
 * Numeração página a página ficaria de fora mesmo com volume: dez fichas de número no celular são
 * dez alvos de 44px disputando a largura. Dois botões grandes e a posição por escrito dizem a
 * mesma coisa e cabem.
 */
export function InventoryPager({ status, search, page, pages }: {
  status?: VehicleStatus; search: string; page: number; pages: number;
}) {
  if (pages <= 1) return null;
  const atual = Math.min(Math.max(1, page), pages);
  return <nav className={styles.pager} aria-label="Páginas do estoque">
    {atual > 1
      ? <Link className={`${styles.button} ${styles.buttonSecondary}`} href={inventoryHref({ status, search, page: atual - 1 })}
          rel="prev">Anterior</Link>
      : <span className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonDisabled}`} aria-hidden="true">Anterior</span>}
    <p className={styles.pagerPosition} role="status">Página {atual} de {pages}</p>
    {atual < pages
      ? <Link className={`${styles.button} ${styles.buttonSecondary}`} href={inventoryHref({ status, search, page: atual + 1 })}
          rel="next">Próxima</Link>
      : <span className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonDisabled}`} aria-hidden="true">Próxima</span>}
  </nav>;
}
