/**
 * Vivia em `mock-vehicles.ts`, junto dos três conceitos ilustrativos. O arquivo saiu quando
 * as rotas de conceito passaram a responder 404; o tipo ficou, porque é real.
 */
export type VehicleCategory = 'moto' | 'carro';

type TechnicalKey =
  | 'engine' | 'displacement' | 'fuel' | 'power' | 'torque' | 'transmission'
  | 'starter' | 'traction' | 'fuelSystem' | 'cooling' | 'bodyStyle'
  | 'doors' | 'seats' | 'bedVolume' | 'payload' | 'tank'
  | 'wheels' | 'brakes' | 'suspension';

interface TechnicalItem {
  key: TechnicalKey;
  label: string;
  value: string;
}

interface TechnicalGroup {
  title: string;
  items: TechnicalItem[];
}

interface FactoryReference {
  status: 'confirmed_by_manufacturer';
  appliesTo: string;
  sources: { label: string; url: string }[];
  checkedAt: string;
  groups: TechnicalGroup[];
}

export interface InventoryVehicle {
  /** Não havia IDs de estoque no repositório; o slug é a referência estável desta prévia. */
  slug: string;
  sourceStatus: 'confirmed_in_listing';
  brand: string;
  model: string;
  version?: string;
  title: string;
  /** Ano do anúncio; não implica ano de fabricação ou ano-modelo. */
  year?: number;
  manufactureYear?: number;
  modelYear?: number;
  kilometers?: number;
  priceBRL: number;
  category: VehicleCategory;
  categoryLabel: string;
  /** Ausente quando o cadastro não informa. Campo vazio não se exibe. */
  color?: string;
  /** Ausente quando o cadastro não informa. Campo vazio não se exibe. */
  condition?: 'Seminovo';
  availability?: 'disponivel' | 'reservado' | 'vendido';
  /** PNG com fundo transparente, fornecido pela loja. Serve ao palco escuro do
   *  card e também ao painel claro das imagens de Open Graph. */
  image: string;
  imageAlt: string;
  shortDescription: string;
  description: string;
  highlights: string[];
  additionalInfo?: string;
  negotiationTerms?: string;
  featured?: boolean;
  factoryReference?: FactoryReference;
  /** Controle editorial interno; não renderizar na página do comprador. */
  pendingVerification: string[];
}

