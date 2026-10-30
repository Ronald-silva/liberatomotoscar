import type { Metadata } from 'next';
import { connection } from 'next/server';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, ChevronRight } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Viewer360 } from '@/components/viewer-360/Viewer360';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';
import { VehicleViewEvent } from '@/components/marketing/VehicleViewEvent';
import { InventoryDetail } from '@/components/vehicles/InventoryDetail';
import { JsonLd } from '@/components/seo/JsonLd';
import { DEMO_VEHICLES, getDemoVehicle } from '@/data/mock-vehicles';
import { buildBreadcrumbSchema, buildVehicleSchema } from '@/lib/structured-data';
import { getPublicVehicleWithPhotos, listPublicVehiclesWithCover } from '@/server/vehicles/service';
import { toCatalogVehicle } from '@/server/vehicles/public-catalog';

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  await connection();
  const publicVehicle = await getPublicVehicleWithPhotos(slug);
  const stockVehicle = publicVehicle ? toCatalogVehicle({ ...publicVehicle, image: publicVehicle.images[0] ?? null }) : null;
  if (stockVehicle) {
    const title = `${stockVehicle.title} ${stockVehicle.color}`;
    const description = stockVehicle.availability === 'vendido'
      ? `${stockVehicle.title} foi vendido. Consulte outros veículos da Liberato Motos Car.`
      : stockVehicle.availability === 'reservado'
        ? `${stockVehicle.title} está reservado. Consulte a Liberato Motos Car para verificar a disponibilidade.`
        : `${stockVehicle.shortDescription} Confira os dados informados no anúncio e consulte a Liberato Motos Car.`;
    return {
      title,
      description,
      openGraph: { type: 'article', title, description, url: `/veiculos/${slug}` },
      twitter: { card: 'summary_large_image', title, description },
    };
  }
  const vehicle = getDemoVehicle(slug);
  if (!vehicle) return { title: 'Conceito não encontrado' };
  const title = `${vehicle.title} — conceito de vitrine`;
  const description = `${vehicle.subtitle}. Apresentação ilustrativa da Liberato Motos Car em Fortaleza.`;
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
  const stockVehicle = publicVehicle ? toCatalogVehicle({ ...publicVehicle, image: publicVehicle.images[0] ?? null }) : null;
  if (stockVehicle) {
    return (
      <div className="detail-page">
        <Header />
        <main id="conteudo"><InventoryDetail vehicle={stockVehicle} vehicles={publicListings.map(toCatalogVehicle)} images={publicVehicle?.images ?? []} /></main>
        <Footer />
        <VehicleViewEvent slug={stockVehicle.slug} category={stockVehicle.category} />
        <JsonLd schema={buildVehicleSchema(stockVehicle)} />
        <JsonLd schema={buildBreadcrumbSchema(stockVehicle)} />
      </div>
    );
  }
  const vehicle = getDemoVehicle(slug);
  if (!vehicle) notFound();
  const related = DEMO_VEHICLES.filter((item) => item.slug !== slug).slice(0, 2);

  return (
    <div className="detail-page">
      <Header />
      <main id="conteudo">
        <section className="detail-hero" aria-labelledby="detail-title">
          <div className="container">
            <nav className="breadcrumb" aria-label="Você está em">
              <Link href="/">Início</Link><ChevronRight size={13} aria-hidden="true" />
              <Link href="/#vitrine">Seleção</Link><ChevronRight size={13} aria-hidden="true" />
              <span aria-current="page">{vehicle.title}</span>
            </nav>
            <div className="detail-grid">
              <Viewer360
                images={vehicle.images360?.length ? vehicle.images360 : [vehicle.image]}
                title={vehicle.title}
                alt={vehicle.imageAlt}
              />
              <div>
                <p className="eyebrow"><span className="eyebrow-line" /> {vehicle.categoryLabel}</p>
                <h1 id="detail-title" className="detail-title">{vehicle.title}</h1>
                <span className="detail-label">APRESENTAÇÃO ILUSTRATIVA</span>
                <p className="detail-subtitle">{vehicle.subtitle}</p>
                <p className="detail-copy">{vehicle.description}</p>
                <ul className="detail-highlights">
                  {vehicle.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                </ul>
                <div className="detail-cta">
                  <WhatsAppLink
                    className="button button--red"
                    subject={`as opções de ${vehicle.categoryLabel.toLowerCase()} — referência ${vehicle.slug}`}
                    placement={`detail_${vehicle.slug}`}
                    showArrow
                  >
                    Consultar opções
                  </WhatsAppLink>
                  <Link className="button button--outline" href="/#vitrine">
                    <ArrowLeft size={17} aria-hidden="true" /> Voltar à seleção
                  </Link>
                </div>
                <p className="detail-disclaimer">
                  Esta imagem demonstra o formato do futuro catálogo. Não representa um veículo disponível, preço, condição de crédito ou garantia da loja.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="related" aria-labelledby="related-title">
          <div className="container">
            <h2 id="related-title">EXPLORE OUTROS CONCEITOS</h2>
            <div className="related-grid">
              {related.map((item) => (
                <Link className="related-link" href={`/veiculos/${item.slug}`} key={item.slug}>
                  <span className="related-thumb"><Image src={item.image} alt="" fill sizes="116px" /></span>
                  <span><span>{item.categoryLabel}</span><strong>{item.title}</strong></span>
                  <ArrowUpRight size={20} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <VehicleViewEvent slug={vehicle.slug} category={vehicle.category} />
    </div>
  );
}
