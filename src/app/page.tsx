import { Suspense } from 'react';
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

export default function Home() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />
        <Reveal><Credibility /></Reveal>
        <Suspense fallback={<div className="showcase-loading" aria-hidden="true" />}>
          <Reveal><Showcase /></Reveal>
        </Suspense>
        <Reveal><Experience /></Reveal>
        <Reveal><Contact /></Reveal>
      </main>
      <Footer />
      <JsonLd schema={buildAutoDealerSchema()} />
    </>
  );
}
