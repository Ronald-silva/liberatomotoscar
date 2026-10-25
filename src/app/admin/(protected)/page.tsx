import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { listAdminVehiclesWithCover } from '@/server/vehicles/service';
import { logoutAdmin } from '../actions';
import styles from '../admin.module.css';
import { badgeClassName, statusLabels } from './veiculos/status';

export const metadata: Metadata = { title: 'Painel', robots: { index: false, follow: false } };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default async function AdminPage() {
  const vehicles = await listAdminVehiclesWithCover();
  const create = <Link className={styles.button} href="/admin/veiculos/novo">Cadastrar veículo</Link>;
  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <section className={styles.listPanel} aria-labelledby="admin-title">
      <header className={styles.listHeader}>
        <Image className={styles.listLogo} src="/logo-liberato-negativo.png" alt="Liberato Motos Car" width={120} height={56} priority />
        <form action={logoutAdmin}>
          <button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} type="submit">Sair do painel</button>
        </form>
      </header>
      <h1 id="admin-title" className={styles.heading}>Estoque</h1>
      {vehicles.length === 0 ? <div className={styles.empty}>
        <p className={styles.description}>Nenhum veículo cadastrado ainda. Comece cadastrando o primeiro.</p>
        <div className={styles.form}>{create}</div>
      </div> : <>
        <ul className={styles.vehicleList}>
          {vehicles.map((vehicle) => <li key={vehicle.id}>
            <Link className={styles.vehicleCard} href={`/admin/veiculos/${vehicle.id}`}>
              {vehicle.coverUrl
                ? <Image className={styles.cover} src={vehicle.coverUrl} alt="" width={144} height={112} sizes="72px" unoptimized={!vehicle.coverUrl.startsWith('/')} />
                : <span className={styles.coverEmpty} aria-hidden="true">Sem foto</span>}
              <span className={styles.vehicleTitle}>{[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Sem título'}</span>
              <span className={badgeClassName(styles, vehicle.status)}>{statusLabels[vehicle.status]}</span>
              <span className={styles.vehicleMeta}>{vehicle.year ?? 'Ano não informado'}</span>
              <span className={styles.vehiclePrice}>{vehicle.priceCents !== null ? brl.format(vehicle.priceCents / 100) : 'Sem preço'}</span>
            </Link>
          </li>)}
        </ul>
        <div className={styles.stickyAction}>{create}</div>
      </>}
    </section>
  </main>;
}
