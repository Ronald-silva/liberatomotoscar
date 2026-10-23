import { Suspense } from 'react';
import { Header } from '@/components/layout/Header';
import { Hero } from '@/components/hero/Hero';
import { Showcase } from '@/components/showcase/Showcase';
import { Experience } from '@/components/sections/Experience';
import { Contact } from '@/components/sections/Contact';
import { Footer } from '@/components/layout/Footer';

export default function Home() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />
        <Suspense fallback={<div className="showcase-loading" aria-hidden="true" />}>
          <Showcase />
        </Suspense>
        <Experience />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