/** Dados do anúncio fornecidos pelo usuário em 23/10/2026. Estoque e preço exigem confirmação antes de publicação oficial. */
export const INVENTORY_VEHICLES: InventoryVehicle[] = [
  {
    slug: 'volkswagen-saveiro-robust-2024',
    sourceStatus: 'confirmed_in_listing',
    brand: 'Volkswagen',
    model: 'Saveiro',
    version: 'Robust',
    title: 'Volkswagen Saveiro Robust 2024',
    year: 2024,
    kilometers: 56000,
    priceBRL: 69999,
    category: 'carro',
    categoryLabel: 'Picape compacta',
    color: 'Branca',
    condition: 'Seminovo',
    image: '/images/volkswagen-saveiro-robust-2024.png',
    imageAlt: 'Volkswagen Saveiro Robust branca, fotografada de frente e de lado',
    shortDescription: 'Picape compacta para conciliar trabalho e rotina.',
    description: 'A Saveiro Robust 2024 reúne caçamba e dimensões de picape compacta para quem precisa transportar mercadorias e circular no dia a dia. Esta unidade branca tem 56.000 km informados no anúncio.',
    highlights: ['Caçamba para transporte', 'Motor 1.6 flex na linha 2024', 'Uso profissional e cotidiano'],
    featured: true,
    factoryReference: {
      status: 'confirmed_by_manufacturer',
      appliesTo: 'Linha Volkswagen Saveiro 2024, incluindo a versão Robust',
      sources: [
        { label: 'Lançamento da Saveiro 2024', url: 'https://newsroom-br.itd.vw.com.br/news/1914' },
        { label: 'Volkswagen do Brasil — Saveiro', url: 'https://www.vw.com.br/pt/carros/Saveiro.html' },
      ],
      checkedAt: '2026-10-23',
      groups: [
        {
          title: 'Motorização de fábrica',
          items: [
            { key: 'engine', label: 'Motor', value: 'EA211 1.6' },
            { key: 'fuel', label: 'Combustível', value: 'Flex' },
            { key: 'power', label: 'Potência máxima', value: '116 cv' },
            { key: 'torque', label: 'Torque máximo', value: '16,1 kgfm' },
            { key: 'transmission', label: 'Câmbio', value: 'Manual de 5 marchas' },
          ],
        },
      ],
    },
    pendingVerification: ['Cabine simples e capacidade da caçamba desta unidade', 'Ano-modelo e equipamentos efetivamente instalados', 'Disponibilidade atual'],
  },
  {
    slug: 'fiat-strada-2016',
    sourceStatus: 'confirmed_in_listing',
    brand: 'Fiat',
    model: 'Strada',
    title: 'Fiat Strada 2016',
    year: 2016,
    kilometers: 89000,
    priceBRL: 67000,
    category: 'carro',
    categoryLabel: 'Picape compacta',
    color: 'Cinza-escuro',
    condition: 'Seminovo',
    image: '/images/fiat-strada-2016.png',
    imageAlt: 'Fiat Strada cinza-escuro, fotografada de lado',
    shortDescription: 'Versatilidade de picape compacta para a rotina.',
    description: 'A Fiat Strada 2016 oferece a praticidade da caçamba em um formato compacto. É uma opção para quem concilia deslocamentos urbanos e transporte de mercadorias. A unidade cinza-escuro registra 89.000 km no anúncio.',
    highlights: ['Caçamba para transporte', 'Perfil urbano e profissional', '89.000 km anunciados'],
    pendingVerification: ['Versão', 'Tipo de cabine', 'Motor e transmissão', 'Equipamentos efetivamente instalados', 'Disponibilidade atual'],
  },
  {
    slug: 'honda-fan-2015',
    sourceStatus: 'confirmed_in_listing',
    brand: 'Honda',
    model: 'Fan',
    title: 'Honda Fan 2015',
    year: 2015,
    kilometers: 84000,
    priceBRL: 10990,
    category: 'moto',
    categoryLabel: 'Moto urbana',
    color: 'Preta',
    condition: 'Seminovo',
    image: '/images/honda-fan-2015.png',
    imageAlt: 'Honda Fan preta, fotografada de lado',
    shortDescription: 'Mobilidade prática para deslocamentos urbanos.',
    description: 'A Honda Fan 2015 tem proposta urbana e formato compacto para trajetos cotidianos e atividades profissionais. Esta unidade preta registra 84.000 km no anúncio. Consulte a loja para conhecer os equipamentos desta moto.',
    highlights: ['Perfil urbano', 'Formato compacto', '84.000 km anunciados'],
    pendingVerification: ['CG 125 ou CG 150 e versão exata', 'Sistema de alimentação, freios e partida', 'Disponibilidade atual'],
  },
  {
    slug: 'honda-titan-2013',
    sourceStatus: 'confirmed_in_listing',
    brand: 'Honda',
    model: 'Titan',
    title: 'Honda Titan 2013',
    year: 2013,
    kilometers: 70760,
    priceBRL: 11500,
    category: 'moto',
    categoryLabel: 'Moto urbana',
    color: 'Vermelha',
    condition: 'Seminovo',
    image: '/images/honda-titan-2013.png',
    imageAlt: 'Honda Titan vermelha, fotografada de lado',
    shortDescription: 'Uma opção urbana para trabalho e deslocamentos diários.',
    description: 'A Honda Titan 2013 reúne a proposta de motocicleta urbana para uso pessoal ou profissional. Esta unidade vermelha tem 70.760 km informados no anúncio. Os equipamentos podem ser consultados diretamente com a loja.',
    highlights: ['Perfil urbano', 'Uso pessoal ou profissional', '70.760 km anunciados'],
    pendingVerification: ['Versão exata e cilindrada', 'Tipo de partida, freios e rodas', 'Combustível e alimentação', 'Disponibilidade atual'],
  },
  {
    slug: 'yamaha-fazer-2014',
    sourceStatus: 'confirmed_in_listing',
    brand: 'Yamaha',
    model: 'Fazer',
    title: 'Yamaha Fazer 2014',
    year: 2014,
    kilometers: 72000,
    priceBRL: 10500,
    category: 'moto',
    categoryLabel: 'Moto street',
    color: 'Branca',
    condition: 'Seminovo',
    image: '/images/yamaha-fazer-2014.png',
    imageAlt: 'Yamaha Fazer branca, fotografada de lado',
    shortDescription: 'Perfil street para a mobilidade cotidiana.',
    description: 'A Yamaha Fazer 2014 é uma motocicleta street voltada aos deslocamentos diários. A unidade branca registra 72.000 km no anúncio. Converse com a loja para conhecer a configuração desta moto.',
    highlights: ['Perfil street', 'Uso urbano', '72.000 km anunciados'],
    pendingVerification: ['Fazer 150 ou Fazer 250 e versão exata', 'Motorização e equipamentos', 'Disponibilidade atual'],
  },
  {
    slug: 'honda-pop',
    sourceStatus: 'confirmed_in_listing',
    brand: 'Honda',
    model: 'Pop',
    title: 'Honda Pop',
    kilometers: 660,
    priceBRL: 13700,
    category: 'moto',
    categoryLabel: 'Moto urbana',
    color: 'Branca com banco vermelho',
    condition: 'Seminovo',
    image: '/images/honda-pop.png',
    imageAlt: 'Honda Pop branca com banco vermelho, fotografada de lado',
    shortDescription: 'Formato compacto com 660 km informados no anúncio.',
    description: 'A Honda Pop é uma motocicleta compacta para deslocamentos urbanos. Esta unidade branca, com banco vermelho, tem 660 km registrados no anúncio. A loja pode informar o ano e a configuração desta unidade durante o atendimento.',
    highlights: ['Formato compacto', 'Uso urbano', '660 km anunciados'],
    pendingVerification: ['Ano e versão', 'Cilindrada, partida, câmbio e freios', 'Disponibilidade atual'],
  },
  {
    slug: 'yamaha-crosser',
    sourceStatus: 'confirmed_in_listing',
    brand: 'Yamaha',
    model: 'Crosser',
    title: 'Yamaha Crosser',
    priceBRL: 17500,
    category: 'moto',
    categoryLabel: 'Moto trail',
    color: 'Vermelha e preta',
    condition: 'Seminovo',
    image: '/images/yamaha-crosser.png',
    imageAlt: 'Yamaha Crosser vermelha e preta, fotografada de lado',
    shortDescription: 'Proposta trail para cidade e pisos irregulares.',
    description: 'A Yamaha Crosser tem perfil trail, com posição de pilotagem elevada e proposta de uso em trajetos urbanos ou vias com pavimentação irregular. Esta unidade vermelha e preta oferece uma opção de perfil versátil no catálogo da Liberato Motos Car.',
    highlights: ['Perfil trail', 'Posição de pilotagem elevada', 'Uso em diferentes tipos de via'],
    pendingVerification: ['Ano e ano-modelo', 'Quilometragem', 'Versão, freios e eventual ABS', 'Disponibilidade atual'],
  },
];

export function getInventoryVehicle(slug: string): InventoryVehicle | undefined {
  return INVENTORY_VEHICLES.find((vehicle) => vehicle.slug === slug);
}

export function formatPrice(priceBRL: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(priceBRL);
}

export function formatKilometers(kilometers: number): string {
  return `${new Intl.NumberFormat('pt-BR').format(kilometers)} km`;
}
