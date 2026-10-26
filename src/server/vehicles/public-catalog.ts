import type { InventoryVehicle } from '@/data/inventory-vehicles';
import type { listPublicVehiclesWithCover } from './service';

type PublicListing = Awaited<ReturnType<typeof listPublicVehiclesWithCover>>[number];

export function toCatalogVehicle(vehicle: PublicListing): InventoryVehicle {
  const title = [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(' ');
  const category = vehicle.type === 'motorcycle' ? 'moto' : 'carro';
  const year = vehicle.year ?? undefined;
  const kilometers = vehicle.mileageKm ?? undefined;
  return {
    slug: vehicle.slug,
    sourceStatus: 'confirmed_in_listing',
    brand: vehicle.brand ?? '', model: vehicle.model ?? '', version: vehicle.version ?? undefined,
    title, year, kilometers, priceBRL: (vehicle.priceCents ?? 0) / 100,
    category, categoryLabel: category === 'moto' ? 'Moto' : 'Carro',
    color: vehicle.color ?? 'Não informada', condition: 'Não informada',
    availability: vehicle.status === 'reserved' ? 'reservado' : vehicle.status === 'sold' ? 'vendido' : 'disponivel',
    image: vehicle.image ?? '/images/fachada.png',
    imageAlt: vehicle.image ? `Foto de ${title}` : 'Foto do veículo indisponível; fachada da loja',
    shortDescription: vehicle.description?.slice(0, 160) ?? `${title} anunciado pela Liberato Motos Car.`,
    description: vehicle.description ?? `Consulte a loja para mais detalhes sobre ${title}.`,
    highlights: [year ? `Ano ${year}` : null, kilometers !== undefined ? `${kilometers.toLocaleString('pt-BR')} km` : null]
      .filter((item): item is string => Boolean(item)),
    pendingVerification: [],
  };
}
