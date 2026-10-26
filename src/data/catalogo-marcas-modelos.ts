/**
 * Sugestões de marca e modelo para a tela de cadastro.
 *
 * Lista local de propósito: digitar é o gargalo do cadastro, e consultar uma tabela externa a
 * cada letra traria rede para dentro do campo — o oposto do que se quer. São dezenas de linhas,
 * não milhares, porque cobrem o que a loja realmente vende.
 *
 * Nada aqui restringe o que pode ser salvo: marca, modelo e cor continuam texto livre no banco.
 * A lista só evita digitação. Quem tiver um veículo fora dela escolhe "Outra" e digita.
 * Para incluir um modelo novo, basta acrescentar a linha — não há migração envolvida.
 */

export type VehicleType = 'motorcycle' | 'car';

type Brand = { name: string; models: readonly string[] };

const motorcycles: readonly Brand[] = [
  { name: 'Honda', models: [
    'CG 160 Fan', 'CG 160 Titan', 'CG 160 Start', 'CG 160 Cargo', 'CG 150 Titan', 'CG 125 Fan',
    'Biz 125', 'Biz 110i', 'Pop 110i', 'Bros 160', 'NXR 150 Bros', 'XRE 190', 'XRE 300',
    'XRE 300 Sahara', 'CB 300F Twister', 'CB 250F Twister', 'CB 500F', 'CB 500X', 'CB 650R',
    'CBR 650R', 'CRF 230F', 'CRF 250F', 'PCX 160', 'Elite 125', 'SH 300i', 'ADV 350',
    'Hornet 750', 'NC 750X', 'Africa Twin', 'Shadow 750', 'Falcon NX4',
  ] },
  { name: 'Yamaha', models: [
    'Factor 125i', 'Factor 150', 'Fazer 150', 'Fazer 250', 'Crosser 150', 'Lander 250',
    'Ténéré 250', 'XTZ 150', 'NMax 160', 'Neo 125', 'XMax 250', 'MT-03', 'MT-07', 'MT-09',
    'R3', 'R15', 'YBR 125', 'XT 660',
  ] },
  { name: 'Suzuki', models: [
    'Yes 125', 'Intruder 125', 'Burgman 125', 'DR 160 S', 'GSX-S 750', 'GSX-S 1000',
    'V-Strom 650', 'V-Strom 1050', 'Bandit 650', 'Hayabusa', 'Boulevard M800',
  ] },
  { name: 'Shineray', models: [
    'Jet 50', 'New Jet 50', 'Phoenix 50', 'Phoenix S 50', 'Worker 125', 'Discover 200', 'SHI 175',
  ] },
  { name: 'Haojue', models: [
    'Chopper Road 150', 'DK 150', 'DR 160', 'Master Ride 150', 'NK 150', 'Lindy 125',
  ] },
  { name: 'Dafra', models: [
    'Citycom 300', 'Horizon 150', 'Next 250', 'Kansas 150', 'Apache 150', 'Riva 150', 'Super 100',
  ] },
  { name: 'Kawasaki', models: [
    'Ninja 300', 'Ninja 400', 'Ninja 650', 'Ninja ZX-10R', 'Z400', 'Z650', 'Z900',
    'Versys 650', 'Versys-X 300',
  ] },
  { name: 'Royal Enfield', models: [
    'Classic 350', 'Meteor 350', 'Hunter 350', 'Himalayan 411', 'Interceptor 650', 'Continental GT 650',
  ] },
  { name: 'BMW', models: ['G 310 R', 'G 310 GS', 'F 900 R', 'F 850 GS', 'R 1250 GS', 'S 1000 RR'] },
  { name: 'Harley-Davidson', models: ['Iron 883', 'Forty-Eight', 'Sportster S', 'Street 750', 'Fat Boy', 'Softail'] },
  { name: 'Triumph', models: ['Street Triple', 'Trident 660', 'Speed 400', 'Tiger 900', 'Bonneville T100'] },
];

