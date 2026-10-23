import Link from 'next/link';
import Image from 'next/image';
import { MapPin } from 'lucide-react';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';

export function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/" aria-label="Liberato Motos Car, página inicial">
          <span className="brand-art" aria-hidden="true">
            <Image
              src="/logosf.png"
              alt=""
              width={2000}
              height={2000}
              priority
              sizes="180px"
            />
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Navegação principal">
          <Link href="/#vitrine">Seleção</Link>
          <Link href="/#experiencia">Experiência</Link>
          <Link href="/#localizacao">A loja</Link>
        </nav>

        <div className="header-actions">
          <span className="header-location">
            <MapPin size={14} aria-hidden="true" /> Itaoca, Fortaleza
          </span>
          <WhatsAppLink
            className="button button--small button--red"
            subject="a loja"
            placement="header"
            showArrow
          >
            Fale conosco
          </WhatsAppLink>
        </div>
      </div>
    </header>
  );
}
