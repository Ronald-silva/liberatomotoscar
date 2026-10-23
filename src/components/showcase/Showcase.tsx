import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, MoveRight } from 'lucide-react';
import { INVENTORY_VEHICLES, formatKilometers, formatPrice } from '@/data/inventory-vehicles';
import { FiltroVitrine, type OpcaoFiltro } from '@/components/showcase/FiltroVitrine';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';

const CATEGORIAS: { valor: string; rotulo: string }[] = [
  { valor: 'moto', rotulo: 'Motos' },
  { valor: 'carro', rotulo: 'Carros' },
];

/**
 * Vitrine. Componente de servidor: os sete cards estão no HTML servido, e o
 * filtro é a única parte que roda no navegador. A numeração dos cards vem de
 * um contador CSS, que reconta sozinho quando o filtro esconde algum.
 */
export function Showcase() {
  const opcoes: OpcaoFiltro[] = [
    { valor: 'todos', rotulo: 'Todos', total: INVENTORY_VEHICLES.length },
    ...CATEGORIAS.map(({ valor, rotulo }) => ({
      valor,
      rotulo,
      total: INVENTORY_VEHICLES.filter((vehicle) => vehicle.category === valor).length,
    })),
  ];

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
          <FiltroVitrine opcoes={opcoes} />
        </div>

        <p className="demo-note" role="note">
          DADOS FORNECIDOS PARA OS ANÚNCIOS. CONFIRME PREÇO, DISPONIBILIDADE E CONDIÇÕES COM A LOJA.
        </p>

        <div className="vehicle-grid">
          {INVENTORY_VEHICLES.map((vehicle) => (
            <article className="vehicle-card" key={vehicle.slug} data-categoria={vehicle.category}>
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
                <span className="vehicle-number" aria-hidden="true" />
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

        <div className="empty-state">
          <p>Nenhum veículo anunciado nesta categoria.</p>
        </div>
      </div>
    </section>
  );
}
