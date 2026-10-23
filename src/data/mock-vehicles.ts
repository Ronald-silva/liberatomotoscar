export type VehicleCategory = 'moto' | 'carro';

export interface Vehicle {
  slug: string;
  category: VehicleCategory;
  categoryLabel: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  imageAlt: string;
  highlights: string[];
  featured?: boolean;
  images360?: string[];
}

/** Conceitos visuais; não representam estoque nem condições de venda. */
export const DEMO_VEHICLES: Vehicle[] = [
  {
    slug: 'moto-street',
    category: 'moto',
    categoryLabel: 'Moto urbana',
    title: 'Street',
    subtitle: 'A cidade no seu ritmo',
    description:
      'Uma experiência visual para mostrar como uma moto urbana pode ser apresentada com personalidade, fotos de qualidade e contato imediato.',
    image: '/images/moto-street.png',
    imageAlt: 'Imagem ilustrativa de uma motocicleta urbana vermelha em estúdio',
    highlights: ['Perfil urbano', 'Visual esportivo', 'Atendimento direto'],
    featured: true,
  },
  {
    slug: 'moto-adventure',
    category: 'moto',
    categoryLabel: 'Moto adventure',
    title: 'Adventure',
    subtitle: 'Mais estrada pela frente',
    description:
      'Um exemplo de página para apresentar motos de viagem com espaço para galeria, especificações reais e conversa contextual com a loja.',
    image: '/images/moto-adventure.png',
    imageAlt: 'Imagem ilustrativa de uma motocicleta adventure grafite em estúdio',
    highlights: ['Perfil aventureiro', 'Presença marcante', 'Conversa personalizada'],
  },
  {
    slug: 'carro-sedan',
    category: 'carro',
    categoryLabel: 'Carro',
    title: 'Sedã',
    subtitle: 'Conforto para seguir além',
    description:
      'Um conceito de apresentação para carros com fotografia ampla, informações organizadas e um convite claro para falar com a equipe.',
    image: '/images/carro-sedan.png',
    imageAlt: 'Imagem ilustrativa de um sedã grafite em estúdio',
    highlights: ['Perfil executivo', 'Design elegante', 'Atendimento direto'],
  },
];

export function getDemoVehicle(slug: string): Vehicle | undefined {
  return DEMO_VEHICLES.find((vehicle) => vehicle.slug === slug);
}
