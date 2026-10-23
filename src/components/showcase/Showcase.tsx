'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, MoveRight } from 'lucide-react';
import type { VehicleCategory } from '@/data/mock-vehicles';
import { INVENTORY_VEHICLES, formatKilometers, formatPrice } from '@/data/inventory-vehicles';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';

type Filter = VehicleCategory | 'todos';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'moto', label: 'Motos' },
  { value: 'carro', label: 'Carros' },
];

export function Showcase() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const category = searchParams.get('categoria');
  const activeFilter: Filter = category === 'moto' || category === 'carro' ? category : 'todos';

  function selectFilter(value: Filter) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'todos') params.delete('categoria');
    else params.set('categoria', value);
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}#vitrine`, { scroll: false });
  }

  const vehicles = INVENTORY_VEHICLES.filter(
    (vehicle) => activeFilter === 'todos' || vehicle.category === activeFilter,
  );

  return (
    <section className="showcase section-pad" id="vitrine" aria-labelledby="showcase-title">
      <div className="container">
        <div className="section-topline">
          <span className="eyebrow"><span className="eyebrow-line" /> VEÍCULOS LIBERATO</span>
          <span className="section-index">01 / 03</span>
        </div>
        <div className="showcase-heading">
          <div>
            <h2 id="showcase-title" className="section-title">
              ESCOLHA O SEU<br /><span>PRÓXIMO CAMINHO.</span>
            </h2>
            <p className="section-intro">
              Conheça os veículos anunciados, compare os dados informados e
              fale com a loja sobre a opção que faz sentido para você.
            </p>
          </div>
          <div className="filter-list" aria-label="Filtrar veículos por categoria">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`filter-button ${activeFilter === filter.value ? 'is-active' : ''}`}
                aria-pressed={activeFilter === filter.value}
                onClick={() => selectFilter(filter.value)}
              >
                {filter.label}
                <sup>
                  {filter.value === 'todos'
                    ? INVENTORY_VEHICLES.length
                    : INVENTORY_VEHICLES.filter((v) => v.category === filter.value).length}
                </sup>
              </button>
            ))}
          </div>
        </div>

        <p className="demo-note" role="note">
          DADOS FORNECIDOS PARA OS ANÚNCIOS. CONFIRME PREÇO, DISPONIBILIDADE E CONDIÇÕES COM A LOJA.
        </p>
        <p className="sr-only" aria-live="polite">
          {vehicles.length} {vehicles.length === 1 ? 'opção exibida' : 'opções exibidas'}.
        </p>

        {vehicles.length > 0 ? (
          <div className="vehicle-grid">
            {vehicles.map((vehicle, index) => (
              <article
                className="vehicle-card"
                key={vehicle.slug}
              >
                <div className="vehicle-image-wrap">
                  <Image
                    src={vehicle.image}
                    alt={vehicle.imageAlt}
                    fill
                    sizes="(max-width: 800px) 100vw, 45vw"
                    className="vehicle-image"
                  />
                  <span className="vehicle-reflection" aria-hidden="true">
                    <Image
                      src={vehicle.image}
                      alt=""
                      fill
                      sizes="(max-width: 800px) 100vw, 45vw"
                      className="vehicle-reflection-art"
                    />
                  </span>
                  <span className="vehicle-number">0{index + 1}</span>
                  <span className="vehicle-type">{vehicle.categoryLabel}</span>
                </div>
                <div className="vehicle-content">
                  <div>
                    <p className="vehicle-kicker">{vehicle.categoryLabel.toUpperCase()} • {vehicle.condition.toUpperCase()}</p>
                    <h3>{vehicle.title}</h3>
                    <p>{vehicle.shortDescription}</p>
                    <dl className="vehicle-facts">
                      {vehicle.year !== undefined && <div><dt>Ano</dt><dd>{vehicle.year}</dd></div>}
                      {vehicle.kilometers !== undefined && <div><dt>Km</dt><dd>{formatKilometers(vehicle.kilometers)}</dd></div>}
                      <div><dt>Cor</dt><dd>{vehicle.color}</dd></div>
                    </dl>
                  </div>
                  <strong className="vehicle-price">{formatPrice(vehicle.priceBRL)}</strong>
                  <div className="vehicle-links">
                    <Link href={`/veiculos/${vehicle.slug}`} className="text-link">
                      Ver detalhes de {vehicle.model} <ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                    <WhatsAppLink
                      className="vehicle-contact"
                      subject={`${vehicle.title} — referência ${vehicle.slug}`}
                      placement={`card_${vehicle.slug}`}
                    >
                      Consultar veículo <MoveRight size={17} aria-hidden="true" />
                    </WhatsAppLink>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Nenhum veículo anunciado nesta categoria.</p>
            <button type="button" onClick={() => selectFilter('todos')}>
              Ver todas as opções
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
