import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <Image
        src="/images/hero-moto-campanha.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="hero-image"
      />
      <div className="hero-shade" aria-hidden="true" />

      <div className="container hero-content">
        <div className="hero-copy">
          <p className="eyebrow eyebrow--light">
            <span className="eyebrow-line" /> FORTALEZA, CE • MOTOS E CARROS
          </p>
          <h1 id="hero-title">
            O PRÓXIMO<br />
            CAPÍTULO<br />
            <em>COMEÇA AQUI.</em>
          </h1>
          <p className="hero-description">
            Compra, venda e troca com conversa direta. Descubra uma nova forma
            de encontrar o veículo que combina com você.
          </p>
          <div className="hero-actions">
            <Link className="button button--red" href="#vitrine">
              Explorar seleção <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <WhatsAppLink
              className="button button--outline"
              subject="as opções de veículos"
              placement="hero"
              showArrow
            >
              Falar no WhatsApp
            </WhatsAppLink>
          </div>
        </div>
      </div>

      <div className="hero-bottom">
        <div className="container hero-bottom-inner">
          <span>LIBERATO MOTOS CAR</span>
          <span>COMPRA <b>•</b> VENDA <b>•</b> TROCA</span>
          <Link href="#vitrine" aria-label="Ir para a seleção de veículos">
            DESLIZE PARA EXPLORAR <ArrowDown size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
