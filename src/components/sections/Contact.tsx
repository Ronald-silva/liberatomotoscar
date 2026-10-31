import { ArrowUpRight, CalendarCheck, Clock, MapPin, Phone } from 'lucide-react';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';
import { MAP_EMBED_URL, MAP_URL, STORE, STORE_ADDRESS_LINE } from '@/data/store';
import { STORE_POLICY } from '@/data/store-policy';

export function Contact() {
  return (
    <section className="contact section-pad" id="localizacao" aria-labelledby="contact-title">
      <div className="container">
        <div className="section-topline">
          <span className="eyebrow"><span className="eyebrow-line" /> ONDE ESTAMOS</span>
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
              <li><Clock size={19} aria-hidden="true" /> {STORE_POLICY.horarioEstruturado.rotulo}</li>
              {/* O horário sozinho convidaria o cliente a aparecer de surpresa, e
                  `visitaExigeAgendamento` diz o contrário: ver veículo é sempre com hora
                  marcada. As duas linhas andam juntas ou a página engana. */}
              {STORE_POLICY.visitaExigeAgendamento && (
                <li>
                  <CalendarCheck size={19} aria-hidden="true" />
                  Para ver um veículo, combine o horário antes pelo WhatsApp
                </li>
              )}
              <li>
                <Phone size={19} aria-hidden="true" />
                <a href={`tel:${STORE.phoneE164}`}>{STORE.phoneDisplay}</a>
              </li>
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
            {/* A etiqueta já teve o endereço completo e depois bairro/cidade — a poucos
                centímetros da lista ao lado, que diz a mesma coisa. Agora só nomeia o ponto
                e oferece a ação; o endereço tem um lugar só na página. */}
            <div className="map-label">
              <div>
                <span className="map-label-name">{STORE.name}</span>
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
