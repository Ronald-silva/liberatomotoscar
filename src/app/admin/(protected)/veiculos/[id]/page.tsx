import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminVehicle } from '@/server/vehicles/service';
import styles from '../../../admin.module.css';
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
  const { vehicle } = found;
  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <section className={styles.listPanel} aria-labelledby="editar-title">
      <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href="/admin">Voltar ao estoque</Link>
      <h1 id="editar-title" className={styles.heading}>{[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo sem título'}</h1>
      <VehicleForms vehicle={vehicle} />
    </section>
  </main>;
}
