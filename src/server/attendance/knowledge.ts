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
  const title = [item.brand, item.model, item.version].filter(Boolean).join(' ') || meta?.title || 'Veículo';
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
    /\b(tenho|possuo|meu|minha|dar|entregar|ofereco)\b/.test(before) &&
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
};

export function detectMessageIntents(text: string): DetectedIntents {
  const v = normalizePlain(text);

  const asksAddressOrLocation =
    /\b(endereco|onde fica|localiza\w*|bairro|cidade|cep|como chegar|mapa|maps|rua|elcias lopes|parangaba|fortaleza|loja fisica|ponto de referencia)\b/.test(
      v,
    );

  const asksPhoneOrWhatsapp =
    /\b(telefone|whatsapp|zap|wpp|numero|contato|ligar|celular)\b/.test(v);

  const asksHoursOrVisit =
    /\b(horario\w*|funciona\w*|abre|abrem|aberto|aberta|fecha\w*|sabado|domingo|feriado|visita\w*|ir na loja|ir ai|conhecer a loja)\b/.test(
      v,
    );

  const asksAboutStoreOrTrust =
    /\b(quem e voce|quem fala|dayse|sobre a loja|liberato motos|avaliac\w*|estrelas|google|confiavel|seguro|garantia|procedencia|historia)\b/.test(
      v,
    );

  const asksToSellVehicle =
    /\b(quero vender|vender minha moto|vender meu carro|voces compram|loja compra|compram moto|compram carro|vender meu veiculo)\b/.test(
      v,
    );

  const asksTradeIn =
    /\b(troca|trocar|dar na troca|aceita\w* troca|aceita\w* moto|aceita\w* carro|meu carro na troca|minha moto na troca|veiculo na troca|como entrada)\b/.test(
      v,
    );

  const asksFinancing =
    /\b(financ\w*|parcel\w*|credito|simulac\w*|banco|cartao|sem entrada|dar entrada|prestac\w*)\b/.test(
      v,
    );

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

  const asksSpecificAttribute = {
    mileage: /\b(km|quilometragem|rodad\w*|quantos km)\b/.test(v),
    color: /\b(cor|cores|branc\w*|pret\w*|vermelh\w*|cinza|prata|azul)\b/.test(v),
    year: /\b(qual o ano|que ano|ano dela|ano dele|ano da|ano do)\b/.test(v),
    price: /\b(quanto custa|qual o preco|qual o valor|quanto ta|quanto esta|valor da|valor do|preco da|preco do)\b/.test(v),
    engineOrSpecs: /\b(motor\w*|potencia|cavalo\w*|cv|cambio|marcha\w*|combustivel|flex|cacamba|ficha tecnica|especificac\w*)\b/.test(v),
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
    asksSpecificAttribute,
    wantsMoto,
    wantsCar,
    budget,
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
    intents.asksGreetingOnly ||
    intents.asksAllInventory ||
    intents.asksCheapest ||
    intents.asksMostExpensive ||
    intents.asksLowestKm ||
    intents.asksNewest ||
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
    const modelNorm = normalizePlain(item.model);
    const brandNorm = normalizePlain(item.brand);
    if (
      (modelNorm && new RegExp(`\\b${modelNorm}\\b`).test(v)) ||
      (brandNorm && new RegExp(`\\b${brandNorm}\\b`).test(v))
    ) {
      return true;
    }
  }
  for (const brand of KNOWN_BRANDS) {
    if (brand.aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(v))) return true;
  }
  for (const unlisted of KNOWN_UNLISTED_MODELS) {
    if (new RegExp(`\\b${unlisted}\\b`).test(v)) return true;
  }

  return false;
}

/** Verifica se a mensagem pergunta sobre dados institucionais da loja (endereço, telefone, horário, avaliação, venda). */
export function hasInstitutionalQuestion(text: string): boolean {
  const intents = detectMessageIntents(text);
  return (
    intents.asksAddressOrLocation ||
    intents.asksPhoneOrWhatsapp ||
    intents.asksHoursOrVisit ||
    intents.asksAboutStoreOrTrust ||
    intents.asksToSellVehicle ||
    intents.asksGreetingOnly
  );
}

/**
 * Motor principal de conhecimento da Dayse:
 * Responde com precisão sobre toda a base da plataforma (endereço, bairro, CEP, Google Maps,
 * telefone/WhatsApp, avaliação no Google, horário, compra, venda, troca, financiamento)
 * e cruza em tempo real com os veículos publicados no catálogo.
 */
