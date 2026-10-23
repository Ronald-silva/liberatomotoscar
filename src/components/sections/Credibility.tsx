import { ArrowUpRight, Star } from 'lucide-react';
import { GOOGLE_PROFILE, STORE } from '@/data/store';
import { INVENTORY_VEHICLES } from '@/data/inventory-vehicles';

/** Marcas derivadas dos anúncios publicados, na ordem em que aparecem na vitrine. */
const BRANDS = [...new Set(INVENTORY_VEHICLES.map((vehicle) => vehicle.brand))];

const MOTORCYCLES = INVENTORY_VEHICLES.filter((vehicle) => vehicle.category === 'moto').length;
const CARS = INVENTORY_VEHICLES.length - MOTORCYCLES;

export function Credibility() {
  return (
    <section className="credibility" aria-label="A loja em números">
      <div className="container credibility-row">
        <div className="proof">
          <span className="proof-label">Avaliação no Google</span>
          <span className="proof-value">
            {GOOGLE_PROFILE.rating}
            <span className="proof-stars" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <Star key={index} size={13} fill="currentColor" strokeWidth={0} />
              ))}
            </span>
          </span>
          <a
            className="proof-note proof-note--link"
            href={GOOGLE_PROFILE.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {GOOGLE_PROFILE.reviewCount} avaliações
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>

        <div className="proof">
          <span className="proof-label">Veículos anunciados</span>
          <span className="proof-value">{INVENTORY_VEHICLES.length}</span>
          <span className="proof-note">
            {MOTORCYCLES} motos e {CARS} carros
          </span>
        </div>

        <div className="proof">
          <span className="proof-label">Marcas nos anúncios</span>
          <span className="proof-value proof-value--list">{BRANDS.join(' · ')}</span>
          <span className="proof-note">Seminovos conferidos com a loja</span>
        </div>

        <div className="proof">
          <span className="proof-label">Atendimento</span>
          <span className="proof-value proof-value--list">{STORE.tagline}</span>
          <span className="proof-note">
            {STORE.district}, {STORE.city}/{STORE.state}
          </span>
        </div>
      </div>
    </section>
  );
}
