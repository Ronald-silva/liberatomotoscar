import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';

/**
 * Sem esta página, um slug desconhecido — link antigo, anúncio já vendido, endereço digitado
 * errado — caía no 404 padrão do Next: tela preta, sem marca, sem caminho de volta e sem
 * nenhuma forma de falar com a loja.
 */
export default function NotFound() {
  return (
    <div className="detail-page">
      <Header />
      <main id="conteudo">
        <section className="detail-hero" aria-labelledby="not-found-title">
          <div className="container">
            <p className="eyebrow"><span className="eyebrow-line" /> PÁGINA NÃO ENCONTRADA</p>
            <h1 id="not-found-title" className="detail-title">
              ESSE ENDEREÇO<br /><span>NÃO EXISTE MAIS.</span>
            </h1>
            <p className="detail-description">
              O veículo pode ter sido vendido ou o link pode estar incompleto. Veja os
              veículos anunciados agora ou fale com a equipe.
            </p>
            <div className="detail-cta">
              <Link className="button button--red" href="/#vitrine">
                <ArrowLeft size={17} aria-hidden="true" /> Ver os veículos
              </Link>
              <WhatsAppLink
                className="button button--outline"
                subject="um veículo que não encontrei no site"
                placement="not_found"
                showArrow
              >
                Falar no WhatsApp
              </WhatsAppLink>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