export async function answerFromPlatformKnowledge(
  text: string,
  searchFn: typeof searchAvailableVehicles = searchAvailableVehicles,
  context?: { recentModelOrTitle?: string | null },
): Promise<KnowledgeReply> {
  const v = normalizePlain(text);
  const intents = detectMessageIntents(text);
  const { items: catalog, checkedAt } = await loadFullPublishedCatalog(searchFn);

  const paragraphs: string[] = [];
  const facts: LeadFact[] = [];
  let handoffRequested = false;
  let handoffReason: HandoffReason | null = null;

  // 1. Saudação pura
  if (intents.asksGreetingOnly) {
    const motosCount = catalog.filter((i) => i.type === 'motorcycle').length;
    const carsCount = catalog.filter((i) => i.type === 'car').length;
    const stockSummary =
      catalog.length > 0
        ? `Hoje temos **${catalog.length} veículos publicados** na vitrine (${motosCount} motos e ${carsCount} carros).`
        : 'Estou pronta para consultar nosso estoque em tempo real.';
    return {
      matched: true,
      isInstitutionalOnly: true,
      text: `Olá! Tudo ótimo por aqui! Eu sou a **Dayse**, consultora virtual da **${STORE.name}** na ${STORE.district} (${STORE.city}/${STORE.state}). ${stockSummary}\n\nPosso te informar nosso endereço, WhatsApp, detalhes de qualquer moto ou carro do catálogo, faixa de preço ou condições de troca e financiamento. Como posso te ajudar hoje?`,
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
      `🕒 **Visitas e horário de atendimento:**\nAtendemos presencialmente na nossa loja na **${STORE_ADDRESS_LINE}**. Como os horários em finais de semana ou feriados podem variar, recomendamos confirmar o horário de hoje ou agendar sua visita pelo WhatsApp **${STORE.phoneDisplay}**.`,
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

  // 3. Análise de busca no catálogo (modelos, marcas, categorias, orçamento, ordenação)
  let matchedModels = catalog.filter((item) => {
    const modelNorm = normalizePlain(item.model ?? '');
    const versionNorm = normalizePlain(item.version ?? '');
    const slugNorm = normalizePlain(item.slug.replace(/-/g, ' '));
    if (!modelNorm) return false;
    const mentionedModel =
      new RegExp(`\\b${modelNorm}\\b`).test(v) ||
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

  if (
    matchedModels.length === 0 &&
    asksAnySpecificAttr &&
    context?.recentModelOrTitle &&
    !intents.wantsMoto &&
    !intents.wantsCar
  ) {
    const recentNorm = normalizePlain(context.recentModelOrTitle);
    matchedModels = catalog.filter((item) => {
      const modelNorm = normalizePlain(item.model ?? '');
      const titleNorm = normalizePlain(item.title);
      return (modelNorm && recentNorm.includes(modelNorm)) || titleNorm.includes(recentNorm);
    });
  }

  const requestedBrand = KNOWN_BRANDS.find((b) =>
    b.aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(v) && !isMentionedOnlyAsTradeIn(alias, v)),
  );

  const requestedUnlistedModel = KNOWN_UNLISTED_MODELS.find(
    (model) => new RegExp(`\\b${model}\\b`).test(v) && !isMentionedOnlyAsTradeIn(model, v),
  );

  if (matchedModels.length > 0 && matchedModels[0]?.model) {
    facts.push({ field: 'model', quote: matchedModels[0].model });
  } else if (requestedUnlistedModel) {
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

  if (/\b(trabalh\w*|entreg\w*|app|uber|99|motoboy|frete|carga|transporte|dia a dia|rodar)\b/.test(v)) {
    facts.push({ field: 'purpose', quote: 'uso profissional / rotina' });
  }

  const hasCatalogIntent =
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
    intents.asksSpecificAttribute.mileage ||
    intents.asksSpecificAttribute.color ||
    intents.asksSpecificAttribute.year ||
    intents.asksSpecificAttribute.price ||
    intents.asksSpecificAttribute.engineOrSpecs;

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
        paragraphs.push(`${prefix}\n${detailsLines.join('\n')}`);
      } else {
        paragraphs.push(
          `Encontrei estes modelos no catálogo da **${STORE.name}**:\n${detailsLines.join('\n')}`,
        );
      }
    } else {
      // Filtragem geral do catálogo
      let filtered = [...catalog];

      if (intents.wantsMoto && !intents.wantsCar) {
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
    facts.push({ field: 'trade_in', quote: text.trim().slice(0, 100) });
    paragraphs.push(
      `🔄 **Sobre veículo na troca:**\nA **${STORE.name}** aceita sua moto ou carro usado como parte do pagamento! Nossa equipe avalia os dados e o estado do seu veículo presencialmente na loja (${STORE_STREET_ADDRESS}, ${STORE.district}) ou adianta a pré-avaliação pelo WhatsApp **${STORE.phoneDisplay}**.`,
    );
    handoffRequested = true;
    handoffReason = 'trade_in';
  }

  if (intents.asksFinancing) {
    facts.push({ field: 'payment', quote: text.trim().slice(0, 100) });
    paragraphs.push(
      `💳 **Sobre financiamento e pagamento:**\nTrabalhamos com opções de financiamento e parcelamento sujeitas à análise de crédito de acordo com o seu perfil e valor de entrada, sem prometer aprovação prévia automática. Nosso vendedor pode simular as parcelas para você no WhatsApp **${STORE.phoneDisplay}**.`,
    );
    handoffRequested = true;
    handoffReason = handoffReason ?? 'financing';
  }

  if (intents.asksHuman) {
    paragraphs.push(
      `Perfeito! Vou encaminhar seu atendimento para um vendedor da **${STORE.name}**. Você também pode chamar direto no nosso WhatsApp **${STORE.phoneDisplay}**.`,
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
  };
}
