import { SITE_URL } from '@/data/store';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export type SendWhatsAppTextParams = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
  previewUrl?: boolean;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
};

/** A Meta pode entregar o wa_id brasileiro sem o nono dígito, embora o número autorizado o inclua. */
export function normalizeWhatsAppRecipient(waId: string): string {
  const digits = waId.replace(/\D/g, '');
  // +55, DDD de 2 dígitos e celular antigo de 8 dígitos (iniciado em 6–9).
  if (/^55\d{2}[6-9]\d{7}$/.test(digits)) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  return digits;
}

/** Dispara mensagem de texto via Meta WhatsApp Cloud API usando as credenciais dinâmicas do tenant. */
export async function sendWhatsAppTextMessage(params: SendWhatsAppTextParams): Promise<{ messageId: string | null }> {
  const version = params.apiVersion ?? process.env.META_GRAPH_API_VERSION ?? 'v21.0';
  const fetchFn = params.fetchImpl ?? fetch;
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(params.phoneNumberId)}/messages`;

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'text',
      text: {
        preview_url: params.previewUrl ?? true,
        body: params.body.slice(0, 4096),
      },
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: { code?: number; error_subcode?: number };
    };
    const metaCode = Number.isInteger(data.error?.code) ? `, código Meta ${data.error?.code}` : '';
    const metaSubcode = Number.isInteger(data.error?.error_subcode) ? `, subcódigo ${data.error?.error_subcode}` : '';
    throw new Error(`Falha ao enviar mensagem WhatsApp (HTTP ${response.status}${metaCode}${metaSubcode}).`);
  }

  const data = (await response.json()) as { messages?: Array<{ id?: string }> };
  return { messageId: data.messages?.[0]?.id ?? null };
}

/**
 * Converte a marcação do chat do site para a do WhatsApp:
 * `**negrito**` (site) → `*negrito*` (WhatsApp), evitando asteriscos sobrando na tela do cliente.
 */
export function toWhatsAppMarkup(text: string): string {
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')
    .replace(/\*{2,}/g, '*')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Formata a resposta da Dayse + cartões de veículos publicados para leitura direta no WhatsApp. */
export function formatDayseWhatsAppReply(
  body: string,
  cards: Array<{ title: string; year: number | null; priceCents: number; href: string }>,
): string {
  const text = toWhatsAppMarkup(body);
  if (!cards.length) return text;
  const cardLines = cards.slice(0, 4).map((card) => {
    const fullUrl = new URL(card.href, SITE_URL).toString();
    // Quando a resposta já descreveu o anúncio, repetir preço e ano faz o cliente ler o mesmo
    // veículo duas vezes no WhatsApp. Nesse caso sobra só o link, que é o que falta no texto.
    if (text.includes(card.title)) return `• *${card.title}*: ${fullUrl}`;
    const yearLabel = card.year ? ` (${card.year})` : '';
    return `• *${card.title}*${yearLabel} — ${brl.format(card.priceCents / 100)}\n  Fotos e detalhes: ${fullUrl}`;
  });
  return `${text}\n\n${cardLines.join('\n\n')}`;
}

