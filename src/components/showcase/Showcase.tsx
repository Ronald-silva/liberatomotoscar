'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, MoveRight } from 'lucide-react';
import { DEMO_VEHICLES, type VehicleCategory } from '@/data/mock-vehicles';
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

  const vehicles = DEMO_VEHICLES.filter(
    (vehicle) => activeFilter === 'todos' || vehicle.category === activeFilter,
  );

  return (
    <section className="showcase section-pad" id="vitrine" aria-labelledby="showcase-title">
      <div className="container">
        <div className="section-topline">
          <span className="eyebrow"><span className="eyebrow-line" /> VITRINE LIBERATO</span>
          <span className="section-index">01 / 03</span>
        </div>
        <div className="showcase-heading">
          <div>
            <h2 id="showcase-title" className="section-title">
              ESCOLHA O SEU<br /><span>PRÓXIMO CAMINHO.</span>
            </h2>
            <p className="section-intro">
              Uma prévia de como cada veículo pode ganhar seu próprio espaço,
              com imagem forte, informação clara e contato imediato.
            </p>
          </div>
          <div className="filter-list" aria-label="Filtrar demonstração por categoria">
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
                    ? DEMO_VEHICLES.length
                    : DEMO_VEHICLES.filter((v) => v.category === filter.value).length}
                </sup>
              </button>
            ))}
          </div>
        </div>

        <p className="demo-note" role="note">
          IMAGENS E CATEGORIAS ILUSTRATIVAS. ESTOQUE, PREÇOS E CONDIÇÕES DEVEM SER CONFIRMADOS COM A LOJA.
        </p>
        <p className="sr-only" aria-live="polite">
          {vehicles.length} {vehicles.length === 1 ? 'opção exibida' : 'opções exibidas'}.
        </p>

        {vehicles.length > 0 ? (
          <div className="vehicle-grid">
            {vehicles.map((vehicle, index) => (
              <article
                className={`vehicle-card ${vehicle.featured && activeFilter === 'todos' ? 'vehicle-card--feature' : ''}`}
                key={vehicle.slug}
              >
                <div className="vehicle-image-wrap">
                  <Image
                    src={vehicle.image}
                    alt={vehicle.imageAlt}
                    fill
                    sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 65vw"
                    className="vehicle-image"
                  />
                  <span className="vehicle-number">0{index + 1}</span>
                  <span className="vehicle-type">{vehicle.categoryLabel}</span>
                </div>
                <div className="vehicle-content">
                  <div>
                    <p className="vehicle-kicker">CONCEITO DE VITRINE</p>
                    <h3>{vehicle.title}</h3>
                    <p>{vehicle.subtitle}</p>
                  </div>
                  <div className="vehicle-links">
                    <Link href={`/veiculos/${vehicle.slug}`} className="text-link">
                      Ver apresentação <ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                    <WhatsAppLink
                      className="vehicle-contact"
                      subject={`as opções de ${vehicle.categoryLabel.toLowerCase()}`}
                      placement={`card_${vehicle.slug}`}
                    >
                      Consultar opções <MoveRight size={17} aria-hidden="true" />
                    </WhatsAppLink>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Nenhum conceito nesta categoria.</p>
            <button type="button" onClick={() => selectFilter('todos')}>
              Ver todas as opções
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
