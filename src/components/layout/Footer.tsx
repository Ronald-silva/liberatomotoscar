import Link from 'next/link';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div>
          <div className="footer-mark">LIBERATO<br /><span>MOTOS CAR</span></div>
          <p>Compra, venda e troca. Atendimento na Itaoca, Fortaleza/CE.</p>
        </div>
        <nav className="footer-links" aria-label="Navegação do rodapé">
          <Link href="/#vitrine">Seleção</Link>
          <Link href="/#experiencia">Experiência</Link>
          <Link href="/#localizacao">Localização</Link>
          <WhatsAppLink subject="a loja" placement="footer">WhatsApp</WhatsAppLink>
        </nav>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Liberato Motos Car.</span>
        <span>Prévia comercial • imagens de veículos ilustrativas</span>
      </div>
    </footer>
  );
}
