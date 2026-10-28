import { SITE_URL, STORE } from '@/data/store';
import { searchAvailableVehicles } from '@/server/vehicles/agent-catalog';
import { detectMessageIntents } from './knowledge';

export type DeterministicChoice = 'motorcycles' | 'cars' | 'financing' | 'trade_in' | 'human';
export const deterministicChoices: { id: DeterministicChoice; label: string }[] = [
  { id: 'motorcycles', label: 'Ver motos' },
  { id: 'cars', label: 'Ver carros' },
  { id: 'financing', label: 'Financiamento' },
  { id: 'trade_in', label: 'Tenho veículo na troca' },
  { id: 'human', label: 'Falar com vendedor' },
];

type SearchCatalog = typeof searchAvailableVehicles;

export const deterministicMenuText = 'Olá! Eu sou a Dayse, consultora virtual da Liberato Motos Car. Posso mostrar motos ou carros publicados no estoque agora, orientar sobre financiamento e troca ou chamar nossa equipe. Escolha uma opção abaixo ou digite o que procura.';

export const handoffReasonByChoice = {
  financing: 'financing', trade_in: 'trade_in', human: 'visitor_request',
} as const satisfies Partial<Record<DeterministicChoice, string>>;

function plain(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

/**
 * Texto livre no modo chatbot: palavras-chave simples, nunca modelo de IA.
 * Pedido de pessoa vence qualquer outra intenção; sem correspondência, volta ao menu.
 */
export function routeDeterministicText(text: string): DeterministicChoice | null {
  const value = plain(text);
  if (/\b(vendedor|vendedora|atendente|humano|pessoa|alguem)\b/.test(value)) return 'human';
  const intents = detectMessageIntents(text);
  if (intents.asksTradeIn) return 'trade_in';
  if (intents.asksFinancing) return 'financing';
  const wantsMoto = /\b(moto|motos|motocicleta\w*)\b/.test(value);
  const wantsCar = /\b(carro|carros|automove\w*)\b/.test(value);
  if (wantsMoto && !wantsCar) return 'motorcycles';
  if (wantsCar && !wantsMoto) return 'cars';
  return null;
}

export async function deterministicAnswer(choice: DeterministicChoice,
  searchCatalog: SearchCatalog = searchAvailableVehicles) {
  if (choice === 'motorcycles' || choice === 'cars') {
    const { items, checkedAt } = await searchCatalog({
      type: choice === 'motorcycles' ? 'motorcycle' : 'car', limit: 3,
    });
    const cards = items.flatMap((item) => item.brand && item.model && item.priceCents ? [{
      id: item.id,
      title: [item.brand, item.model, item.version].filter(Boolean).join(' '),
      year: item.year,
      priceCents: item.priceCents,
      href: `/veiculos/${item.slug}`,
    }] : []);
    return { text: cards.length
      ? 'Encontrei estes anúncios publicados. Confira os detalhes e confirme a disponibilidade com a loja.'
      : 'Não encontrei anúncios publicados nessa categoria agora. Você pode falar com um vendedor.',
    cards, checkedAt, handoffRequested: false, handoffUrl: null };
  }

  const text = choice === 'financing'
    ? 'Condições de financiamento dependem de análise. Um vendedor pode orientar você sem prometer aprovação.'
    : choice === 'trade_in'
      ? 'A loja pode avaliar seu veículo na troca. Um vendedor confere os dados e as condições.'
      : 'Vou encaminhar você para conversar com um vendedor.';
  const summary = `Olá, vim pelo atendimento do site da Liberato Motos Car. Assunto: ${
    deterministicChoices.find((item) => item.id === choice)?.label ?? 'Atendimento'}. ${SITE_URL}`;
  return { text, cards: [] as { id: string; title: string; year: number | null;
    priceCents: number; href: string }[], checkedAt: new Date().toISOString(),
  handoffRequested: true, handoffUrl: `https://wa.me/${STORE.whatsappNumber}?text=${encodeURIComponent(summary)}` };
}
