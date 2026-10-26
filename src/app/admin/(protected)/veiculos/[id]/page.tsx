import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminVehicle } from '@/server/vehicles/service';
import { allowedStatusTransitions, publishRequirements } from '@/server/vehicles/validation';
import styles from '../../../admin.module.css';
import { PhotoGallery } from '../PhotoGallery';
import { PhotoUpload } from '../PhotoUpload';
import { StatusActions } from './StatusActions';
import { VehicleForms } from './VehicleForms';

export const metadata: Metadata = { title: 'Editar veículo', robots: { index: false, follow: false } };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getAdminVehicle(id).catch((error: unknown) => {
    // Identificador malformado (Zod) ou inexistente: página 404, não erro 500.
    if (error instanceof Error && (error.name === 'ZodError' || error.message === 'Veículo não encontrado')) return null;
    throw error;
  });
  if (!found) notFound();
  // O serviço já devolve as fotos com a URL resolvida. Assinatura com erro (ou R2 mal
  // configurado) não derruba a tela: a foto vira espaço vazio, como no estoque.
  const { vehicle, photos } = found;
  // Mesma regra que o serviço aplica ao publicar, item por item, para a tela não prometer o que
  // o servidor vai recusar.
  const requirements = publishRequirements(vehicle, photos.length);
  const missing = requirements.filter((item) => !item.done).map((item) => item.label);
  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <section className={styles.listPanel} aria-labelledby="editar-title">
      <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href="/admin">Voltar ao estoque</Link>
      <h1 id="editar-title" className={styles.heading}>{[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo sem título'}</h1>
      <p className={styles.description}>Siga de cima para baixo: fotos, dados e publicar.</p>

      <h2 className={styles.subheading}><span className={styles.step}>1</span> Fotos</h2>
      <PhotoGallery vehicleId={vehicle.id} version={vehicle.versionNumber} photos={photos} />
      <PhotoUpload vehicleId={vehicle.id} version={vehicle.versionNumber} />

      <h2 className={styles.subheading}><span className={styles.step}>2</span> Dados do veículo</h2>
      <VehicleForms vehicle={vehicle} currentYear={new Date().getFullYear()} />

      <h2 className={styles.subheading}><span className={styles.step}>3</span> Publicar</h2>
      <p className={styles.description}>{missing.length === 0
        ? 'Tudo pronto. Pode publicar.'
        : 'Falta isto para o anúncio poder ser publicado:'}</p>
      <ul className={styles.checklist}>
        {requirements.map((item) => <li key={item.label} className={item.done ? `${styles.checkItem} ${styles.checkItemOn}` : styles.checkItem}>
          <span className={styles.checkMark} aria-hidden="true">{item.done ? '✓' : '○'}</span>
          <span className={styles.visuallyHidden}>{item.done ? 'Pronto: ' : 'Falta: '}</span>
          {item.label}
        </li>)}
      </ul>
      <StatusActions vehicleId={vehicle.id} version={vehicle.versionNumber} status={vehicle.status}
        targets={[...allowedStatusTransitions[vehicle.status]]} publishBlocked={missing} />
    </section>
  </main>;
}
