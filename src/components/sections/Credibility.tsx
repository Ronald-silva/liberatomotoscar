import { ArrowUpRight, Star } from 'lucide-react';
import { GOOGLE_PROFILE } from '@/data/store';
import { STORE_POLICY } from '@/data/store-policy';
import type { InventoryVehicle } from '@/data/inventory-vehicles';

export function Credibility({ vehicles }: { vehicles: InventoryVehicle[] }) {
  const motorcycles = vehicles.filter((vehicle) => vehicle.category === 'moto').length;
  const cars = vehicles.length - motorcycles;
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
          <span className="proof-value">{vehicles.length}</span>
          <span className="proof-note">
            {motorcycles} motos e {cars} carros
          </span>
        </div>

        <div className="proof">
          <span className="proof-label">Antes da vitrine</span>
          <span className="proof-value proof-value--list">Veículo revisado</span>
          <span className="proof-note">
            {STORE_POLICY.revisaoAntesDaVitrine
              ? `${STORE_POLICY.revisaoAntesDaVitrine.charAt(0).toLocaleUpperCase('pt-BR')}${STORE_POLICY.revisaoAntesDaVitrine.slice(1)}.`
              : null}
          </span>
        </div>

        <div className="proof">
          <span className="proof-label">Atendimento</span>
          <span className="proof-value proof-value--list">WhatsApp e loja física</span>
        </div>
      </div>
    </section>
  );
}
