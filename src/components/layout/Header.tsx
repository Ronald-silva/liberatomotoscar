import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { Brand } from '@/components/layout/Brand';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';
import { STORE } from '@/data/store';

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand priority />

        <nav className="desktop-nav" aria-label="Navegação principal">
          <Link href="/#vitrine">Seleção</Link>
          <Link href="/#experiencia">Experiência</Link>
          <Link href="/#localizacao">A loja</Link>
        </nav>

        <div className="header-actions">
          <span className="header-location">
            <MapPin size={14} aria-hidden="true" /> {STORE.district}, {STORE.city}
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
