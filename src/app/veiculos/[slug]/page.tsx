import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { VehicleViewEvent } from '@/components/marketing/VehicleViewEvent';
import { InventoryDetail } from '@/components/vehicles/InventoryDetail';
import { JsonLd } from '@/components/seo/JsonLd';
import { formatKilometers } from '@/data/inventory-vehicles';
import { buildBreadcrumbSchema, buildVehicleSchema } from '@/lib/structured-data';
import { getPublicVehicleWithPhotos, listPublicVehiclesWithCover } from '@/server/vehicles/service';
import { toCatalogVehicle } from '@/server/vehicles/public-catalog';

/**
 * O título já foi `${title} ${color}` e rendia "Honda Titan Vermelho" — sem o ano, que é
 * parte do nome do veículo usado, e "Honda Titan Não informada" quando o cadastro não
 * trazia a cor. O ano agora vem no próprio `title`; aqui entra a quilometragem, que é o
 * segundo dado que o comprador procura no resultado de busca.
 */
function buildPageTitle(title: string, kilometers?: number): string {
  return kilometers !== undefined ? `${title} · ${formatKilometers(kilometers)}` : title;
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  await connection();
  const publicVehicle = await getPublicVehicleWithPhotos(slug);
  if (!publicVehicle) return { title: 'Veículo não encontrado' };
  const vehicle = toCatalogVehicle({ ...publicVehicle, image: publicVehicle.images[0] ?? null });
  const title = buildPageTitle(vehicle.title, vehicle.kilometers);
  const description = vehicle.availability === 'vendido'
    ? `${vehicle.title} foi vendido. Consulte outros veículos da Liberato Motos Car.`
    : vehicle.availability === 'reservado'
      ? `${vehicle.title} está reservado. Consulte a Liberato Motos Car para verificar a disponibilidade.`
      : `${vehicle.shortDescription} Confira os dados informados no anúncio e consulte a Liberato Motos Car.`;
  return {
    title,
    description,
    openGraph: { type: 'article', title, description, url: `/veiculos/${slug}` },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function VehiclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await connection();
  const [publicVehicle, publicListings] = await Promise.all([
    getPublicVehicleWithPhotos(slug), listPublicVehiclesWithCover(),
  ]);
  // Os três conceitos ilustrativos de `mock-vehicles.ts` já responderam 200 aqui, com
  // "APRESENTAÇÃO ILUSTRATIVA" e veículos que não existem. Com a loja em operação real, um
  // slug desconhecido é erro de link, não convite a ver uma moto fictícia.
  if (!publicVehicle) notFound();
  const vehicle = toCatalogVehicle({ ...publicVehicle, image: publicVehicle.images[0] ?? null });

  return (
    <div className="detail-page">
      <Header />
      <main id="conteudo">
        <InventoryDetail
          vehicle={vehicle}
          vehicles={publicListings.map(toCatalogVehicle)}
          images={publicVehicle.images}
        />
      </main>
      <Footer />
      <VehicleViewEvent slug={vehicle.slug} category={vehicle.category} />
      <JsonLd schema={buildVehicleSchema(vehicle)} />
      <JsonLd schema={buildBreadcrumbSchema(vehicle)} />
    </div>
  );
}
