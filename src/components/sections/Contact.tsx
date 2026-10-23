import { ArrowUpRight, MapPin, Phone } from 'lucide-react';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';
import { MAP_EMBED_URL, MAP_URL, STORE, STORE_ADDRESS_LINE, STORE_STREET_ADDRESS } from '@/data/store';

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
              A GENTE SE<br />ENCONTRA<br /><span>NA PARANGABA.</span>
            </h2>
            <p className="contact-copy">
              Conheça a Liberato Motos Car em Fortaleza ou chame a equipe pelo
              WhatsApp para conversar sobre o seu próximo veículo.
            </p>
            <ul className="contact-details">
              <li><MapPin size={19} aria-hidden="true" /> {STORE_ADDRESS_LINE}</li>
              <li><Phone size={19} aria-hidden="true" /> {STORE.phoneDisplay}</li>
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
          <div className="map-card">
            <iframe
              className="map-frame"
              title={`Mapa da ${STORE.name} em ${STORE_ADDRESS_LINE}`}
              src={MAP_EMBED_URL}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="map-label">
              <div>
                <span>LIBERATO MOTOS CAR</span>
                <strong>{STORE_STREET_ADDRESS}<br />{STORE.district} • {STORE.city}/{STORE.state}</strong>
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
