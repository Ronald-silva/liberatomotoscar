import {
  formatKilometers,
  formatPrice,
  INVENTORY_VEHICLES,
  type InventoryVehicle,
} from '@/data/inventory-vehicles';
import {
  GOOGLE_PROFILE,
  MAP_URL,
  SITE_URL,
  STORE,
  STORE_ADDRESS_LINE,
  STORE_STREET_ADDRESS,
} from '@/data/store';
import { buildVehicleTitle } from '@/lib/vehicle-title';
import type { HandoffReason, LeadFact } from './conversation-repository';
import { searchAvailableVehicles } from '@/server/vehicles/agent-catalog';

export type KnowledgeVehicleItem = {
  id: string;
  slug: string;
  type: 'motorcycle' | 'car';
  brand: string | null;
  model: string | null;
  version: string | null;
  year: number | null;
  mileageKm: number | null;
  color: string | null;
  priceCents: number | null;
  description?: string | null;
};

export type EnrichedCatalogVehicle = Omit<KnowledgeVehicleItem, 'priceCents'> & {
  priceCents: number;
  title: string;
  priceBRL: number;
  categoryLabel: string;
  shortDescription: string;
  fullDescription: string;
  highlights: string[];
  factorySpecs: string[];
  href: string;
};

export type KnowledgeReply = {
  matched: boolean;
  isInstitutionalOnly: boolean;
  text: string;
  cards: {
    id: string;
    title: string;
    year: number | null;
    priceCents: number;
    href: string;
  }[];
  facts: LeadFact[];
  handoffRequested: boolean;
  handoffReason: HandoffReason | null;
  handoffUrl: string | null;
  checkedAt: string;
  /**
   * Estado da troca quando o turno é de troca. O texto acima é o determinístico, que vale como
   * fallback; com isso o orquestrador pode pedir ao modelo que reescreva a mesma mensagem com
   * naturalidade, sem que o modelo decida o que a loja promete.
   */
  tradeIn?: {
    known: TradeInDetails;
    missing: string[];
    essentialsComplete: boolean;
    isNudge: boolean;
    /**
     * A troca é o único assunto da resposta. Quando falso, o texto também carrega catálogo ou
     * financiamento, e reescrevê-lo por inteiro perderia essa informação.
     */
    soleTopic: boolean;
  } | null;
};

export const STORE_KNOWLEDGE_SUMMARY = `DADOS OFICIAIS DA LOJA (${STORE.name}):
- Nome: ${STORE.name} (${STORE.tagline} de motos e carros seminovos)
- Endereço completo: ${STORE_STREET_ADDRESS} — bairro ${STORE.district}, ${STORE.city}/${STORE.state}, CEP ${STORE.postalCode}
- Linha de endereço: ${STORE_ADDRESS_LINE} (CEP ${STORE.postalCode})
- Link do Google Maps / Rota: ${MAP_URL}
- Telefone e WhatsApp oficial: ${STORE.phoneDisplay} (${STORE.phoneE164})
- Site oficial: ${SITE_URL}
- Avaliação no Google: Nota ${GOOGLE_PROFILE.rating} estrelas (${GOOGLE_PROFILE.reviewCount} avaliações verificadas no perfil do Google)
- Serviços: Compra, venda, troca (avaliação do veículo usado como parte do pagamento) e encaminhamento para simulação de financiamento sujeito à análise de crédito.
- Horário de funcionamento: Atendimento presencial na loja da Parangaba (${STORE_STREET_ADDRESS}). Recomendamos confirmar o horário do dia ou agendar visita pelo WhatsApp ${STORE.phoneDisplay}.`;

export function normalizePlain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function findStaticMetadata(item: KnowledgeVehicleItem): InventoryVehicle | undefined {
  const bySlug = INVENTORY_VEHICLES.find((v) => v.slug === item.slug);
  if (bySlug) return bySlug;
  const itemBrand = normalizePlain(item.brand ?? '');
  const itemModel = normalizePlain(item.model ?? '');
  return INVENTORY_VEHICLES.find(
    (v) => normalizePlain(v.brand) === itemBrand && normalizePlain(v.model) === itemModel,
  );
}

export function enrichCatalogVehicle(item: KnowledgeVehicleItem): EnrichedCatalogVehicle {
  const meta = findStaticMetadata(item);
  const title = buildVehicleTitle(item.brand, item.model, item.version) || meta?.title || 'Veículo';
  const priceCents = item.priceCents ?? Math.round((meta?.priceBRL ?? 0) * 100);
  const priceBRL = priceCents / 100;
  const categoryLabel =
    meta?.categoryLabel ?? (item.type === 'motorcycle' ? 'Moto seminova' : 'Carro seminovo');
  const shortDescription =
    meta?.shortDescription ?? `${title} anunciado pela ${STORE.name}.`;
  const fullDescription =
    item.description ?? meta?.description ?? shortDescription;
  const highlights = meta?.highlights ?? [
    ...(item.year ? [`Ano ${item.year}`] : []),
    ...(item.mileageKm !== null && item.mileageKm !== undefined
      ? [`${formatKilometers(item.mileageKm)}`]
      : []),
  ];
  const factorySpecs =
    meta?.factoryReference?.groups.flatMap((g) =>
      g.items.map((spec) => `${spec.label}: ${spec.value}`),
    ) ?? [];

  return {
    ...item,
    priceCents,
    title,
    priceBRL,
    categoryLabel,
    shortDescription,
    fullDescription,
    highlights,
    factorySpecs,
    href: `/veiculos/${item.slug}`,
  };
}

/** Converte os itens estáticos de INVENTORY_VEHICLES para formato de catálogo caso o banco esteja indisponível. */
export function fallbackCatalogFromStatic(): KnowledgeVehicleItem[] {
  return INVENTORY_VEHICLES.filter((v) => v.availability !== 'vendido' && v.availability !== 'reservado').map(
    (v, idx) => ({
      id: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
      slug: v.slug,
      type: v.category === 'moto' ? ('motorcycle' as const) : ('car' as const),
      brand: v.brand,
      model: v.model,
      version: v.version ?? null,
      year: v.year ?? null,
      mileageKm: v.kilometers ?? null,
      color: v.color,
      priceCents: Math.round(v.priceBRL * 100),
      description: v.description,
    }),
  );
}

export async function loadFullPublishedCatalog(
  searchFn: typeof searchAvailableVehicles = searchAvailableVehicles,
): Promise<{ items: EnrichedCatalogVehicle[]; checkedAt: string }> {
  try {
    const [motos, cars] = await Promise.all([
      searchFn({ type: 'motorcycle', limit: 5 }),
      searchFn({ type: 'car', limit: 5 }),
    ]);
    const mergedMap = new Map<string, KnowledgeVehicleItem>();
    for (const item of [...motos.items, ...cars.items]) {
      mergedMap.set(item.id, item);
    }
    const rawItems = [...mergedMap.values()];
    if (rawItems.length > 0) {
      return {
        items: rawItems.map(enrichCatalogVehicle),
        checkedAt: motos.checkedAt || new Date().toISOString(),
      };
    }
    if (searchFn === searchAvailableVehicles) {
      return {
        items: fallbackCatalogFromStatic().map(enrichCatalogVehicle),
        checkedAt: motos.checkedAt || new Date().toISOString(),
      };
    }
    return {
      items: [],
      checkedAt: motos.checkedAt || new Date().toISOString(),
    };
  } catch {
    return {
      items: fallbackCatalogFromStatic().map(enrichCatalogVehicle),
      checkedAt: new Date().toISOString(),
    };
  }
}

/** Extrai valor de orçamento em centavos a partir de expressões como "até 18 mil", "15.000", "R$ 12000", "70k". */
export function extractBudgetCents(text: string): { maxPriceCents: number; quote: string } | null {
  const normalized = normalizePlain(text);

  // Ex: "ate 18 mil", "por 12 mil", "tenho 15 mil", "18,5 mil", "18k"
  const milMatch = normalized.match(
    /\b(?:ate|abaixo de|menos de|no maximo|orcamento de|tenho|por|de)?\s*(?:r\$\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:mil|k)\b/,
  );
  if (milMatch && milMatch[1]) {
    const num = Number.parseFloat(milMatch[1].replace(',', '.'));
    if (num > 0 && num < 1000) {
      return {
        maxPriceCents: Math.round(num * 1000 * 100),
        quote: milMatch[0].trim(),
      };
    }
  }

  // Ex: "ate 15000", "ate R$ 15.000,00", "R$ 68.000"
  const fullNumberMatch = normalized.match(
    /\b(?:ate|abaixo de|menos de|no maximo|orcamento de|tenho|r\$)\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d{4,6})(?:,\d{2})?\b/,
  );
  if (fullNumberMatch && fullNumberMatch[1]) {
    const rawDigits = Number.parseInt(fullNumberMatch[1].replace(/\./g, ''), 10);
    if (rawDigits >= 3000 && rawDigits <= 500_000) {
      return {
        maxPriceCents: rawDigits * 100,
        quote: fullNumberMatch[0].trim(),
      };
    }
  }

  return null;
}

/** Verifica se um termo na mensagem foi mencionado apenas como veículo de entrada/troca. */
function isMentionedOnlyAsTradeIn(termNormalized: string, messageNormalized: string): boolean {
  const index = messageNormalized.indexOf(termNormalized);
  if (index === -1) return false;
  const before = messageNormalized.slice(Math.max(0, index - 45), index);
  const after = messageNormalized.slice(index + termNormalized.length, index + termNormalized.length + 55);
  return (
    (/\b(tenho|possuo|meu|minha|dar|entregar|ofereco)\b/.test(before) ||
      /^\s*(que eu tenho|que tenho|que possuo)\b/.test(after)) &&
    /\b(troca|trocar|entrada|negocio)\b/.test(after)
  );
}

