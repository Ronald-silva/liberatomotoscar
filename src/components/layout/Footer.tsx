import Link from 'next/link';
import { Brand } from '@/components/layout/Brand';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';
import { STORE } from '@/data/store';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-identity">
          <Brand />
          <p>
            {STORE.tagline}. Atendimento na {STORE.district}, {STORE.city}/{STORE.state}.
          </p>
        </div>
        <nav className="footer-links" aria-label="Navegação do rodapé">
          <Link href="/#vitrine">Veículos</Link>
          <Link href="/#experiencia">Experiência</Link>
          <Link href="/#localizacao">A loja</Link>
          <WhatsAppLink subject="a loja" placement="footer">WhatsApp</WhatsAppLink>
        </nav>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} {STORE.name}.</span>
        <span className="footer-signature">By RonalDigital Tech</span>
      </div>
    </footer>
  );
}
