import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminPhotoReadUrl, getAdminVehicle } from '@/server/vehicles/service';
import { allowedStatusTransitions } from '@/server/vehicles/validation';
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
  const { vehicle, images } = found;
  // Assinatura com erro (ou R2 mal configurado) não derruba a tela: a foto vira espaço vazio, como no estoque.
  const photos = await Promise.all(images.map(async (image) => ({
    id: image.id, isCover: image.isCover, url: await getAdminPhotoReadUrl(vehicle.id, image.id).catch(() => null),
  })));
  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <section className={styles.listPanel} aria-labelledby="editar-title">
      <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href="/admin">Voltar ao estoque</Link>
      <h1 id="editar-title" className={styles.heading}>{[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo sem título'}</h1>
      <StatusActions vehicleId={vehicle.id} version={vehicle.versionNumber} status={vehicle.status} targets={[...allowedStatusTransitions[vehicle.status]]} />
      <h2 className={styles.subheading}>Fotos</h2>
      <PhotoGallery vehicleId={vehicle.id} version={vehicle.versionNumber} photos={photos} />
      <PhotoUpload vehicleId={vehicle.id} version={vehicle.versionNumber} />
      <VehicleForms vehicle={vehicle} />
    </section>
  </main>;
}