const KNOWN_UNLISTED_MODELS = [
  'bros', 'xre', 'cb 300', 'cb300', 'twister', 'biz', 'pcx', 'elite', 'sahara', 'tornado',
  'lander', 'tenere', 'mt-03', 'mt03', 'r15', 'r3', 'nmax', 'neo', 'factor', 'crypton',
  'corolla', 'civic', 'hilux', 'gol', 'polo', 'virtus', 't-cross', 'nivus', 'toro', 'mobi',
  'argo', 'cronos', 'uno', 'palio', 'siena', 'onix', 'prisma', 'tracker', 's10', 'montana',
  'hb20', 'creta', 'compass', 'renegade', 'kicks', 'sandero', 'logan', 'kwid', 'duster',
];

const OUT_OF_SCOPE_PRODUCTS = [
  'cama box', 'cama', 'colchao', 'sofa', 'geladeira', 'fogao', 'microondas', 'armario',
  'guarda-roupa', 'guarda roupa', 'mesa', 'cadeira', 'televisao', 'smart tv', 'iphone',
  'notebook', 'computador', 'impressora', 'camisa', 'calca', 'sapato', 'tenis', 'pizza',
  'hamburguer', 'lanche', 'acai', 'cerveja', 'refrigerante', 'doce de coco', 'doce',
  'sorvete', 'comida', 'apartamento', 'terreno',
  'bicicleta', 'patinete', 'maquina de lavar',
  'ventilador', 'liquidificador', 'airfryer', 'panela',
];
// "tem ar condicionado?" pergunta por item do veículo, não por eletrodoméstico. Estava na lista
// de fora do nicho e virava "ar condicionado não temos por aqui" — numa das perguntas mais
// comuns sobre um carro.

/**
 * Nomes de modelo que colidem com palavra comum do português. "fazer uma proposta" não é a
 * Yamaha Fazer e "sou fan de moto antiga" não é a Honda Fan, então esses exigem uma pista de
 * veículo por perto (marca, artigo, cor ou cilindrada) para contar como menção ao anúncio.
 */
const AMBIGUOUS_MODEL_TOKENS = new Set(['fazer', 'fan', 'pop', 'city', 'up', 'ka', 'classic', 'eco', 'march']);

/** Menção confiável a um modelo do catálogo, com desambiguação dos nomes que são palavra comum. */
export function mentionsModelName(
  model: string | null | undefined,
  text: string,
  brand?: string | null,
): boolean {
  const modelNorm = normalizePlain(model ?? '');
  if (!modelNorm) return false;
  const v = normalizePlain(text);
  if (!new RegExp(`\\b${modelNorm}\\b`).test(v)) return false;
  if (!AMBIGUOUS_MODEL_TOKENS.has(modelNorm)) return true;
  const brandNorm = normalizePlain(brand ?? '');
  return (
    Boolean(brandNorm && new RegExp(`\\b${brandNorm}\\s+${modelNorm}\\b`).test(v)) ||
    new RegExp(`\\b(?:moto|carro|modelo)\\s+${modelNorm}\\b`).test(v) ||
    new RegExp(`\\b${modelNorm}\\s+(?:\\d{2,4}|branc\\w*|pret\\w*|vermelh\\w*|cinza|prata|azul)\\b`).test(v) ||
    new RegExp(`\\b(?:a|na|da|pela|essa|esta|aquela|uma|minha)\\s+${modelNorm}\\b`).test(v)
  );
}

