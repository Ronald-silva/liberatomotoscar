import { connection } from 'next/server';
import { Header } from '@/components/layout/Header';
import { Hero } from '@/components/hero/Hero';
import { Credibility } from '@/components/sections/Credibility';
import { Showcase } from '@/components/showcase/Showcase';
import { Experience } from '@/components/sections/Experience';
import { Contact } from '@/components/sections/Contact';
import { Footer } from '@/components/layout/Footer';
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
        {/* Sem <Suspense>: `vehicles` já foi aguardado acima, então o boundary nunca
            suspendia — só fazia o Next transmitir a vitrine fora de ordem, depois do
            rodapé. Sem JavaScript, o catálogo aparecia no fim da página. */}
        <Reveal><Showcase vehicles={vehicles} /></Reveal>
        <Reveal><Experience /></Reveal>
        <Reveal><Contact /></Reveal>
      </main>
      <Footer />
      <JsonLd schema={buildAutoDealerSchema()} />
    </>
  );
}
