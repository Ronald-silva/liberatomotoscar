import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ADMIN_PAGE_SIZE, countAdminVehiclesByStatus, listAdminVehicles, listAdminVehiclesWithCover } from '@/server/vehicles/service';
import { logoutAdmin } from '../actions';
import styles from '../admin.module.css';
import { pageCount, parsePage, parseSearch } from './inventoryQuery';
import { InventoryPager } from './InventoryPager';
import { InventorySearch } from './InventorySearch';
import { parseStatusFilter, StatusFilter } from './StatusFilter';
import { badgeClassName, statusLabels } from './veiculos/status';

export const metadata: Metadata = { title: 'Painel', robots: { index: false, follow: false } };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default async function AdminPage({ searchParams }: {
  searchParams: Promise<{ estado?: string | string[]; busca?: string | string[]; pagina?: string | string[] }>;
}) {
  const params = await searchParams;
  const status = parseStatusFilter(params.estado);
  const search = parseSearch(params.busca);
  const page = parsePage(params.pagina);
  // Lista e contagem em paralelo: cada ida ao banco custa ~53 ms, então esperar uma pela outra dobraria a espera do dono.
  // Se o armazenamento de fotos falhar (R2 ausente ou errado), o estoque aparece sem capas em vez de derrubar o painel.
  const [vehicles, counts] = await Promise.all([
    listAdminVehiclesWithCover({ status, search, page })
      .catch((error: unknown) => {
        console.error('Falha ao carregar capas do estoque', error);
        return listAdminVehicles().then((rows) => rows
          .filter((row) => status ? row.status === status : row.status !== 'discarded')
          .map((row) => ({ ...row, coverUrl: null as string | null })));
      }),
    countAdminVehiclesByStatus(search).catch((error: unknown) => {
      console.error('Falha ao contar veículos por situação', error);
      return null;
    }),
  ]);
  // O total do recorte aberto: a ficha escolhida, ou tudo menos o descartado. Sem contagem — o
  // group by falhou — a tela não inventa número nenhum e também não pagina no escuro.
  const total = counts === null ? null
    : status ? counts[status]
      : Object.entries(counts).filter(([chave]) => chave !== 'discarded').reduce((soma, [, valor]) => soma + valor, 0);
  const pages = total === null ? 1 : pageCount(total, ADMIN_PAGE_SIZE);
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
      <InventorySearch search={search} status={status} total={total} />
      <StatusFilter counts={counts} active={status} search={search} />
      {vehicles.length === 0 ? <div className={styles.empty}>
        <p className={styles.description}>{search
          ? 'Nenhum veículo encontrado. Tente outra palavra, ou limpe a busca.'
          : status
            ? 'Nenhum veículo nesta situação.'
            : 'Nenhum veículo cadastrado ainda. Comece cadastrando o primeiro.'}</p>
        {status || search ? <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href="/admin">Ver tudo</Link> : null}
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
        <InventoryPager status={status} search={search} page={page} pages={pages} />
        <div className={styles.stickyAction}>{create}</div>
      </>}
    </section>
  </main>;
}
