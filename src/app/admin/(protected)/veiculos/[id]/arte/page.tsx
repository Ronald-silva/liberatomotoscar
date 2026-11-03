import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getArtVehicleData, artExportProblem } from '@/server/art-studio/vehicle-art-data';
import { SITE_URL, STORE } from '@/data/store';
import { ArtEditor } from '@/components/art-studio/ArtEditor';

export const metadata: Metadata = { title: 'Criar arte', robots: { index: false, follow: false } };

export default async function ArtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getArtVehicleData(id).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'ZodError') return null;
    throw error;
  });
  if (!data) notFound();
  const { vehicle, photos } = data;
  return <ArtEditor vehicle={{ id: vehicle.id, version: vehicle.versionNumber, status: vehicle.status,
    title: [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(' ') || 'Veículo sem título',
    year: vehicle.year, price: vehicle.priceCents ? new Intl.NumberFormat('pt-BR',
      { style: 'currency', currency: 'BRL' }).format(vehicle.priceCents / 100) : 'Preço não informado',
    priceCents: vehicle.priceCents, slug: vehicle.slug, type: vehicle.type,
    brand: vehicle.brand, model: vehicle.model, mileageKm: vehicle.mileageKm, color: vehicle.color,
    publicUrl: SITE_URL.startsWith('https://') ? `${SITE_URL}/veiculos/${vehicle.slug}` : null }}
    photos={photos.map((photo) => ({ id: photo.id, isCover: photo.isCover,
      // Fotos importadas já são públicas. Usar o arquivo diretamente evita
      // redirecionamento pelo endereço interno do servidor no Railway.
      src: photo.storageProvider === 'legacy_public' && /^\/images\/[a-zA-Z0-9._-]+$/.test(photo.storageKey)
        ? photo.storageKey : `/api/admin/vehicles/${vehicle.id}/art-photo/${photo.id}` }))}
    phone={STORE.phoneDisplay} exportProblem={artExportProblem(data)} />;
}
