import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminVehicle } from '@/server/vehicles/service';
import { allowedStatusTransitions, isDiscardable, publishRequirements } from '@/server/vehicles/validation';
import { priceToText, maskMileage } from '../masks';
import { VehicleEditor } from './VehicleEditor';

export const metadata: Metadata = { title: 'Editar veículo', robots: { index: false, follow: false } };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getAdminVehicle(id).catch((error: unknown) => {
    if (error instanceof Error && (error.name === 'ZodError' || error.message === 'Veículo não encontrado')) return null;
    throw error;
  });
  if (!found || found.vehicle.status === 'discarded') notFound();
  const { vehicle, photos } = found;
  const initialMissing = publishRequirements(vehicle, photos.length).filter((item) => !item.done).map((item) => item.label);
  return <VehicleEditor
    vehicleId={vehicle.id} type={vehicle.type} status={vehicle.status}
    slug={vehicle.slug}
    isNew={vehicle.status === 'draft' && vehicle.publishedAt === null} canDiscard={isDiscardable(vehicle)}
    targets={[...allowedStatusTransitions[vehicle.status]]}
    initialVersion={vehicle.versionNumber}
    initialFields={{
      brand: vehicle.brand ?? '', model: vehicle.model ?? '', versionName: vehicle.version ?? '',
      year: String(vehicle.year ?? ''), mileageKm: vehicle.mileageKm === null ? '' : maskMileage(String(vehicle.mileageKm)),
      color: vehicle.color ?? '', description: vehicle.description ?? '', price: priceToText(vehicle.priceCents),
    }}
    initialMissing={initialMissing} photos={photos} currentYear={new Date().getFullYear()} />;
}
