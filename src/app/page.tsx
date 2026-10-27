import { Suspense } from 'react';
import { connection } from 'next/server';
import { Header } from '@/components/layout/Header';
import { Hero } from '@/components/hero/Hero';
import { Credibility } from '@/components/sections/Credibility';
import { Showcase } from '@/components/showcase/Showcase';
import { Experience } from '@/components/sections/Experience';
import { Contact } from '@/components/sections/Contact';
import { Footer } from '@/components/layout/Footer';
import { SiteChatWidget } from '@/components/attendance/SiteChatWidget';
import { Reveal } from '@/components/motion/Reveal';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildAutoDealerSchema } from '@/lib/structured-data';
import { listPublicVehiclesWithCover } from '@/server/vehicles/service';
import { toCatalogVehicle } from '@/server/vehicles/public-catalog';

export default async function Home() {
  await connection();
  const vehicles = (await listPublicVehiclesWithCover()).map(toCatalogVehicle);
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />
        <Reveal><Credibility vehicles={vehicles} /></Reveal>
        <Suspense fallback={<div className="showcase-loading" aria-hidden="true" />}>
          <Reveal><Showcase vehicles={vehicles} /></Reveal>
        </Suspense>
        <Reveal><Experience /></Reveal>
        <Reveal><Contact /></Reveal>
      </main>
      <Footer />
      <SiteChatWidget />
      <JsonLd schema={buildAutoDealerSchema()} />
    </>
  );
}
