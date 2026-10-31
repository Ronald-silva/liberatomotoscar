import { GOOGLE_PROFILE, SITE_URL, STORE, STORE_STREET_ADDRESS } from '@/data/store';
import { STORE_POLICY } from '@/data/store-policy';
import type { InventoryVehicle } from '@/data/inventory-vehicles';

/**
 * Construtores de JSON-LD. Só descrevem o que o anúncio ou o perfil da loja
 * já afirmam. O horário entrou quando o lojista confirmou (ver `store-policy.ts`);
 * nota de avaliação e condições de crédito seguem de fora — a primeira porque
 * marcar avaliação de outra plataforma como própria contraria as diretrizes do
 * Google, a segunda porque ninguém informou parcela nem juros.
 */

const POSTAL_ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress: STORE_STREET_ADDRESS,
  addressLocality: `${STORE.district}, ${STORE.city}`,
  addressRegion: STORE.state,
  postalCode: STORE.postalCode,
  addressCountry: STORE.country,
} as const;

export function buildAutoDealerSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    '@id': `${SITE_URL}/#loja`,
    name: STORE.name,
    description: `${STORE.tagline} de motos e carros seminovos na ${STORE.district}, ${STORE.city}/${STORE.state}.`,
    url: SITE_URL,
    telephone: STORE.phoneE164,
    address: POSTAL_ADDRESS,
    areaServed: `${STORE.city}, ${STORE.state}`,
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [...STORE_POLICY.horarioEstruturado.dias],
      opens: STORE_POLICY.horarioEstruturado.abre,
      closes: STORE_POLICY.horarioEstruturado.fecha,
    }],
    sameAs: [GOOGLE_PROFILE.url],
  };
}

const AVAILABILITY_SCHEMA: Record<string, string> = {
  disponivel: 'https://schema.org/InStock',
  reservado: 'https://schema.org/LimitedAvailability',
  vendido: 'https://schema.org/SoldOut',
};

export function buildVehicleSchema(vehicle: InventoryVehicle): Record<string, unknown> {
  const url = `${SITE_URL}/veiculos/${vehicle.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Vehicle',
    '@id': `${url}#veiculo`,
    name: vehicle.title,
    description: vehicle.description,
    url,
    image: vehicle.image.startsWith('https://') ? vehicle.image : `${SITE_URL}${encodeURI(vehicle.image)}`,
    brand: { '@type': 'Brand', name: vehicle.brand },
    model: vehicle.model,
    ...(vehicle.version && { vehicleConfiguration: vehicle.version }),
    ...(vehicle.modelYear ?? vehicle.year
      ? { vehicleModelDate: String(vehicle.modelYear ?? vehicle.year) }
      : {}),
    ...(vehicle.manufactureYear && { productionDate: String(vehicle.manufactureYear) }),
    ...(vehicle.kilometers !== undefined && {
      mileageFromOdometer: {
        '@type': 'QuantitativeValue',
        value: vehicle.kilometers,
        unitCode: 'KMT',
      },
    }),
    color: vehicle.color,
    itemCondition: 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      price: vehicle.priceBRL,
      priceCurrency: 'BRL',
      url,
      ...(vehicle.availability && { availability: AVAILABILITY_SCHEMA[vehicle.availability] }),
      seller: { '@id': `${SITE_URL}/#loja` },
    },
  };
}

export function buildBreadcrumbSchema(vehicle: InventoryVehicle): Record<string, unknown> {
  const trail = [
    { name: 'Início', item: SITE_URL },
    { name: 'Veículos', item: `${SITE_URL}/#vitrine` },
    { name: vehicle.title, item: `${SITE_URL}/veiculos/${vehicle.slug}` },
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: step.item,
    })),
  };
}
