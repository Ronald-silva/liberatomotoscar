import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { artExportProblem } from '@/server/art-studio/policy';
import { listAdminVehiclesWithCover } from '@/server/vehicles/service';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Divulgar', robots: { index: false, follow: false } };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
type Stock = Awaited<ReturnType<typeof listAdminVehiclesWithCover>>;

export default async function DivulgarPage() {
  // Sem o estoque a tela não pode parecer vazia: "nenhum publicado" seria uma afirmação falsa.
  const published = await listAdminVehiclesWithCover({ status: 'published' }).catch((error: unknown): Stock | null => {
    console.error('Falha ao carregar os veículos para divulgar', error);
    return null;
  });
  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <section className={styles.listPanel} aria-labelledby="divulgar-title">
      <h1 id="divulgar-title" className={styles.heading}>Divulgar</h1>
      <p className={styles.description}>Escolha o veículo, monte a arte e envie direto pelo WhatsApp ou pelo aplicativo que preferir.</p>
      {published === null ? <p className={styles.description} role="alert">
        Não foi possível carregar os veículos agora. Atualize a página para tentar de novo.</p>
      : published.length === 0 ? <div className={styles.empty}>
        <p className={styles.description}>Nenhum veículo publicado no momento.</p>
        <p className={styles.description}>A arte só é criada para veículo publicado. Publique um anúncio no estoque e ele aparece aqui.</p>
        <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/admin">Ver o estoque</Link>
      </div> : <ul className={styles.vehicleList}>
        {published.map((vehicle) => {
          const title = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Sem título';
          // A tela de arte recusa veículo sem dados; levar a pessoa até lá só para ler a recusa seria um caminho que falha.
          // A lista só conhece a capa, mas quem tem capa tem foto; a foto ausente é problema do cadastro do mesmo jeito.
          const problem = artExportProblem({ vehicle, photos: vehicle.coverUrl ? [vehicle.coverUrl] : [] });
          return <li key={vehicle.id}>
            <div className={styles.vehicleCard}>
              {vehicle.coverUrl
                ? <Image className={styles.cover} src={vehicle.coverUrl} alt="" width={144} height={112} sizes="72px" unoptimized={!vehicle.coverUrl.startsWith('/')} />
                : <span className={styles.coverEmpty} aria-hidden="true">Sem foto</span>}
              <span className={styles.vehicleTitle}>{title}</span>
              <span className={styles.vehicleMeta}>{vehicle.year ?? 'Ano não informado'}</span>
              <span className={styles.vehiclePrice}>{vehicle.priceCents !== null ? brl.format(vehicle.priceCents / 100) : 'Sem preço'}</span>
              {problem ? <>
                <span className={styles.vehicleMeta}>{problem}</span>
                <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href={`/admin/veiculos/${vehicle.id}`}
                  aria-label={`Completar cadastro: ${title}`}>Completar cadastro</Link>
              </> : <Link className={`${styles.button} ${styles.buttonCompact}`} href={`/admin/veiculos/${vehicle.id}/arte`}
                aria-label={`Criar arte: ${title}`}>Criar arte</Link>}
            </div>
          </li>;
        })}
      </ul>}
    </section>
  </main>;
}