const cars: readonly Brand[] = [
  { name: 'Volkswagen', models: [
    'Gol', 'Voyage', 'Saveiro', 'Fox', 'CrossFox', 'SpaceFox', 'Up!', 'Polo', 'Virtus',
    'T-Cross', 'Nivus', 'Jetta', 'Golf', 'Amarok', 'Tiguan', 'Parati', 'Kombi',
  ] },
  { name: 'Fiat', models: [
    'Uno', 'Palio', 'Palio Weekend', 'Siena', 'Grand Siena', 'Strada', 'Toro', 'Argo', 'Cronos',
    'Mobi', 'Pulse', 'Fastback', 'Punto', 'Idea', 'Linea', 'Doblò', 'Fiorino',
  ] },
  { name: 'Chevrolet', models: [
    'Onix', 'Onix Plus', 'Prisma', 'Celta', 'Corsa', 'Classic', 'Cruze', 'Spin', 'Tracker',
    'S10', 'Montana', 'Cobalt', 'Agile', 'Astra', 'Vectra', 'Equinox',
  ] },
  { name: 'Ford', models: [
    'Ka', 'Ka Sedan', 'Fiesta', 'EcoSport', 'Ranger', 'Focus', 'Fusion', 'Courier',
    'Territory', 'Maverick', 'Bronco Sport',
  ] },
  { name: 'Hyundai', models: ['HB20', 'HB20S', 'HB20X', 'Creta', 'Tucson', 'ix35', 'i30', 'Elantra', 'Santa Fe'] },
  { name: 'Toyota', models: ['Corolla', 'Corolla Cross', 'Hilux', 'SW4', 'Etios', 'Yaris', 'RAV4'] },
  { name: 'Renault', models: ['Kwid', 'Sandero', 'Logan', 'Duster', 'Oroch', 'Captur', 'Stepway', 'Clio', 'Fluence', 'Master'] },
  { name: 'Honda', models: ['Fit', 'City', 'Civic', 'HR-V', 'WR-V', 'CR-V', 'Accord'] },
  { name: 'Nissan', models: ['March', 'Versa', 'Kicks', 'Frontier', 'Sentra', 'Livina'] },
  { name: 'Jeep', models: ['Renegade', 'Compass', 'Commander'] },
  { name: 'Peugeot', models: ['206', '207', '208', '2008', '3008', 'Partner', 'Hoggar'] },
  { name: 'Citroën', models: ['C3', 'C4', 'C4 Cactus', 'C4 Lounge', 'Aircross', 'Berlingo'] },
];

const catalog: Record<VehicleType, readonly Brand[]> = { motorcycle: motorcycles, car: cars };

export function brandsFor(type: VehicleType): readonly string[] {
  return catalog[type].map((brand) => brand.name);
}

// Comparação sem diferenciar acento nem caixa: quem digita "citroen" acha "Citroën".
const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

export function modelsFor(type: VehicleType, brand: string): readonly string[] {
  if (!brand.trim()) return [];
  return catalog[type].find((item) => fold(item.name) === fold(brand))?.models ?? [];
}

// Sugestões por trecho digitado: começo da palavra primeiro, depois qualquer posição.
// Sem texto, devolve o início da lista para a pessoa ver que há sugestões.
export function suggest(options: readonly string[], typed: string, limit = 8): readonly string[] {
  const needle = fold(typed);
  if (!needle) return options.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const option of options) {
    const folded = fold(option);
    if (folded.startsWith(needle)) starts.push(option);
    else if (folded.includes(needle)) contains.push(option);
  }
  return [...starts, ...contains].slice(0, limit);
}

// Cores comuns de estoque. A lista evita "prata" escrito de cinco formas diferentes.
export const COMMON_COLORS = [
  'Preto', 'Branco', 'Prata', 'Cinza', 'Vermelho', 'Azul',
  'Vinho', 'Verde', 'Amarelo', 'Laranja', 'Marrom', 'Bege',
] as const;
