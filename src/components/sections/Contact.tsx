import { ArrowUpRight, MapPin, Phone } from 'lucide-react';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';

const MAP_URL =
  'https://www.google.com/maps/search/?api=1&query=R.%20Elcias%20Lopes%2C%20334%2C%20loja%20A%2C%20Itaoca%2C%20Fortaleza%20CE';

export function Contact() {
  return (
    <section className="contact section-pad" id="localizacao" aria-labelledby="contact-title">
      <div className="container">
        <div className="section-topline">
          <span className="eyebrow"><span className="eyebrow-line" /> ONDE ESTAMOS</span>
          <span className="section-index">03 / 03</span>
        </div>
        <div className="contact-grid">
          <div>
            <h2 id="contact-title" className="contact-title">
              A GENTE SE<br />ENCONTRA<br /><span>NA ITAOCA.</span>
            </h2>
            <p className="contact-copy">
              Conheça a Liberato Motos Car em Fortaleza ou chame a equipe pelo
              WhatsApp para conversar sobre o seu próximo veículo.
            </p>
            <ul className="contact-details">
              <li><MapPin size={19} aria-hidden="true" /> R. Elcias Lopes, 334, loja A — Itaoca, Fortaleza/CE</li>
              <li><Phone size={19} aria-hidden="true" /> (85) 99636-5664</li>
            </ul>
            <div className="contact-actions">
              <WhatsAppLink
                className="button button--red"
                subject="visitar a loja"
                placement="contact"
                showArrow
              >
                Conversar no WhatsApp
              </WhatsAppLink>
              <a className="button button--outline" href={MAP_URL} target="_blank" rel="noopener noreferrer">
                Ver rota <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="map-card" aria-label="Representação ilustrativa da localização da loja na Itaoca">
            <div className="map-pin"><MapPin size={23} aria-hidden="true" /></div>
            <div className="map-label">
              <div>
                <span>LIBERATO MOTOS CAR</span>
                <strong>R. Elcias Lopes, 334<br />Itaoca • Fortaleza/CE</strong>
              </div>
              <a href={MAP_URL} target="_blank" rel="noopener noreferrer">
                ABRIR MAPA <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
