import type { InventoryVehicle } from '@/data/inventory-vehicles';
import { buildVehicleTitle } from '@/lib/vehicle-title';
import type { listPublicVehiclesWithCover } from './service';

type PublicListing = Awaited<ReturnType<typeof listPublicVehiclesWithCover>>[number];

const LIMITE_RESUMO = 160;

/**
 * A descrição do cadastro é, muitas vezes, o próprio texto de disparo do WhatsApp — com
 * emoji, caixa alta e linhas "🔧 Cilindrada: 250". Aparecia cru no card da vitrine. Aqui o
 * texto é reduzido a prosa: emoji fora, linhas viram frases, espaço normalizado.
 *
 * Os modificadores e o ZWJ entram na faixa removida: sem eles, "🧑‍🦲" deixava um juntador
 * órfão e a vitrine mostrava "‍ Estilo: Trail". `\p{Emoji_Component}` fica FORA de propósito:
 * ela casa os dígitos 0-9 (base dos emoji de teclado) e apagava "2023", "250" e "70.760".
 */
function limparDescricao(texto: string): string {
  return texto
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}️⃣‍]/gu, ' ')
    .replace(/\s*\n+\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .replace(/\s*·\s*(·\s*)+/g, ' · ')
    .replace(/^[\s·]+|[\s·]+$/g, '')
    .trim();
}

/**
 * Reconhece a descrição que não é prosa e sim ficha de disparo ("Cilindrada: 250 · Marchas: 5
 * · KM: 23218"). Limpar emoji não salva esse texto: ele continua ilegível como parágrafo e
 * repete, em formato pior, os dados que o card já mostra em coluna própria.
 */
function pareceDisparo(texto: string): boolean {
  const segmentos = texto.split('·').filter((parte) => parte.trim());
  return segmentos.filter((parte) => /^[^:]{1,22}:\s*\S/.test(parte.trim())).length >= 3;
}

/**
 * Corta na fronteira de palavra. `slice(160)` partia a frase no meio ("Os equipa", "tem 56")
 * em todos os cards da vitrine, que é o detalhe que mais denuncia site improvisado.
 */
function resumir(texto: string, limite = LIMITE_RESUMO): string {
  if (texto.length <= limite) return texto;
  const cortado = texto.slice(0, limite);
  const ultimoEspaco = cortado.lastIndexOf(' ');
  const base = (ultimoEspaco > limite * 0.6 ? cortado.slice(0, ultimoEspaco) : cortado)
    // Artigo ou preposição solta antes da reticência ("no anúncio. Os…", "mercadorias. A…")
    // lê como palavra partida, que é exatamente o que o corte por palavra evita.
    .replace(/\s+\p{L}{1,2}$/u, '')
    .replace(/[\s·,;:.!?-]+$/u, '');
  return `${base}…`;
}

/**
 * Resumo gerado a partir dos campos estruturados, para quando a descrição não serve de
 * parágrafo. Lê sempre bem porque não depende de como a loja digitou o anúncio.
 */
function resumoDosDados(title: string, kilometers?: number, color?: string): string {
  const partes = [
    kilometers !== undefined ? `${kilometers.toLocaleString('pt-BR')} km` : null,
    color ? `cor ${color.toLocaleLowerCase('pt-BR')}` : null,
  ].filter((parte): parte is string => Boolean(parte));
  return partes.length
    ? `${title} com ${partes.join(', ')}.`
    : `${title} anunciado pela Liberato Motos Car.`;
}

/**
 * Mercado de usado nomeia o veículo com o ano ("Honda Titan 2013"); o cadastro guarda os dois
 * campos separados. Só acrescenta quando o ano ainda não está no texto, senão a versão que já
 * traz o ano geraria "Saveiro 2024 2024".
 */
function comAno(titulo: string, ano?: number): string {
  if (ano === undefined) return titulo;
  return titulo.includes(String(ano)) ? titulo : `${titulo} ${ano}`;
}

export function toCatalogVehicle(vehicle: PublicListing): InventoryVehicle {
  const year = vehicle.year ?? undefined;
  const title = comAno(buildVehicleTitle(vehicle.brand, vehicle.model, vehicle.version), year);
  const category = vehicle.type === 'motorcycle' ? 'moto' : 'carro';
  const kilometers = vehicle.mileageKm ?? undefined;
  const color = vehicle.color ?? undefined;
  const descricao = vehicle.description ? limparDescricao(vehicle.description) : '';
  return {
    slug: vehicle.slug,
    sourceStatus: 'confirmed_in_listing',
    brand: vehicle.brand ?? '', model: vehicle.model ?? '', version: vehicle.version ?? undefined,
    title, year, kilometers, priceBRL: (vehicle.priceCents ?? 0) / 100,
    category, categoryLabel: category === 'moto' ? 'Moto' : 'Carro',
    // Ausentes quando o cadastro não traz: a página omite a linha em vez de escrever
    // "Não informada", que antes aparecia em todos os cards e em todas as fichas.
    color,
    condition: undefined,
    availability: vehicle.status === 'reserved' ? 'reservado' : vehicle.status === 'sold' ? 'vendido' : 'disponivel',
    image: vehicle.image ?? '/images/fachada.png',
    imageAlt: vehicle.image ? `Foto de ${title}` : 'Foto do veículo indisponível; fachada da loja',
    shortDescription: descricao && !pareceDisparo(descricao)
      ? resumir(descricao)
      : resumoDosDados(title, kilometers, color),
    description: descricao || `Consulte a loja para mais detalhes sobre ${title}.`,
    // Ano e quilometragem já aparecem na linha de dados e na ficha; repetir aqui rendia três
    // molduras dizendo o que estava escrito logo acima.
    highlights: [],
    pendingVerification: [],
  };
}
