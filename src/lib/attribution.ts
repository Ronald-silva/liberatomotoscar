import { STORE } from '@/data/store';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;
const STORAGE_KEY = 'liberato_campaign_attribution';

export type UtmKey = (typeof UTM_KEYS)[number];
export type Attribution = Partial<Record<UtmKey, string>>;

function sanitize(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._\-]/gu, '')
    .trim()
    .slice(0, 80);
}

export function readAttributionFromSearch(search: string): Attribution {
  const params = new URLSearchParams(search);
  const attribution: Attribution = {};

  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (!value) continue;
    const safeValue = sanitize(value);
    if (safeValue) attribution[key] = safeValue;
  }

  return attribution;
}

export function getCampaignAttribution(): Attribution {
  if (typeof window === 'undefined') return {};

  const current = readAttributionFromSearch(window.location.search);
  const stored: Attribution = {};

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const key of UTM_KEYS) {
          const value = (parsed as Record<string, unknown>)[key];
          if (typeof value === 'string') {
            const safeValue = sanitize(value);
            if (safeValue) stored[key] = safeValue;
          }
        }
      }
    }
  } catch {
    // A navegação e o contato continuam funcionando sem armazenamento local.
  }

  const hasCurrentCampaign = Object.keys(current).length > 0;
  const attribution = hasCurrentCampaign ? current : stored;
  if (hasCurrentCampaign) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
    } catch {
      // Armazenamento bloqueado pelo navegador não impede o contato.
    }
  }

  return attribution;
}

export function buildWhatsAppUrl(
  subject: string,
  attribution: Attribution = {},
): string {
  const lines = [
    `Olá! Vim pelo site da Liberato Motos Car e quero saber mais sobre ${subject}.`,
  ];
  const campaign = UTM_KEYS.flatMap((key) =>
    attribution[key] ? [`${key}=${attribution[key]}`] : [],
  );

  if (campaign.length > 0) lines.push(`Origem da campanha: ${campaign.join('; ')}`);

  return `https://wa.me/${STORE.whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
}
