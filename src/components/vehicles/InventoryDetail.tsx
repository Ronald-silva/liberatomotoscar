import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, ChevronRight } from 'lucide-react';
import { Viewer360 } from '@/components/viewer-360/Viewer360';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';
import {
  INVENTORY_VEHICLES,
  formatKilometers,
  formatPrice,
  type InventoryVehicle,
} from '@/data/inventory-vehicles';

export function InventoryDetail({ vehicle }: { vehicle: InventoryVehicle }) {
  const others = INVENTORY_VEHICLES.filter((item) => item.slug !== vehicle.slug);
  const related = [
    ...others.filter((item) => item.category === vehicle.category),
    ...others.filter((item) => item.category !== vehicle.category),
  ].slice(0, 2);

  return (
    <>
      <section className="detail-hero" aria-labelledby="detail-title">
        <div className="container">
          <nav className="breadcrumb" aria-label="Você está em">
            <Link href="/">Início</Link><ChevronRight size={13} aria-hidden="true" />
            <Link href="/#vitrine">Veículos</Link><ChevronRight size={13} aria-hidden="true" />
            <span aria-current="page">{vehicle.title}</span>
          </nav>

          <div className="detail-grid">
            <Viewer360
              images={[vehicle.image]}
              title={vehicle.title}
              alt={vehicle.imageAlt}
              badge="FOTO DO ANÚNCIO"
              singleImageCaption="Uma imagem foi fornecida para este anúncio. Peça mais fotos à loja para avaliar outros ângulos."
            />
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> {vehicle.categoryLabel}</p>
              <h1 id="detail-title" className="detail-title detail-title--inventory">{vehicle.title}</h1>
              <div className="detail-stock-facts" aria-label="Dados principais do anúncio">
                {vehicle.year !== undefined && <span>{vehicle.year}</span>}
                {vehicle.kilometers !== undefined && <span>{formatKilometers(vehicle.kilometers)}</span>}
                <span>{vehicle.color}</span>
              </div>
              <p className="detail-price">{formatPrice(vehicle.priceBRL)}</p>
              <p className="detail-subtitle">{vehicle.shortDescription}</p>
              <ul className="detail-highlights">
                {vehicle.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="detail-information" aria-labelledby="information-title">
        <div className="container detail-information-grid">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" /> SOBRE ESTE VEÍCULO</p>
            <h2 id="information-title">Conheça os detalhes.</h2>
            <p className="detail-description">{vehicle.description}</p>
            <p className="detail-data-note">Preço, quilometragem, disponibilidade e condições comerciais devem ser confirmados com a loja antes da negociação.</p>
          </div>

          <div className="detail-specification" aria-labelledby="specification-title">
            <h2 id="specification-title">Ficha do veículo</h2>
            <h3>Identificação informada no anúncio</h3>
            <dl className="spec-list">
              <div><dt>Marca</dt><dd>{vehicle.brand}</dd></div>
              <div><dt>Modelo</dt><dd>{vehicle.model}</dd></div>
              {vehicle.version && <div><dt>Versão</dt><dd>{vehicle.version}</dd></div>}
              {vehicle.year !== undefined && <div><dt>Ano informado</dt><dd>{vehicle.year}</dd></div>}
              {vehicle.manufactureYear !== undefined && <div><dt>Ano de fabricação</dt><dd>{vehicle.manufactureYear}</dd></div>}
              {vehicle.modelYear !== undefined && <div><dt>Ano-modelo</dt><dd>{vehicle.modelYear}</dd></div>}
              <div><dt>Categoria</dt><dd>{vehicle.categoryLabel}</dd></div>
              <div><dt>Cor</dt><dd>{vehicle.color}</dd></div>
              <div><dt>Condição anunciada</dt><dd>{vehicle.condition}</dd></div>
              {vehicle.availability && <div><dt>Disponibilidade</dt><dd>{vehicle.availability}</dd></div>}
            </dl>

            {vehicle.factoryReference && (
              <div className="factory-reference">
                {vehicle.factoryReference.groups.map((group) => (
                  <div key={group.title}>
                    <h3>{group.title}</h3>
                    <dl className="spec-list">
                      {group.items.map((item) => (
                        <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                      ))}
                    </dl>
                  </div>
                ))}
                <p>
                  Dados de fábrica para a {vehicle.factoryReference.appliesTo.toLowerCase()}.
                  Eles não atestam o estado ou os equipamentos da unidade usada.
                  {' '}Fontes: {vehicle.factoryReference.sources.map((source, index) => (
                    <span key={source.url}>
                      {index > 0 && ' · '}
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.label} <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    </span>
                  ))}
                </p>
              </div>
            )}

            {vehicle.additionalInfo && <p className="spec-additional">{vehicle.additionalInfo}</p>}
            {vehicle.negotiationTerms && <p className="spec-additional">{vehicle.negotiationTerms}</p>}
          </div>
        </div>
      </section>

      <section className="detail-contact" aria-labelledby="detail-contact-title">
        <div className="container detail-contact-inner">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" /> ATENDIMENTO DIRETO</p>
            <h2 id="detail-contact-title">Gostou deste veículo?</h2>
            <p>Confirme a disponibilidade e tire suas dúvidas diretamente com a Liberato Motos Car.</p>
          </div>
          <div className="detail-cta">
            <WhatsAppLink
              className="button button--red"
              subject={`${vehicle.title} — referência ${vehicle.slug}`}
              placement={`detail_${vehicle.slug}`}
              showArrow
            >
              Consultar veículo
            </WhatsAppLink>
            <Link className="button button--outline" href="/#vitrine">
              <ArrowLeft size={17} aria-hidden="true" /> Voltar aos veículos
            </Link>
          </div>
        </div>
      </section>

      <section className="related" aria-labelledby="related-title">
        <div className="container">
          <h2 id="related-title">Explore outros veículos</h2>
          <div className="related-grid">
            {related.map((item) => (
              <Link className="related-link" href={`/veiculos/${item.slug}`} key={item.slug}>
                <span className="related-thumb"><Image src={item.image} alt="" fill sizes="116px" /></span>
                <span><span>{item.categoryLabel}</span><strong>{item.title}</strong></span>
                <ArrowUpRight size={20} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
