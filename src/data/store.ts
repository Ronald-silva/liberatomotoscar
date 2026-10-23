/**
 * Dados da loja usados por metadados, dados estruturados, contato e rodapé.
 * Origem: captura do perfil do Google enviada pelo usuário em 22/10/2026.
 * Horário de funcionamento e redes sociais seguem sem confirmação e por isso
 * não aparecem aqui nem nos dados estruturados.
 */
export const STORE = {
  name: 'Liberato Motos Car',
  tagline: 'Compra, venda e troca',
  street: 'R. Elcias Lopes, 334',
  unit: 'loja A',
  /** O Google resolve a rua e o CEP 60421-100 como Parangaba. */
  district: 'Parangaba',
  city: 'Fortaleza',
  state: 'CE',
  postalCode: '60421-100',
  country: 'BR',
  /** Formato E.164, usado em links wa.me e dados estruturados. */
  phoneE164: '+5585996365664',
  phoneDisplay: '(85) 99636-5664',
  /** Número sem sinais, aceito pelo wa.me. */
  whatsappNumber: '5585996365664',
} as const;

export const STORE_STREET_ADDRESS = `${STORE.street}, ${STORE.unit}`;

export const STORE_ADDRESS_LINE = `${STORE_STREET_ADDRESS} — ${STORE.district}, ${STORE.city}/${STORE.state}`;

/**
 * Consulta enxuta para o Maps. Incluir "loja A" e o bairro fazia o serviço
 * interpretar dois endereços e desenhar uma rota em vez de marcar o ponto.
 */
export const MAP_QUERY = `${STORE.street} - ${STORE.city} - ${STORE.state}, ${STORE.postalCode}`;

export const MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MAP_QUERY)}`;

export const MAP_EMBED_URL = `https://maps.google.com/maps?q=${encodeURIComponent(MAP_QUERY)}&z=16&output=embed`;

/**
 * Avaliação lida no perfil do Google em 22/10/2026. A quantidade é pequena e
 * muda com o tempo: exibir sempre junto do total e reconferir antes de publicar.
 * Não é replicada em `aggregateRating` nos dados estruturados, porque marcar
 * avaliações de outra plataforma como próprias contraria as diretrizes do Google.
 */
export const GOOGLE_PROFILE = {
  rating: '5,0',
  reviewCount: 2,
  url: MAP_URL,
  checkedAt: '2026-10-22',
} as const;

/**
 * URL pública do site, base de `og:image`, canonical e dados estruturados.
 *
 * Em produção, defina `NEXT_PUBLIC_SITE_URL` com o domínio aprovado pela loja.
 * Sem ela, cada deploy de pré-visualização na Vercel se resolve pela própria
 * URL gerada — o que mantém a imagem do WhatsApp funcionando sem configuração.
 * O valor local é o último recurso, para desenvolvimento.
 */
function resolverSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  return 'http://localhost:3000';
}

export const SITE_URL = resolverSiteUrl();