/** Extrai o primeiro nome do cliente a partir do perfil do WhatsApp ou de apresentação na mensagem. */
export function extractCustomerFirstName(text: string, contextName?: string | null): string | null {
  if (contextName && contextName.trim()) {
    const clean = contextName
      .replace(/[^\p{L}\s'-]/gu, '')
      .trim()
      .split(/\s+/)[0];
    if (clean && clean.length >= 2) {
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }
  }
  const introMatch = text.match(
    /\b(?:meu nome e|meu nome é|me chamo|aqui e o|aqui é o|aqui e a|aqui é a|sou o|sou a)\s+([A-ZÀ-Úa-zà-ú]{2,20})\b/i,
  );
  if (introMatch && introMatch[1]) {
    const raw = introMatch[1].trim();
    const stopWords = new Set(['cliente', 'comprador', 'interessado', 'vendedor', 'dayse', 'hoje', 'aqui']);
    if (!stopWords.has(normalizePlain(raw))) {
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
  }
  return null;
}

/** Extrai valor de entrada oferecida pelo cliente (ex: "dando 3 mil de entrada", "entrada de R$ 4.000"). */
export function extractEntryCents(text: string): number | null {
  const v = normalizePlain(text);
  if (!v.includes('entrada')) return null;

  const milMatch = v.match(
    /\b(?:dando|com|tenho|de|uma)?\s*(?:entrada\s+de\s+)?(?:r\$\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:mil|k)(?:\s+de\s+entrada)?\b/,
  );
  if (milMatch && milMatch[1]) {
    const num = Number.parseFloat(milMatch[1].replace(',', '.'));
    if (num > 0 && num < 500) return Math.round(num * 1000 * 100);
  }

  const fullMatch = v.match(
    /\b(?:entrada\s+de\s+|(?:dando|com|tenho)\s+)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d{3,6})(?:,\d{2})?(?:\s+de\s+entrada)?\b/,
  );
  if (fullMatch && fullMatch[1]) {
    const digits = Number.parseInt(fullMatch[1].replace(/\./g, ''), 10);
    if (digits >= 500 && digits <= 300_000) return digits * 100;
  }

  return null;
}

export type TradeInDetails = {
  vehicle: string | null;
  year: number | null;
  mileageKm: number | null;
  /** Estado de conservação relatado pelo cliente, nas palavras dele. */
  condition: string | null;
  /** Documentação em dia (IPVA/licenciamento), quando o cliente afirma ou nega. */
  paperworkOk: boolean | null;
  singleOwner: boolean | null;
};

/**
 * Ordem em que o avaliador precisa dos dados. Marca, ano e quilometragem são essenciais: com
 * eles o Liberato já consegue se antecipar e a conversa pode virar visita. Estado e documentação
 * são complemento — valiosos, mas não a ponto de transformar o WhatsApp em interrogatório.
 */
export const TRADE_IN_SLOTS = [
  { key: 'vehicle', pergunta: 'a marca e o modelo', essencial: true },
  { key: 'year', pergunta: 'o ano', essencial: true },
  { key: 'mileageKm', pergunta: 'a quilometragem aproximada', essencial: true },
  { key: 'condition', pergunta: 'o estado de conservação', essencial: false },
  { key: 'paperworkOk', pergunta: 'se a documentação está em dia', essencial: false },
] as const;

/** O que ainda falta para o avaliador, na ordem de prioridade. */
export function missingTradeInSlots(
  details: TradeInDetails,
  filtro?: { essencial: boolean },
): string[] {
  return TRADE_IN_SLOTS
    .filter((slot) => (filtro ? slot.essencial === filtro.essencial : true))
    .filter(({ key }) => details[key] === null)
    .map(({ pergunta }) => pergunta);
}

/**
 * Dados do veículo oferecido na troca presentes num texto — serve tanto para a mensagem do
 * cliente quanto para o fato `trade_in` já registrado, que é como o contexto atravessa os turnos.
 */
export function extractTradeInDetails(text: string): TradeInDetails {
  const v = normalizePlain(text);
  // "quero trocar na Fazer" cita o veículo que o cliente quer COMPRAR. Ele nunca pode substituir
  // o veículo oferecido na troca, senão a usada do cliente se perde no meio da negociação.
  const isPurchaseTarget = (term: string) =>
    new RegExp(`\\b(?:n[ao]|pel[ao]|pr[ao]|para\\s+[ao])\\s+(?:\\w+\\s+)?${normalizePlain(term)}\\b`).test(v);
  const brand = KNOWN_BRANDS.find((item) => item.aliases.some(
    (alias) => new RegExp(`\\b${alias}\\b`).test(v) && !isPurchaseTarget(alias),
  ));
  const inventoryModel = INVENTORY_VEHICLES.find(
    (item) => mentionsModelName(item.model, text, item.brand) && !isPurchaseTarget(item.model),
  );
  const unlistedModel = KNOWN_UNLISTED_MODELS.find(
    (item) => mentionsModelName(item, text) && !isPurchaseTarget(item),
  );
  const modelLabel = inventoryModel?.model
    ?? (unlistedModel ? unlistedModel.replace(/\b\w/g, (c) => c.toUpperCase()) : null);
  const brandLabel = inventoryModel?.brand ?? brand?.canonical ?? null;
  const vehicle = modelLabel
    ? [brandLabel, modelLabel].filter(Boolean).join(' ')
    : brandLabel;

  const yearMatch = v.match(/\b(?:19|20)\d{2}\b/);
  const mileageMatch = v.match(/\b(\d{1,3}(?:\.\d{3})*|\d{4,6})\s*km\b/);

  const conditionMatch = v.match(
    /\b(nova|zerinho|zero|impecave\w*|conservad\w*|otimo estado|otima|bom estado|boa|regular|precisa de reparo|batid\w*|riscad\w*|amassad\w*|rodando|ruim)\b/,
  );
  const paperworkOk = /\b(documenta\w*|ipva|licenciamento|transferenc\w*)\b/.test(v)
    ? !/\b(atrasad\w*|vencid\w*|devendo|debito|pendenc\w*|nao esta em dia|nao ta em dia|atraso)\b/.test(v)
    : null;
  const singleOwner = /\b(unico dono|primeiro dono|so eu usei|sempre fui o dono)\b/.test(v)
    ? true
    : /\b(segundo dono|terceiro dono|comprei usad\w*)\b/.test(v) ? false : null;

  return {
    vehicle: vehicle || null,
    year: yearMatch ? Number(yearMatch[0]) : null,
    mileageKm: mileageMatch ? Number(mileageMatch[1]!.replace(/\./g, '')) : null,
    condition: conditionMatch?.[1] ?? null,
    paperworkOk,
    singleOwner,
  };
}

/** O dado mais recente prevalece; o anterior preenche o que a mensagem atual não trouxe. */
export function mergeTradeInDetails(previous: TradeInDetails, next: TradeInDetails): TradeInDetails {
  return {
    vehicle: next.vehicle ?? previous.vehicle,
    year: next.year ?? previous.year,
    mileageKm: next.mileageKm ?? previous.mileageKm,
    condition: next.condition ?? previous.condition,
    paperworkOk: next.paperworkOk ?? previous.paperworkOk,
    singleOwner: next.singleOwner ?? previous.singleOwner,
  };
}

/** Texto canônico do fato `trade_in`, relido nos turnos seguintes por extractTradeInDetails. */
export function formatTradeInQuote(details: TradeInDetails): string {
  return [
    details.vehicle,
    details.year ? `ano ${details.year}` : null,
    details.mileageKm !== null ? `${details.mileageKm} km` : null,
    details.condition,
    details.paperworkOk === null ? null : details.paperworkOk ? 'documentação em dia' : 'documentação pendente',
    details.singleOwner ? 'único dono' : null,
  ].filter(Boolean).join('; ').slice(0, 160);
}

/**
 * O cliente está entregando dado do veículo da troca (modelo, ano ou quilometragem) e não
 * pedindo um veículo do estoque. Sem isso, "é uma Honda Pop" virava busca no catálogo.
 */
export function isTradeInDataFollowUp(text: string, recentTradeIn?: string | null): boolean {
  if (!recentTradeIn) return false;
  const v = normalizePlain(text);
  if (v.length > 120) return false;
  if (/\b(quero|procuro|busco|gostei|comprar|financ\w*|simular|escolhi|interessad\w*|trocar n[ao])\b/.test(v)) {
    return false;
  }
  const details = extractTradeInDetails(text);
  return details.vehicle !== null || details.year !== null || details.mileageKm !== null;
}

export function isTradeInYearFollowUp(text: string, recentTradeIn?: string | null): boolean {
  const v = normalizePlain(text);
  return Boolean(recentTradeIn) && v.length <= 100 && /\b(?:19|20)\d{2}\b/.test(v) &&
    !/\b(quero|procuro|busco|gostei|comprar|financ\w*)\b/.test(v);
}

export function isTradeInClarification(text: string, recentTradeIn?: string | null): boolean {
  if (!recentTradeIn) return false;
  // "????" ou uma cobrança curta de resposta ("aceita?", "e aí?") sobre a proposta em aberto.
  return /^\s*\?{2,}\s*$/.test(text) ||
    /^(e (?:ai|entao)|entao|aceita\w*|pode ser|da certo|tem interesse|serve)\s*\??$/.test(normalizePlain(text));
}

const KNOWN_BRANDS = [
  { canonical: 'Honda', aliases: ['honda'] },
  { canonical: 'Yamaha', aliases: ['yamaha'] },
  { canonical: 'Volkswagen', aliases: ['volkswagen', 'vw'] },
  { canonical: 'Fiat', aliases: ['fiat'] },
  { canonical: 'Chevrolet', aliases: ['chevrolet', 'gm'] },
  { canonical: 'Toyota', aliases: ['toyota'] },
  { canonical: 'Hyundai', aliases: ['hyundai'] },
  { canonical: 'Jeep', aliases: ['jeep'] },
  { canonical: 'Renault', aliases: ['renault'] },
  { canonical: 'Nissan', aliases: ['nissan'] },
  { canonical: 'Suzuki', aliases: ['suzuki'] },
  { canonical: 'BMW', aliases: ['bmw'] },
  { canonical: 'Kawasaki', aliases: ['kawasaki'] },
];

export type DetectedIntents = {
  asksAddressOrLocation: boolean;
  asksPhoneOrWhatsapp: boolean;
  asksHoursOrVisit: boolean;
  asksAboutStoreOrTrust: boolean;
  asksToSellVehicle: boolean;
  asksTradeIn: boolean;
  asksFinancing: boolean;
  asksHuman: boolean;
  asksGreetingOnly: boolean;
  asksAllInventory: boolean;
  asksCheapest: boolean;
  asksMostExpensive: boolean;
  asksLowestKm: boolean;
  asksNewest: boolean;
  asksCourtesyClosing: boolean;
  asksRecommendation: boolean;
  asksWorkOrAppUseCase: boolean;
  asksLongDistanceUseCase: boolean;
  asksOutOfScopeProduct: string | null;
  asksSpecificAttribute: {
    mileage: boolean;
    color: boolean;
    year: boolean;
    price: boolean;
    engineOrSpecs: boolean;
  };
  wantsMoto: boolean;
  wantsCar: boolean;
  budget: { maxPriceCents: number; quote: string } | null;
  entryCents: number | null;
};

export function detectMessageIntents(text: string): DetectedIntents {
  const v = normalizePlain(text);
  const entryCents = extractEntryCents(text);

  const asksAddressOrLocation =
    /\b(endereco|onde fica\w*|fica\w* onde|onde voces|onde e a loja|onde esta\w*|localiza\w*|bairro|cidade|cep|como chegar|mapa|maps|rua|elcias lopes|parangaba|fortaleza|loja fisica|ponto de referencia)\b/.test(
      v,
    );

  // "vendem celular?" cita o aparelho como produto, não pede o contato da loja.
  const asksPhoneOrWhatsapp =
    /\b(telefone|whatsapp|zap|wpp|numero|contato|ligar|celular)\b/.test(v) &&
    !/\b(vend\w*|compra\w*|tem|teria|possui)\s+(?:\w+\s+){0,2}(celular|telefone)\b/.test(v);

  const asksHoursOrVisit =
    /\b(horario\w*|funciona\w*|abre|abrem|aberto|aberta|fecha\w*|sabado|domingo|feriado|visita\w*|ir na loja|ir ai|ir agora|ir hoje|posso ir|posso passar|pode ir|pode passar|conhecer a loja)\b/.test(
      v,
    );

  const asksAboutStoreOrTrust =
    /\b(quem e voce|quem fala|dayse|sobre a loja|liberato motos|avaliac\w*|estrelas|google|confiavel|historia)\b/.test(
      v,
    );

  // Pergunta sobre consequência, arrependimento ou política de pós-venda não é intenção de
  // compra: a base não tem esse dado, então ela não deve capturar o turno com o folder de
  // troca ou de financiamento. Quem responde esses casos é o modelo.
  const asksPolicyOrConsequence =
    /\b(atras\w*|nao pagar|deixar de pagar|inadimpl\w*|multa|juros de mora|retomad\w*|busca e apreensao|devolv\w*|arrepend\w*|desistir|nao gostar|defeito|reclamac\w*|codigo de defesa|7 dias|sete dias|cancel\w*)\b/.test(
      v,
    );

  const asksToSellVehicle =
    /\b(quero vender|vender minha moto|vender meu carro|voces compram|loja compra|compram moto|compram carro|vender meu veiculo)\b/.test(
      v,
    );

  const mentionsKnownModel =
    INVENTORY_VEHICLES.some((item) => mentionsModelName(item.model, text, item.brand)) ||
    KNOWN_UNLISTED_MODELS.some((model) => mentionsModelName(model, text));
  const mentionsTradeInPhrase =
    /\b(troca|trocar|dar na troca|aceita\w* troca|aceita\w* moto|aceita\w* carro|aceita\w* uma moto|aceita\w* um carro|meu carro na troca|minha moto na troca|veiculo na troca|como entrada|dar de entrada|moto de entrada|carro de entrada)\b/.test(
      v,
    ) || /\b(?:pra|para)\s+d(?:a|ar)\s+(?:de|como|na)\s+entrada\b/.test(v) ||
    (/\bde entrada\b/.test(v) && (OUT_OF_SCOPE_PRODUCTS.some((item) => new RegExp(`\\b${item}\\b`).test(v)) || entryCents === null) &&
      (mentionsKnownModel || /\b(?:tenho|meu|minha|aceita\w*)\b/.test(v)));
  // "posso trocar se eu não gostar" é devolução, não entrada: só vale como troca quando o
  // cliente aponta um veículo próprio.
  const offersOwnVehicle = mentionsKnownModel || /\b(?:tenho|possuo|meu|minha|aceita\w*)\b/.test(v);
  const asksTradeIn = mentionsTradeInPhrase && !(asksPolicyOrConsequence && !offersOwnVehicle);

  const asksFinancing =
    (/\b(financ\w*|parcel\w*|credito|simulac\w*|banco|cartao|sem entrada|dar entrada|prestac\w*)\b/.test(
      v,
    ) || (/\bentrada\b/.test(v) && !asksTradeIn)) && !asksPolicyOrConsequence;

  const asksHuman =
    /\b(falar com vendedor|falar com atendente|chamar vendedor|atendente humano|falar com uma pessoa|atendimento humano|quero um vendedor)\b/.test(
      v,
    ) || (/^(vendedor|atendente|humano)$/.test(v));

  const asksAllInventory =
    /\b(estoque|catalogo|todos os veiculos|quais veiculos|o que tem hoje|o que voces tem|opcoes disponiveis|mostrar tudo|ver todos|quantos veiculos|lista de veiculos)\b/.test(
      v,
    );

  const asksCheapest =
    /\b(mais barat\w*|menor preco|menor valor|mais em conta|mais acessive\w*)\b/.test(v);

  const asksMostExpensive =
    /\b(mais car\w*|maior preco|maior valor)\b/.test(v);

  const asksLowestKm =
    /\b(menor km|menor quilometragem|menos rodad\w*|baixa quilometragem|mais conservad\w*)\b/.test(v);

  const asksNewest =
    /\b(mais nov\w*|ano mais recente|mais recente)\b/.test(v);

  // Agradecimento ou encerramento não precisa de inferência: resposta instantânea, sem custo
  // de modelo e sem risco de timeout num turno que só pede cordialidade.
  // Pedido explícito de indicação: a base não decide por perfil, mas o modelo precisa de estoque.
  const asksRecommendation =
    /\b(o que (?:voce|vc|tu) (?:sugere|indica|recomenda|acha)|qual (?:voce|vc) (?:indica|recomenda|sugere)|me (?:ajuda a escolher|indica|sugere|recomenda)|qual (?:a )?melhor (?:opcao|moto|carro|escolha)|primeira moto|primeiro carro|nao sei qual|to na duvida|estou na duvida|qual vale mais a pena|o que compensa)\b/.test(
      v,
    );

  const asksCourtesyClosing =
    /^(ok+|okay|blz|beleza|valeu|vlw|obrigad\w*|brigad\w*|agradec\w*|certo|entendi|perfeito|show|otimo|legal|bacana|k{2,}|haha\w*|rs+)[\s!.,…]*$/.test(
      v,
    ) ||
    /\b(vou pensar|vou analisar|vou ver com calma|depois eu (?:volto|falo|chamo)|qualquer coisa eu (?:chamo|falo|volto))\b/.test(
      v,
    );

  const asksWorkOrAppUseCase =
    /\b(uber|99|aplicativo|app|ifood|entreg\w*|motoboy|frete|custo beneficio|custo-beneficio|melhor custo|economica|para rodar|rodar na|rodar no|para trabalhar)\b/.test(
      v,
    );

  const asksLongDistanceUseCase =
    /\b(viagem|viagens|viajar|viajando|estrada|rodovia|longa distancia|longas distancias)\b/.test(v);

  const asksOutOfScopeProduct =
    OUT_OF_SCOPE_PRODUCTS.find((item) => new RegExp(`\\b${item}\\b`).test(v)) ?? null;

  const asksSpecificAttribute = {
    mileage: /\b(km|quilometragem|rodad\w*|quantos km)\b/.test(v),
    color: /\b(cor|cores|branc\w*|pret\w*|vermelh\w*|cinza|prata|azul)\b/.test(v),
    year: /\b(qual o ano|que ano|ano dela|ano dele|ano da|ano do)\b/.test(v),
    price: /\b(quanto custa|qual o preco|qual o valor|quanto ta|quanto esta|valor da|valor do|preco da|preco do)\b/.test(v),
    engineOrSpecs: /\b(motor\w*|potencia|cavalo\w*|cv|cambio|marcha\w*|combustivel|flex|cacamba|ficha tecnica|especificac\w*|ar[- ]condicionado|direcao hidraulica|vidro eletrico|trava eletrica|airbag|abs|som|multimidia)\b/.test(v),
  };

  const wantsMoto =
    /\b(moto|motos|motocicleta\w*|duas rodas|trail|street)\b/.test(v) &&
    !isMentionedOnlyAsTradeIn('moto', v);

  const wantsCar =
    /\b(carro|carros|automove\w*|picape\w*|caminhonete\w*|utilitario\w*)\b/.test(v) &&
    !isMentionedOnlyAsTradeIn('carro', v);

  const budget = extractBudgetCents(text);

  const isGreetingWord = /^(oi+|ola+|bom dia|boa tarde|boa noite|tudo bem|e ai|opa|fala)(\s+dayse)?[!?.\s]*$/.test(v);

  return {
    asksAddressOrLocation,
    asksPhoneOrWhatsapp,
    asksHoursOrVisit,
    asksAboutStoreOrTrust,
    asksToSellVehicle,
    asksTradeIn,
    asksFinancing,
    asksHuman,
    asksGreetingOnly: isGreetingWord,
    asksAllInventory,
    asksCheapest,
    asksMostExpensive,
    asksLowestKm,
    asksNewest,
    asksCourtesyClosing,
    asksRecommendation,
    asksWorkOrAppUseCase,
    asksLongDistanceUseCase,
    asksOutOfScopeProduct,
    asksSpecificAttribute,
    wantsMoto,
    wantsCar,
    budget,
    entryCents,
  };
}

export function formatVehicleBullet(v: EnrichedCatalogVehicle, includeDetails = false): string {
  const parts = [
    `**${v.title}** (${v.categoryLabel})`,
    formatPrice(v.priceBRL),
    v.year ? `ano ${v.year}` : null,
    v.mileageKm !== null && v.mileageKm !== undefined ? formatKilometers(v.mileageKm) : null,
    v.color && v.color !== 'Não informada' ? `cor ${v.color}` : null,
  ].filter(Boolean);

  let line = `• ${parts.join(' · ')}`;
  if (includeDetails) {
    const extra: string[] = [];
    if (v.shortDescription) extra.push(v.shortDescription);
    if (v.factorySpecs.length > 0) extra.push(`Dados de fábrica: ${v.factorySpecs.join(', ')}.`);
    if (extra.length > 0) {
      line += `\n  ${extra.join(' ')}`;
    }
  }
  return line;
}

/**
 *Verifica se a mensagem faz uma pergunta institucional/loja ou uma consulta específica ao catálogo
 * que vai além dos 5 botões simples do menu inicial.
 */
export function isKnowledgeOrSpecificCatalogQuery(text: string): boolean {
  const intents = detectMessageIntents(text);
  if (
    intents.asksAddressOrLocation ||
    intents.asksPhoneOrWhatsapp ||
    intents.asksHoursOrVisit ||
    intents.asksAboutStoreOrTrust ||
    intents.asksToSellVehicle ||
    intents.asksTradeIn ||
    intents.asksFinancing ||
    intents.asksGreetingOnly ||
    intents.asksAllInventory ||
    intents.asksCheapest ||
    intents.asksMostExpensive ||
    intents.asksLowestKm ||
    intents.asksNewest ||
    intents.asksWorkOrAppUseCase ||
    intents.asksLongDistanceUseCase ||
    intents.asksOutOfScopeProduct !== null ||
    intents.budget !== null ||
    intents.asksSpecificAttribute.mileage ||
    intents.asksSpecificAttribute.color ||
    intents.asksSpecificAttribute.year ||
    intents.asksSpecificAttribute.price ||
    intents.asksSpecificAttribute.engineOrSpecs
  ) {
    return true;
  }

  const v = normalizePlain(text);
  // Verifica se cita algum modelo ou marca conhecida do estoque ou do mercado
  for (const item of INVENTORY_VEHICLES) {
    const brandNorm = normalizePlain(item.brand);
    if (
      mentionsModelName(item.model, text, item.brand) ||
      (brandNorm && new RegExp(`\\b${brandNorm}\\b`).test(v))
    ) {
      return true;
    }
  }
  for (const brand of KNOWN_BRANDS) {
    if (brand.aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(v))) return true;
  }
  for (const unlisted of KNOWN_UNLISTED_MODELS) {
    if (mentionsModelName(unlisted, text)) return true;
  }

  return false;
}

/**
 * Marca e modelo que o cliente citou como interesse de compra, ignorando o que ele citou
 * apenas como veículo de troca. `model` só vem preenchido para modelo que existe no catálogo,
 * para não filtrar a busca por algo que a loja não anuncia; `mentionsAnyModel` também cobre
 * modelos conhecidos de mercado, úteis para decidir se vale consultar o estoque.
 */
export function detectMentionedCatalogTerms(
  text: string,
): { brand?: string; model?: string; mentionsAnyModel: boolean } {
  const v = normalizePlain(text);
  const notOnlyTradeIn = (term: string) => !isMentionedOnlyAsTradeIn(normalizePlain(term), v);

  const brand = KNOWN_BRANDS.find((item) => item.aliases.some(
    (alias) => new RegExp(`\\b${alias}\\b`).test(v) && notOnlyTradeIn(alias),
  ))?.canonical;
  const model = INVENTORY_VEHICLES.find(
    (item) => mentionsModelName(item.model, text, item.brand) && notOnlyTradeIn(item.model),
  )?.model;
  const unlisted = KNOWN_UNLISTED_MODELS.find(
    (item) => mentionsModelName(item, text) && notOnlyTradeIn(item),
  );
  return { brand, model, mentionsAnyModel: Boolean(model ?? unlisted) };
}

/** Verifica se a mensagem pergunta sobre dados institucionais da loja (endereço, telefone, horário, avaliação, venda ou item fora do nicho). */
export function hasInstitutionalQuestion(text: string): boolean {
  const v = normalizePlain(text);
  if (v.startsWith('[midia_whatsapp:')) return true;
  const intents = detectMessageIntents(text);
  return (
    intents.asksAddressOrLocation ||
    intents.asksPhoneOrWhatsapp ||
    intents.asksHoursOrVisit ||
    intents.asksAboutStoreOrTrust ||
    intents.asksToSellVehicle ||
    intents.asksGreetingOnly ||
    intents.asksCourtesyClosing ||
    intents.asksOutOfScopeProduct !== null
  );
}

/**
 * Motor principal de conhecimento e consultoria automotiva da Dayse:
 * Responde com precisão sobre toda a base da plataforma (endereço, bairro, CEP, Google Maps,
 * telefone/WhatsApp, avaliação no Google, horário, compra, venda, troca, financiamento),
 * aplica consultoria especialista por perfil de uso (Uber, 99, entregas, trabalho, custo-benefício),
 * blinda o domínio automotivo contra produtos fora do nicho e cruza em tempo real com o catálogo.
 */
export async function answerFromPlatformKnowledge(
  text: string,
  searchFn: typeof searchAvailableVehicles = searchAvailableVehicles,
  context?: { recentModelOrTitle?: string | null; recentTradeIn?: string | null; customerName?: string | null },
): Promise<KnowledgeReply> {
  const v = normalizePlain(text);
  const intents = detectMessageIntents(text);
  const firstName = extractCustomerFirstName(text, context?.customerName);
  const nameGreeting = firstName ? `, **${firstName}**` : '';
  // Dentro de um trecho já em negrito o nome entra sem marcação: `**... , **Nome**!**` quebra
  // o markdown do site e vira `*... , *Nome*!*` na tela do WhatsApp.
  const namePlain = firstName ? `, ${firstName}` : '';
  const tradeSource = [context?.recentTradeIn, text].filter(Boolean).join(' ');
  const normalizedTradeSource = normalizePlain(tradeSource);
  const offeredNonVehicle = intents.asksOutOfScopeProduct && /\b(entrada|troca)\b/.test(v) &&
    /\b(tenho|minha|meu|possuo|aceita\w*|recebe\w*|pega\w*|dar|da)\b/.test(v);
  if (offeredNonVehicle) {
    const offeredLabel = intents.asksOutOfScopeProduct === 'bicicleta' && /\bbicicleta eletrica\b/.test(normalizedTradeSource)
      ? 'bicicleta elétrica' : intents.asksOutOfScopeProduct;
    const estimatedCents = extractEntryCents(tradeSource);
    const target = /\bbros\b/.test(normalizedTradeSource) ? ' na Bros' : '';
    const brosPublished = target && /\bbros\b/.test(v)
      ? await searchFn({ type: 'motorcycle', model: 'Bros', limit: 1 })
        .then((result) => result.items.some((item) => /\bbros\b/.test(normalizePlain(item.model ?? ''))))
        .catch(() => null)
      : null;
    const valueQuote = tradeSource.match(/(?:r\$\s*)?\d+(?:[.,]\d+)?\s*mil(?:\s*reais)?|r\$\s*\d{1,3}(?:\.\d{3})+(?:,\d{2})?/i)?.[0];
    const tradeFact = [offeredLabel, valueQuote, target ? 'entrada na Bros' : 'entrada na compra']
      .filter(Boolean).join('; ').slice(0, 100);
    const responseStart = context?.recentTradeIn ? `Sim, entendi sua proposta${nameGreeting}` : `Entendi${nameGreeting}`;
    return {
      matched: true, isInstitutionalOnly: false,
      text: `${responseStart}: você quer oferecer **${offeredLabel}**${estimatedCents
        ? `, que você estima em **${formatPrice(estimatedCents / 100)}**` : ''} como entrada${target}. A loja avalia motos e carros usados na troca; para ${offeredLabel}, um vendedor precisa confirmar se aceita e qual valor atribui.${brosPublished === false
        ? ' Não encontrei uma Bros publicada no catálogo agora, mas posso verificar outras opções.' : ''} Vou sinalizar sua proposta para avaliação. Pode me dizer a marca, o modelo e o estado do item?`,
      cards: [], facts: [{ field: 'trade_in', quote: tradeFact }],
      handoffRequested: true, handoffReason: 'trade_in', handoffUrl: null,
      checkedAt: new Date().toISOString(),
    };
  }
  // Item fora do nicho já oferecido como entrada. Enquanto a proposta está aberta, falar dele é
  // continuar a negociação, nunca pedir para comprar: foi a própria Dayse quem pediu "marca,
  // modelo e estado do item", então a resposta a essa pergunta não pode virar "não temos por aqui".
  const openNonVehicleOffer = context?.recentTradeIn
    ? OUT_OF_SCOPE_PRODUCTS.find((item) => new RegExp(`\\b${item}\\b`).test(normalizePlain(context.recentTradeIn!)))
    : undefined;
  const continuesNonVehicleOffer = Boolean(openNonVehicleOffer) &&
    !intents.wantsMoto && !intents.wantsCar && (
      isTradeInClarification(text, context?.recentTradeIn) ||
      isTradeInYearFollowUp(text, context?.recentTradeIn) ||
      isTradeInDataFollowUp(text, context?.recentTradeIn) ||
      /^aceita\w*(?:\s+(?:ela|isso|a bicicleta))?\??$/.test(v) ||
      // Descreveu o próprio item que ofereceu.
      intents.asksOutOfScopeProduct === openNonVehicleOffer ||
      new RegExp(`\\b${openNonVehicleOffer}\\b`).test(v)
    );
  if (continuesNonVehicleOffer) {
    // Cobrar resposta é diferente de descrever o item: ecoar "Aceitam ela?" como se fosse a
    // descrição do produto soa como se a Dayse não tivesse lido.
    const apenasCobrança = isTradeInClarification(text, context?.recentTradeIn) ||
      /^aceita\w*(?:\s+(?:ela|isso|a bicicleta))?\??$/.test(v);
    return {
      matched: true, isInstitutionalOnly: false,
      text: apenasCobrança
        ? `Ainda não tenho essa resposta${nameGreeting}: o uso de ${openNonVehicleOffer} como entrada precisa ser confirmado por um vendedor, e nem o aceite nem o valor saem antes da avaliação presencial na loja.`
        : `Anotei${nameGreeting}: **${text.trim().slice(0, 120)}**. Já passei os dados para o vendedor, mas o aceite de ${openNonVehicleOffer} como entrada precisa ser confirmado por ele, junto com o valor, na avaliação presencial aqui na loja. Enquanto isso, qual moto ou carro do nosso estoque você tem em vista?`,
      cards: [], facts: [{ field: 'trade_in', quote: tradeSource.slice(0, 160) }],
      handoffRequested: true, handoffReason: 'trade_in', handoffUrl: null,
      checkedAt: new Date().toISOString(),
    };
  }
  if (intents.asksOutOfScopeProduct && !intents.wantsMoto && !intents.wantsCar) {
    const recentVehicle = context?.recentModelOrTitle?.trim();
    return {
      matched: true,
      isInstitutionalOnly: true,
      text: `${intents.asksOutOfScopeProduct} não temos por aqui${nameGreeting} 😄 A ${STORE.name} trabalha com motos e carros seminovos.${recentVehicle
        ? ` Quer continuar falando do **${recentVehicle}** ou prefere procurar outro veículo?`
        : ' Se quiser, me conta que moto ou carro você procura.'}`,
      cards: [], facts: [], handoffRequested: false, handoffReason: null, handoffUrl: null,
      checkedAt: new Date().toISOString(),
    };
  }
  const { items: catalog, checkedAt } = await loadFullPublishedCatalog(searchFn);
  const mentionsTargetModel = catalog.some((item) => {
    if (!item.model) return false;
    const model = normalizePlain(item.model);
    const brandAndModel = `${normalizePlain(item.brand ?? '')} ${model}`.trim();
    return ['na', 'no', 'pela', 'pelo'].some((prefix) =>
      v.includes(`${prefix} ${model}`) || v.includes(`${prefix} ${brandAndModel}`));
  });
  const tradeOnly = intents.asksTradeIn &&
    !/\b(quero|procuro|busco|gostei|interessad\w*|comprar|escolhi|simular)\b/.test(v) &&
    !mentionsTargetModel;

  const paragraphs: string[] = [];
  const facts: LeadFact[] = [];
  let handoffRequested = false;
  let handoffReason: HandoffReason | null = null;
  let tradeInState: KnowledgeReply['tradeIn'] = null;

  // 0. Mídia enviada pelo cliente no WhatsApp (Áudio, Foto, Vídeo ou Documento para avaliação)
  if (v.startsWith('[midia_whatsapp:audio]')) {
    facts.push({ field: 'negotiation', quote: 'Cliente enviou áudio no WhatsApp' });
    return {
      matched: true,
      isInstitutionalOnly: false,
      text: `🎧 **Recebi seu áudio${namePlain}!**\nNosso consultor da **${STORE.name}** já consegue ouvi-lo diretamente no WhatsApp da loja e vai te responder em instantes.\n\nSe quiser que eu já te adiante fotos, preços ou ficha técnica de algum veículo do estoque agora mesmo, pode digitar o nome do modelo ou valor aqui embaixo!`,
      cards: [],
      facts,
      handoffRequested: true,
      handoffReason: 'visitor_request',
      handoffUrl: null,
      checkedAt,
    };
  }

  if (v.startsWith('[midia_whatsapp:visual]')) {
    const captionRaw = text.replace(/^\[MIDIA_WHATSAPP:VISUAL\]\s*/i, '').trim();
    facts.push({
      field: 'trade_in',
      quote: captionRaw ? `Enviou foto/vídeo: ${captionRaw.slice(0, 80)}` : 'Enviou fotos/vídeo do veículo para avaliação',
    });
    paragraphs.push(
      `📸 **Recebi as imagens/mídia do seu veículo${namePlain}!**\nComo a avaliação visual de troca e análise de documentos são feitas com todo cuidado pelo nosso avaliador, já destaquei sua conversa para a equipe da **${STORE.name}** conferir as fotos no aparelho da loja.\n\nPara agilizar sua avaliação, me confirme por texto:\n• **Marca, modelo e ano** do seu veículo\n• **Quilometragem aproximada**\n• Qual moto ou carro do nosso estoque você tem interesse na troca`,
    );
    handoffRequested = true;
    handoffReason = 'trade_in';
  }

  const recentTradeIn = context?.recentTradeIn;
  const tradeInClarify = isTradeInClarification(text, recentTradeIn);
  const tradeInData = isTradeInDataFollowUp(text, recentTradeIn);
  // Coleta acumulativa dos dados da troca. O fato `trade_in` carrega o que já foi dito, a
  // mensagem atual acrescenta o que falta, e nada disso consulta o estoque: "é uma Honda Pop"
  // identifica o veículo do cliente, não um anúncio da loja.
  if (recentTradeIn && (tradeInClarify || tradeInData)) {
    const known = mergeTradeInDetails(
      extractTradeInDetails(recentTradeIn),
      extractTradeInDetails(text),
    );
    const registrados = [
      known.vehicle,
      known.year ? `ano ${known.year}` : null,
      known.mileageKm !== null ? formatKilometers(known.mileageKm) : null,
      known.condition,
      known.paperworkOk === null ? null : known.paperworkOk ? 'documentação em dia' : 'documentação pendente',
      known.singleOwner ? 'único dono' : null,
    ].filter(Boolean);
    // No máximo dois pedidos por turno: a lista inteira de uma vez afugenta o cliente.
    const essenciaisFaltando = missingTradeInSlots(known, { essencial: true }).slice(0, 2);
    const complementoFaltando = missingTradeInSlots(known, { essencial: false }).slice(0, 1);
    const faltando = essenciaisFaltando.map((item) => `**${item}**`);
    const abertura = tradeInClarify ? `Desculpe a demora${nameGreeting}!` : `Perfeito${nameGreeting}!`;
    // O aceite precisa ser reafirmado: quem escreve "????" está cobrando essa confirmação.
    const aceite = ` **Sim, aceitamos ${known.vehicle ?? 'sua moto ou carro'} como entrada**, mediante avaliação da loja.`;
    const anotado = registrados.length ? ` Já anotei **${registrados.join(' · ')}** para o avaliador.` : '';
    const proximo = faltando.length
      ? ` Para adiantar, me diz ${faltando.join(' e ')}?`
      // Essenciais completos: o avaliador já tem com o que trabalhar, então a conversa passa a
      // puxar a visita — a avaliação é presencial e quem define o valor é a loja.
      : ` A equipe confere o documento, a quilometragem e o estado do veículo antes de definir o valor, e isso é feito aqui na loja com o avaliador.${
        complementoFaltando.length ? ` Se souber, me adianta **${complementoFaltando[0]}**.` : ''
      } Quer combinar um horário para passar, ou prefere que eu já chame um vendedor?`;
    return {
      matched: true,
      isInstitutionalOnly: false,
      text: `${abertura}${aceite}${anotado}${proximo}`,
      cards: [],
      facts: [{ field: 'trade_in', quote: formatTradeInQuote(known) || recentTradeIn.slice(0, 100) }],
      handoffRequested: true,
      handoffReason: 'trade_in',
      handoffUrl: null,
      checkedAt,
      tradeIn: {
        known,
        missing: [...essenciaisFaltando, ...(essenciaisFaltando.length ? [] : complementoFaltando)],
        essentialsComplete: essenciaisFaltando.length === 0,
        isNudge: tradeInClarify,
        soleTopic: true,
      },
    };
  }

  // 1. Saudação pura (espelhando Bom dia / Boa tarde / Boa noite + nome do cliente)
  if (intents.asksGreetingOnly) {
    const motosCount = catalog.filter((i) => i.type === 'motorcycle').length;
    const carsCount = catalog.filter((i) => i.type === 'car').length;
    const periodGreeting = v.includes('bom dia')
      ? 'Bom dia'
      : v.includes('boa tarde')
        ? 'Boa tarde'
        : v.includes('boa noite')
          ? 'Boa noite'
          : 'Olá';
    const stockSummary =
      catalog.length > 0
        ? `Hoje temos **${catalog.length} veículos publicados** na vitrine (${motosCount} motos e ${carsCount} carros).`
        : 'Estou pronta para consultar nosso estoque em tempo real.';
    return {
      matched: true,
      isInstitutionalOnly: true,
      text: `${periodGreeting}${nameGreeting}! Tudo ótimo por aqui! Eu sou a **Dayse**, consultora virtual da **${STORE.name}** na ${STORE.district} (${STORE.city}/${STORE.state}). ${stockSummary}\n\nPosso te indicar a melhor opção pelo seu perfil (trabalho, Uber/99, dia a dia ou família), simular entrada/financiamento, avaliar seu usado na troca ou enviar nossa localização. Como posso te ajudar hoje?`,
      cards: [],
      facts: [],
      handoffRequested: false,
      handoffReason: null,
      handoffUrl: null,
      checkedAt,
    };
  }

  // 1b. Agradecimento ou "vou pensar": encerra com cordialidade, sem empurrar estoque.
  if (
    intents.asksCourtesyClosing && !intents.asksGreetingOnly && !intents.asksTradeIn &&
    !intents.asksFinancing && !intents.asksHuman && !intents.asksAddressOrLocation &&
    !intents.asksPhoneOrWhatsapp && !intents.asksHoursOrVisit && !intents.asksAboutStoreOrTrust &&
    !intents.asksToSellVehicle && !intents.asksAllInventory && !intents.wantsMoto &&
    !intents.wantsCar && intents.budget === null && !intents.asksOutOfScopeProduct
  ) {
    return {
      matched: true,
      isInstitutionalOnly: true,
      text: `Imagina${nameGreeting}, fico à disposição! Quando quiser retomar, me chama aqui que eu já levanto as opções do estoque e tiro suas dúvidas. 😊`,
      cards: [],
      facts: [],
      handoffRequested: false,
      handoffReason: null,
      handoffUrl: null,
      checkedAt,
    };
  }

  // 2. Blocos institucionais da plataforma (Endereço, Telefone, Horário, Sobre a Loja, Venda)
  if (intents.asksAddressOrLocation) {
    paragraphs.push(
      `📍 **Endereço da ${STORE.name}:**\nEstamos na **${STORE_STREET_ADDRESS} — bairro ${STORE.district}, ${STORE.city}/${STORE.state}, CEP ${STORE.postalCode}**.\n${MAP_URL}`,
    );
  }

  if (intents.asksPhoneOrWhatsapp) {
    paragraphs.push(
      `📞 **Telefone e WhatsApp oficial:**\nNosso número de atendimento direto é **${STORE.phoneDisplay}**. Você também pode clicar em falar com um vendedor aqui no chat para abrir a conversa direto no WhatsApp da loja.`,
    );
  }

  if (intents.asksHoursOrVisit) {
    paragraphs.push(
      `Quero te receber${nameGreeting}! Antes de sair, confirme com a equipe pelo WhatsApp **${STORE.phoneDisplay}** se ainda estamos atendendo hoje${context?.recentModelOrTitle
        ? ` e se **${context.recentModelOrTitle}** continua disponível`
        : ''}. Estamos na **${STORE_ADDRESS_LINE}**. ${MAP_URL}`,
    );
    facts.push({ field: 'visit', quote: text.trim().slice(0, 100) });
  }

  if (intents.asksAboutStoreOrTrust) {
    const motosCount = catalog.filter((i) => i.type === 'motorcycle').length;
    const carsCount = catalog.filter((i) => i.type === 'car').length;
    paragraphs.push(
      `⭐ **Sobre a ${STORE.name}:**\nSomos especialistas em **${STORE.tagline.toLowerCase()}** de motos e carros seminovos em ${STORE.city}/${STORE.state} (${STORE.district}), com **nota ${GOOGLE_PROFILE.rating} estrelas no Google**. Eu sou a **Dayse**, consultora virtual da loja, e atualmente acompanhamos **${catalog.length} veículos publicados** no catálogo (${motosCount} motos e ${carsCount} carros) com dados conferidos pela equipe.`,
    );
  }

  if (intents.asksToSellVehicle) {
    paragraphs.push(
      `🤝 **Venda do seu veículo:**\nA **${STORE.name}** trabalha com **compra, venda e troca**. Avaliamos sua moto ou carro seminovo presencialmente na nossa loja (${STORE_STREET_ADDRESS}, ${STORE.district}) ou fazemos uma pré-análise com nossos consultores pelo WhatsApp **${STORE.phoneDisplay}**.`,
    );
    handoffRequested = true;
    handoffReason = 'visitor_request';
  }

  // 3. Análise de busca no catálogo (modelos, marcas, categorias, orçamento, finalidade de uso, ordenação)
  let matchedModels = catalog.filter((item) => {
    if (tradeOnly) return false;
    const modelNorm = normalizePlain(item.model ?? '');
    const versionNorm = normalizePlain(item.version ?? '');
    const slugNorm = normalizePlain(item.slug.replace(/-/g, ' '));
    if (!modelNorm) return false;
    const mentionedModel =
      mentionsModelName(item.model, text, item.brand) ||
      (versionNorm && versionNorm.length >= 3 && new RegExp(`\\b${versionNorm}\\b`).test(v)) ||
      (slugNorm && v.includes(slugNorm));
    return mentionedModel && !isMentionedOnlyAsTradeIn(modelNorm, v);
  });

  const asksAnySpecificAttr =
    intents.asksSpecificAttribute.mileage ||
    intents.asksSpecificAttribute.color ||
    intents.asksSpecificAttribute.year ||
    intents.asksSpecificAttribute.price ||
    intents.asksSpecificAttribute.engineOrSpecs;

  let matchedFromRecentContext = false;
  if (
    matchedModels.length === 0 &&
    (asksAnySpecificAttr || intents.asksFinancing) &&
    context?.recentModelOrTitle &&
    !intents.asksTradeIn &&
    !intents.wantsMoto &&
    !intents.wantsCar
  ) {
    const recentNorm = normalizePlain(context.recentModelOrTitle);
    matchedModels = catalog.filter((item) => {
      const modelNorm = normalizePlain(item.model ?? '');
      const titleNorm = normalizePlain(item.title);
      return (modelNorm && recentNorm.includes(modelNorm)) || titleNorm.includes(recentNorm);
    });
    matchedFromRecentContext = matchedModels.length > 0;
  }

  const requestedBrand = KNOWN_BRANDS.find((b) =>
    b.aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(v) && !isMentionedOnlyAsTradeIn(alias, v)),
  );

  // Um modelo citado que não está publicado hoje precisa de resposta honesta, venha ele da lista
  // de mercado ou do catálogo estático: despejar o estoque inteiro não responde a pergunta.
  const requestedUnlistedModel = KNOWN_UNLISTED_MODELS.find(
    (model) => mentionsModelName(model, text) && !isMentionedOnlyAsTradeIn(model, v),
  ) ?? (matchedModels.length === 0
    ? INVENTORY_VEHICLES.find(
      (item) => mentionsModelName(item.model, text, item.brand) &&
        !isMentionedOnlyAsTradeIn(normalizePlain(item.model), v),
    )?.model
    : undefined);

  if (matchedModels.length > 0 && matchedModels[0]?.model) {
    facts.push({ field: 'model', quote: matchedModels[0].model });
  } else if (requestedUnlistedModel && !tradeOnly) {
    facts.push({ field: 'model', quote: requestedUnlistedModel });
  }

  if (intents.wantsMoto && !intents.wantsCar) {
    facts.push({ field: 'category', quote: 'moto' });
  } else if (intents.wantsCar && !intents.wantsMoto) {
    facts.push({ field: 'category', quote: 'carro' });
  }

  if (intents.budget) {
    facts.push({ field: 'budget', quote: intents.budget.quote });
  }

  if (intents.asksWorkOrAppUseCase) {
    facts.push({
      field: 'purpose',
      quote: /\b(uber|99|aplicativo|app|ifood|entreg\w*|motoboy)\b/.test(v)
        ? 'Uber / aplicativo / entregas'
        : 'uso profissional / melhor custo-benefício',
    });
  }

  if (intents.asksLongDistanceUseCase) {
    facts.push({ field: 'purpose', quote: 'viagens longas' });
  }

  // Pergunta de preço sem veículo citado, dentro de assunto de financiamento, é sobre a entrada
  // e não um pedido de vitrine: listar o estoque inteiro aqui não responde nada.
  const priceOnlyAboutFinancing = intents.asksFinancing && matchedModels.length === 0 &&
    !requestedBrand && !requestedUnlistedModel && !intents.wantsMoto && !intents.wantsCar &&
    intents.budget === null && !intents.asksAllInventory &&
    intents.asksSpecificAttribute.price && !intents.asksSpecificAttribute.mileage &&
    !intents.asksSpecificAttribute.year && !intents.asksSpecificAttribute.color &&
    !intents.asksSpecificAttribute.engineOrSpecs;

  const hasCatalogIntent = !tradeOnly && !priceOnlyAboutFinancing && (
    matchedModels.length > 0 ||
    Boolean(requestedBrand) ||
    Boolean(requestedUnlistedModel) ||
    intents.wantsMoto ||
    intents.wantsCar ||
    intents.budget !== null ||
    intents.asksAllInventory ||
    intents.asksCheapest ||
    intents.asksMostExpensive ||
    intents.asksLowestKm ||
    intents.asksNewest ||
    intents.asksWorkOrAppUseCase ||
    intents.asksLongDistanceUseCase ||
    intents.asksSpecificAttribute.mileage ||
    intents.asksSpecificAttribute.color ||
    intents.asksSpecificAttribute.year ||
    intents.asksSpecificAttribute.price ||
    intents.asksSpecificAttribute.engineOrSpecs);

  let selectedCards: EnrichedCatalogVehicle[] = [];

  if (hasCatalogIntent) {
    // Caso 3A: Perguntou sobre um ou mais modelos específicos que existem no catálogo (ex: Saveiro, Pop, Fan, Titan, Fazer, Crosser, Strada)
    if (matchedModels.length > 0) {
      selectedCards = matchedModels.slice(0, 3);
      const detailsLines = selectedCards.map((item) => formatVehicleBullet(item, true));
      if (selectedCards.length === 1) {
        const target = selectedCards[0]!;
        const directSpotlight: string[] = [];
        if (intents.asksSpecificAttribute.price) {
          directSpotlight.push(`O valor anunciado de **${target.title}** é **${formatPrice(target.priceBRL)}**.`);
        }
        if (intents.asksSpecificAttribute.mileage) {
          directSpotlight.push(
            target.mileageKm !== null && target.mileageKm !== undefined
              ? `A quilometragem informada de **${target.title}** é **${formatKilometers(target.mileageKm)}**.`
              : `A quilometragem exata de **${target.title}** pode ser confirmada diretamente com nosso vendedor.`,
          );
        }
        if (intents.asksSpecificAttribute.year) {
          directSpotlight.push(
            target.year
              ? `O ano informado no anúncio de **${target.title}** é **${target.year}**.`
              : `O ano de **${target.title}** pode ser confirmado diretamente com a loja no atendimento.`,
          );
        }
        if (intents.asksSpecificAttribute.color && target.color) {
          directSpotlight.push(`A cor de **${target.title}** é **${target.color}**.`);
        }
        if (intents.asksSpecificAttribute.engineOrSpecs && target.factorySpecs.length > 0) {
          directSpotlight.push(`Especificações de referência de **${target.title}**: ${target.factorySpecs.join(' · ')}.`);
        }
        const prefix =
          directSpotlight.length > 0
            ? `${directSpotlight.join(' ')}\n\nFicha completa no nosso catálogo:`
            : `Aqui estão todas as informações sobre **${target.title}** disponível no nosso catálogo:`;
        paragraphs.push(matchedFromRecentContext && directSpotlight.length > 0
          ? directSpotlight.join(' ')
          : `${prefix}\n${detailsLines.join('\n')}`);
      } else {
        paragraphs.push(
          `Encontrei estes modelos no catálogo da **${STORE.name}**:\n${detailsLines.join('\n')}`,
        );
      }
    } else {
      // Filtragem geral do catálogo
      let filtered = [...catalog];

      if ((intents.wantsMoto || intents.asksLongDistanceUseCase || (intents.asksWorkOrAppUseCase && !intents.wantsCar)) && !intents.wantsCar) {
        filtered = filtered.filter((item) => item.type === 'motorcycle');
      } else if (intents.wantsCar && !intents.wantsMoto) {
        filtered = filtered.filter((item) => item.type === 'car');
      }

      if (requestedBrand) {
        filtered = filtered.filter(
          (item) => normalizePlain(item.brand ?? '') === normalizePlain(requestedBrand.canonical),
        );
      }

      if (intents.asksSpecificAttribute.color) {
        const colorMatch = v.match(/\b(branc[oa]|pret[oa]|vermelh[oa]|cinza)\b/);
        if (colorMatch && colorMatch[1]) {
          const colorPrefix = colorMatch[1].slice(0, 4);
          const byColor = filtered.filter((item) =>
            normalizePlain(item.color ?? '').includes(colorPrefix),
          );
          if (byColor.length > 0) filtered = byColor;
        }
      }

      if (intents.budget) {
        filtered = filtered.filter((item) => item.priceCents <= intents.budget!.maxPriceCents);
      }

      // Ordenações superlativas
      if (intents.asksCheapest) {
        filtered.sort((a, b) => a.priceCents - b.priceCents);
      } else if (intents.asksMostExpensive) {
        filtered.sort((a, b) => b.priceCents - a.priceCents);
      } else if (intents.asksLowestKm) {
        filtered.sort((a, b) => (a.mileageKm ?? 999_999) - (b.mileageKm ?? 999_999));
      } else if (intents.asksNewest) {
        filtered.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      } else {
        filtered.sort((a, b) => a.priceCents - b.priceCents);
      }

      // Caso pediu modelo que não existe no estoque atual (ex: Bros, Corolla, Gol)
      if (requestedUnlistedModel) {
        const fallbackCategory = [...catalog]
          .filter((item) =>
            intents.wantsCar
              ? item.type === 'car'
              : intents.wantsMoto
                ? item.type === 'motorcycle'
                : true,
          )
          .sort((a, b) => a.priceCents - b.priceCents)
          .slice(0, 3);
        selectedCards = fallbackCategory;
        const altLines = selectedCards.map((item) => formatVehicleBullet(item, false));
        paragraphs.push(
          `No momento não temos **${requestedUnlistedModel.toUpperCase()}** publicado no estoque da ${STORE.name}. ${
            selectedCards.length > 0
              ? `Mas temos estas opções disponíveis agora para você comparar:\n${altLines.join('\n')}`
              : 'Você pode falar com um vendedor para verificarmos novidades no pátio.'
          }`,
        );
      } else if (filtered.length > 0) {
        // Consultoria Especialista para Uber Moto / 99 / Entregas / Melhor Custo-Benefício
        if (intents.asksLongDistanceUseCase && !intents.wantsCar) {
          selectedCards = filtered.filter((item) =>
            /\b(lander|crosser|xre|tenere|sahara|versys|v-strom)\b/.test(normalizePlain(item.model ?? '')) ||
            /\b(trail|touring|adventure)\b/.test(normalizePlain(item.categoryLabel)),
          ).slice(0, 3);
          paragraphs.push(selectedCards.length > 0
            ? `Para **viagens longas**${nameGreeting}, eu começaria avaliando estas motos de perfil trail publicadas no nosso estoque:\n${selectedCards.map((item) => formatVehicleBullet(item, false)).join('\n')}\n\nAntes de decidir, vale conferir revisão, pneus e conforto para sua altura e para garupa. Você costuma viajar sozinho ou acompanhado? Qual é sua faixa de orçamento?`
            : `Para **viagens longas**${nameGreeting}, não encontrei agora uma moto de perfil trail ou touring publicada no nosso estoque. Posso pedir ao vendedor para conferir novas opções. Você viaja sozinho ou com garupa e qual é sua faixa de orçamento?`);
        } else if (intents.asksWorkOrAppUseCase && !intents.wantsCar && !intents.asksCheapest && !intents.asksLowestKm) {
          // Prioriza as 150cc Street (Fazer, Fan, Titan) que são as campeãs de Uber/99 pelo consumo, manutenção e conforto para garupa
          const street150 = filtered.filter((item) =>
            /\b(fazer|fan|titan)\b/.test(normalizePlain(item.model ?? '')),
          );
          selectedCards = (street150.length >= 2 ? street150 : filtered).slice(0, 3);
          const lines = selectedCards.map((item) => formatVehicleBullet(item, false));
          const crosser = catalog.find((item) => normalizePlain(item.model ?? '').includes('crosser'));
          const pop = catalog.find((item) => normalizePlain(item.model ?? '').includes('pop'));
          const extraTips: string[] = [];
          if (crosser && !selectedCards.some((c) => c.id === crosser.id)) {
            extraTips.push(
              `suspensão mais alta para ruas irregulares com a **${crosser.title}** (${formatPrice(crosser.priceBRL)})`,
            );
          }
          if (pop && !selectedCards.some((c) => c.id === pop.id)) {
            extraTips.push(
              `estado de zero km com a **${pop.title}** de apenas **${formatKilometers(pop.mileageKm ?? 660)}** (${formatPrice(pop.priceBRL)})`,
            );
          }

          paragraphs.push(
            `Para rodar na **Uber Moto, 99, entregas ou trabalho diário** com o melhor custo-benefício${nameGreeting}, o que mais compensa são as **150cc Street (Honda e Yamaha)**: fazem na faixa de **35 a 40 km/l**, têm manutenção barata, peças fáceis e aguentam rodar o dia inteiro com conforto.\n\nSeparei as **${selectedCards.length} melhores opções em custo-benefício** disponíveis hoje no nosso catálogo:\n${lines.join('\n')}${
              extraTips.length > 0 ? `\n\n💡 **Outras opções no pátio:** se preferir ${extraTips.join(', ou ')}.` : ''
            }${
              !intents.asksTradeIn && !intents.asksFinancing
                ? '\n\nVocê pretende comprar à vista, financiar ou colocar alguma moto como entrada?'
                : ''
            }`,
          );
        } else if (intents.asksWorkOrAppUseCase && intents.wantsCar) {
          selectedCards = filtered.slice(0, 3);
          const lines = selectedCards.map((item) => formatVehicleBullet(item, true));
          paragraphs.push(
            `Para **trabalho, carga ou rotina profissional**${nameGreeting}, nossas picapes utilitárias entregam robustez mecânica e excelente capacidade de caçamba:\n${lines.join('\n')}${
              !intents.asksTradeIn && !intents.asksFinancing
                ? '\n\nVocê pretende negociar à vista, financiar ou dar algum veículo como entrada?'
                : ''
            }`,
          );
        } else {
          selectedCards = filtered.slice(0, 3);
          const listToDescribe = intents.asksAllInventory ? filtered : selectedCards;
          const lines = listToDescribe.map((item) =>
            formatVehicleBullet(item, listToDescribe.length <= 2 || intents.asksSpecificAttribute.engineOrSpecs),
          );

          if (intents.asksCheapest) {
            const cheapest = filtered[0]!;
            paragraphs.push(
              `A opção de **menor valor** nessa busca hoje é **${cheapest.title}** por **${formatPrice(cheapest.priceBRL)}**${
                cheapest.year ? ` (ano ${cheapest.year})` : ''
              }${cheapest.mileageKm ? `, com ${formatKilometers(cheapest.mileageKm)}` : ''}.\n\nConfira as opções ordenadas pelo menor preço:\n${lines.join('\n')}`,
            );
          } else if (intents.asksLowestKm) {
            const lowestKm = filtered[0]!;
            paragraphs.push(
              `A opção com **menor quilometragem** informada no anúncio é **${lowestKm.title}** com **${
                lowestKm.mileageKm !== null ? formatKilometers(lowestKm.mileageKm) : 'km sob consulta'
              }** por **${formatPrice(lowestKm.priceBRL)}**.\n\nVeja os detalhes:\n${lines.join('\n')}`,
            );
          } else if (intents.asksAllInventory) {
            const motosCount = catalog.filter((i) => i.type === 'motorcycle').length;
            const carsCount = catalog.filter((i) => i.type === 'car').length;
            paragraphs.push(
              `Atualmente temos **${catalog.length} veículos publicados** no catálogo da **${STORE.name}** (${motosCount} motos e ${carsCount} carros):\n${lines.join('\n')}`,
            );
          } else {
            paragraphs.push(
              `Encontrei **${filtered.length} ${
                filtered.length === 1 ? 'opção publicada' : 'opções publicadas'
              }** no estoque da **${STORE.name}**:\n${lines.join('\n')}`,
            );
          }
        }
      } else {
        // Nenhum veículo bateu com o filtro (ex: orçamento abaixo do mínimo ou marca não disponível)
        const categoryPool = catalog
          .filter((item) =>
            intents.wantsCar
              ? item.type === 'car'
              : intents.wantsMoto
                ? item.type === 'motorcycle'
                : true,
          )
          .sort((a, b) => a.priceCents - b.priceCents);
        const closest = categoryPool.slice(0, 3);
        selectedCards = closest;
        if (intents.budget && closest.length > 0) {
          const lowest = closest[0]!;
          paragraphs.push(
            `No momento não temos anúncio publicado dentro de **${formatPrice(
              intents.budget.maxPriceCents / 100,
            )}**. Nossa opção de menor valor hoje nessa categoria é **${lowest.title}** por **${formatPrice(
              lowest.priceBRL,
            )}**.\n\nVeja as opções mais próximas disponíveis no estoque:\n${closest
              .map((item) => formatVehicleBullet(item, false))
              .join('\n')}`,
          );
        } else if (requestedBrand) {
          paragraphs.push(
            `No momento não temos veículos publicados da marca **${requestedBrand.canonical}** no estoque.${
              closest.length > 0
                ? `\n\nConfira outras opções disponíveis na loja:\n${closest
                    .map((item) => formatVehicleBullet(item, false))
                    .join('\n')}`
                : ''
            }`,
          );
        } else {
          paragraphs.push(
            'Não encontrei anúncios publicados com esse filtro específico agora. Você pode ajustar a busca ou falar direto com nosso vendedor.',
          );
        }
      }
    }
  }

  // 4. Troca e Financiamento (podem vir isolados ou combinados com busca de veículo)
  if (intents.asksTradeIn) {
    // O fato acumulado não pode ser sobrescrito por uma mensagem pobre: "aceita?" apagava
    // "bicicleta elétrica; 2 mil reais" e a equipe perdia a proposta.
    const knownTrade = mergeTradeInDetails(
      extractTradeInDetails(context?.recentTradeIn ?? ''),
      extractTradeInDetails(text),
    );
    const accumulatedQuote = formatTradeInQuote(knownTrade);
    facts.push({
      field: 'trade_in',
      quote: accumulatedQuote || context?.recentTradeIn?.slice(0, 100) || text.trim().slice(0, 100),
    });
    const hasYearOrSpecificTrade = /\b(19\d{2}|20\d{2})\b/.test(v);
    const offeredModel = tradeOnly
      ? [...catalog, ...INVENTORY_VEHICLES].find((item) => item.model &&
          mentionsModelName(item.model, text, item.brand))
      : null;
    const offeredVehicleLabel = offeredModel
      ? [offeredModel.brand, offeredModel.model].filter(Boolean).join(' ')
      : null;
    const followUpTradeQuestion = knownTrade.vehicle && knownTrade.year
      ? `Já estou com os dados da sua **${knownTrade.vehicle} ${knownTrade.year}** anotados para o avaliador, então não preciso perguntar de novo. Quer que eu encaminhe para um vendedor fechar os valores?`
      : hasYearOrSpecificTrade
      ? 'Já registrei os dados do seu veículo para o nosso avaliador! Qual moto ou carro do nosso estoque você quer colocar na negociação, ou prefere passar aqui na loja hoje?'
      : offeredVehicleLabel
        ? `Entendi que você tem uma **${offeredVehicleLabel}**. Qual é o **ano** dela? Se souber, me diga também a quilometragem aproximada para adiantar a avaliação.`
        : 'Me conta: **qual é o modelo e o ano** da sua moto ou carro? Assim já te explico como funciona a avaliação e deixo adiantado para a equipe!';
    paragraphs.push(
      `🔄 **Sim, aceitamos seu veículo como entrada${namePlain}!** 😊\nAqui na **${STORE.name}** nós fazemos **compra, venda, troca e financiamento** — analisamos sua moto ou carro usado como entrada na negociação (tanto para abater no valor à vista quanto para reduzir as parcelas do financiamento).\n\nBasta trazer para avaliação aqui na loja na **${STORE_STREET_ADDRESS} — ${STORE.district}, ${STORE.city}/${STORE.state}** ou enviar os dados pelo WhatsApp **${STORE.phoneDisplay}**.\n${
        !intents.asksAddressOrLocation ? MAP_URL : ''
      }\n\n${followUpTradeQuestion}`.trim(),
    );
    handoffRequested = true;
    handoffReason = 'trade_in';
    const essenciaisFaltando = missingTradeInSlots(knownTrade, { essencial: true }).slice(0, 2);
    tradeInState = {
      known: knownTrade,
      missing: essenciaisFaltando,
      essentialsComplete: essenciaisFaltando.length === 0,
      isNudge: false,
      // Só a troca foi dita até aqui; catálogo ou financiamento acrescentam outros parágrafos.
      soleTopic: paragraphs.length === 1,
    };
  }

  if (intents.asksFinancing) {
    facts.push({ field: 'payment', quote: text.trim().slice(0, 100) });
    const targetVehicle = selectedCards[0];
    let entrySimulationText = '';
    if (intents.entryCents && targetVehicle && intents.entryCents < targetVehicle.priceCents) {
      const entryBRL = intents.entryCents / 100;
      const balanceBRL = (targetVehicle.priceCents - intents.entryCents) / 100;
      entrySimulationText = `\n\n📊 **Pré-cálculo orientativo (${targetVehicle.title}):**\n• Valor do veículo: **${formatPrice(targetVehicle.priceBRL)}**\n• Entrada informada: **${formatPrice(entryBRL)}**\n• Saldo restante para financiar: **${formatPrice(balanceBRL)}** (simulável em 12x, 24x, 36x ou até 48x pelos bancos parceiros, sujeito à análise de crédito).`;
    } else if (intents.entryCents) {
      const entryBRL = intents.entryCents / 100;
      entrySimulationText = `\n\nCom uma entrada de **${formatPrice(entryBRL)}**, a aprovação pelos bancos parceiros fica ainda mais fácil e reduz bastante o valor das parcelas (em até 48x mediante análise de crédito).`;
    }
    paragraphs.push(
      `💳 **Sobre financiamento e parcelamento${namePlain}:**\nTrabalhamos com financiamentos pelos bancos parceiros (em até 48x) e parcelamento no cartão, sujeitos à análise de crédito de acordo com o seu perfil e valor de entrada, sem prometer aprovação prévia automática.${entrySimulationText}\n\nNosso consultor pode rodar sua simulação sem compromisso no WhatsApp **${STORE.phoneDisplay}**. Qual veículo você gostaria de simular?`,
    );
    handoffRequested = true;
    handoffReason = handoffReason ?? 'financing';
  }

  if (intents.asksHuman) {
    paragraphs.push(
      `Perfeito${nameGreeting}! Vou encaminhar seu atendimento para um vendedor da **${STORE.name}**. Você também pode chamar direto no nosso WhatsApp **${STORE.phoneDisplay}**.`,
    );
    handoffRequested = true;
    handoffReason = 'visitor_request';
    selectedCards = [];
  }

  const matched = paragraphs.length > 0;
  if (!matched) {
    return {
      matched: false,
      isInstitutionalOnly: false,
      text: '',
      cards: [],
      facts: [],
      handoffRequested: false,
      handoffReason: null,
      handoffUrl: null,
      checkedAt,
    };
  }

  const cards = selectedCards.map((c) => ({
    id: c.id,
    title: c.title,
    year: c.year,
    priceCents: c.priceCents,
    href: c.href,
  }));

  const summary = `Olá, vim pelo atendimento da Dayse no site da ${STORE.name}. ${SITE_URL}`;

  return {
    matched: true,
    isInstitutionalOnly: hasInstitutionalQuestion(text) && !hasCatalogIntent && !intents.asksTradeIn && !intents.asksFinancing,
    text: paragraphs.join('\n\n'),
    cards,
    facts,
    handoffRequested,
    handoffReason,
    handoffUrl: handoffRequested
      ? `https://wa.me/${STORE.whatsappNumber}?text=${encodeURIComponent(summary)}`
      : null,
    checkedAt,
    tradeIn: tradeInState,
  };
}
