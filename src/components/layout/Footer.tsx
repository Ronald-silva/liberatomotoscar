import Link from 'next/link';
import { Brand } from '@/components/layout/Brand';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';
import { STORE } from '@/data/store';

/**
 * Assinatura de quem fez o site. Era texto morto: anunciava o autor e não levava ninguém a
 * ele. Como link, o mesmo crédito passa a converter.
 *
 * `null` significa "URL ainda não definida", e nesse caso o crédito volta a ser texto — igual
 * ao resto do projeto, onde campo vazio não se exibe pela metade. Um link quebrado no rodapé
 * de um site no ar é pior que crédito sem link, então aqui não entra placeholder.
 *
 * Preencha com a URL completa, incluindo https://.
 */
const SIGNATURE_URL: string | null = 'https://www.ronaldigital.tech/';
const SIGNATURE_LABEL = 'By RonalDigital Tech';

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
        <span className="footer-signature">
          {SIGNATURE_URL ? (
            <a href={SIGNATURE_URL} target="_blank" rel="noopener">{SIGNATURE_LABEL}</a>
          ) : SIGNATURE_LABEL}
        </span>
      </div>
    </footer>
  );
}
