import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, ChevronRight } from 'lucide-react';
import { Viewer360 } from '@/components/viewer-360/Viewer360';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';
import {
  formatKilometers,
  formatPrice,
  type InventoryVehicle,
} from '@/data/inventory-vehicles';

export function InventoryDetail({ vehicle, vehicles, images }: { vehicle: InventoryVehicle; vehicles: InventoryVehicle[]; images: string[] }) {
  const isSold = vehicle.availability === 'vendido';
  const isReserved = vehicle.availability === 'reservado';
  const rotuloDisponibilidade = isSold ? 'Vendido' : isReserved ? 'Reservado' : null;
  const others = vehicles.filter((item) => item.slug !== vehicle.slug);
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
              images={images.length ? images : [vehicle.image]}
              title={vehicle.title}
              alt={vehicle.imageAlt}
              badge={images.length ? 'FOTO DO ANÚNCIO' : 'FOTO INDISPONÍVEL'}
              singleImageCaption={images.length
                ? ''
                : 'A foto deste anúncio está indisponível no momento. Consulte a loja para recebê-la.'}
            />
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> {vehicle.categoryLabel}</p>
              <h1 id="detail-title" className="detail-title detail-title--inventory">{vehicle.title}</h1>
              {isSold ? <p className="detail-availability detail-availability--sold">Vendido · anúncio mantido para consulta histórica</p> : null}
              {isReserved ? <p className="detail-availability detail-availability--reserved">Reservado · indisponível no momento</p> : null}
              <div className="detail-stock-facts" aria-label="Dados principais do anúncio">
                {vehicle.year !== undefined && <span>{vehicle.year}</span>}
                {vehicle.kilometers !== undefined && <span>{formatKilometers(vehicle.kilometers)}</span>}
                {vehicle.color && <span>{vehicle.color}</span>}
              </div>
              <p className="detail-price">
                {vehicle.priceBRL > 0 ? formatPrice(vehicle.priceBRL) : 'Consulte o preço'}
              </p>
              {isSold ? <p className="detail-price-note">Preço anunciado antes da venda.</p> : null}
              {/* Única ressalva da página, no ponto em que a decisão acontece. O resumo e os
                  destaques saíram daqui: repetiam, cortada, a descrição que vem logo abaixo e
                  os dados que já estão na linha acima. */}
              <p className="detail-data-note">
                Preço, quilometragem, disponibilidade e condições comerciais devem ser
                confirmados com a loja antes da negociação.
              </p>
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
              {vehicle.color && <div><dt>Cor</dt><dd>{vehicle.color}</dd></div>}
              {vehicle.condition && <div><dt>Condição anunciada</dt><dd>{vehicle.condition}</dd></div>}
              {/* "disponivel" é o estado normal e chegava cru do banco, sem acento. Só vale
                  linha na ficha quando o veículo está fora do normal. */}
              {rotuloDisponibilidade && (
                <div><dt>Disponibilidade</dt><dd>{rotuloDisponibilidade}</dd></div>
              )}
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
            <p className="eyebrow"><span className="eyebrow-line" /> {isSold ? 'ANÚNCIO ENCERRADO' : 'ATENDIMENTO DIRETO'}</p>
            <h2 id="detail-contact-title">{isSold ? 'Este veículo foi vendido.' : isReserved ? 'Veículo reservado.' : 'Gostou deste veículo?'}</h2>
            <p>{isSold ? 'Veja outros anúncios para encontrar uma opção disponível.'
              : isReserved ? 'Este veículo está reservado. Consulte a loja para saber se a reserva mudou.'
                : 'Fale com a equipe da Liberato Motos Car pelo WhatsApp.'}</p>
          </div>
          <div className="detail-cta">
            {!isSold ? <WhatsAppLink
              className="button button--red"
              subject={`${vehicle.title} — referência ${vehicle.slug}`}
              placement={`detail_${vehicle.slug}`}
              showArrow
            >
              {isReserved ? 'Consultar reserva' : 'Consultar veículo'}
            </WhatsAppLink> : null}
            <Link className="button button--outline" href="/#vitrine">
              <ArrowLeft size={17} aria-hidden="true" /> {isSold ? 'Ver outros veículos' : 'Voltar aos veículos'}
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
                <span className="related-thumb"><Image src={item.image} unoptimized={item.image.startsWith('https://')} alt="" fill sizes="116px" /></span>
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
