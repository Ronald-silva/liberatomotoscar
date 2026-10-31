/**
 * Dados da loja usados por metadados, dados estruturados, contato e rodapé.
 * Origem: captura do perfil do Google enviada pelo usuário em 22/10/2026.
 * Redes sociais seguem sem confirmação e por isso não aparecem aqui. O horário de
 * funcionamento mora em `store-policy.ts`, junto dos outros fatos que o lojista
 * confirmou — este arquivo guarda identidade e endereço.
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
 * URL pública do site: base de `og:image`, canonical, dados estruturados e de todo link que a
 * Dayse envia ao cliente no WhatsApp.
 *
 * **Defina `NEXT_PUBLIC_SITE_URL` com o domínio da loja.** É a única fonte determinística: o
 * valor é inlinado no bundle durante o `next build`, então precisa existir no build, não só no
 * runtime. Sem ela o site cai no domínio da plataforma e, fora dela, em `localhost` — e um link
 * para localhost na mão do cliente é pior do que link nenhum.
 *
 * `RAILWAY_PUBLIC_DOMAIN` entra apenas como rede de segurança, via `env` do next.config (que
 * inlina no bundle): não é garantido que o Railway o popule na fase de build, e há relato de
 * valor obsoleto após troca de domínio. Não dependa dele.
 */
/**
 * Tira a barra final e espaços. Parte do código concatena (`${SITE_URL}/veiculos/...`), então uma
 * barra sobrando viraria `//veiculos/...` nos dados estruturados e no canonical — URL diferente
 * aos olhos do Google. Quem cadastra a variável no painel cola o que a plataforma mostra, com
 * barra, então a normalização fica aqui e não na instrução.
 */
function normalizarBase(valor: string): string | null {
  const limpo = valor.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(limpo)) return null;
  return limpo;
}

function resolverSiteUrl(): string {
  const explicita = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicita) {
    const base = normalizarBase(explicita);
    if (base) return base;
    if (typeof window === 'undefined') {
      console.error(
        `\n*** NEXT_PUBLIC_SITE_URL="${explicita}" não é uma URL absoluta válida.\n` +
        '    Use o formato https://dominio.com.br (sem barra no final). ***\n',
      );
    }
  }
  if (process.env.NEXT_PUBLIC_RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.NEXT_PUBLIC_RAILWAY_PUBLIC_DOMAIN.trim().replace(/\/+$/, '')}`;
  }
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;

  // Falha audível: foi o silêncio desse fallback que deixou links de localhost irem a produção.
  if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
    console.error(
      '\n*** NEXT_PUBLIC_SITE_URL não definida. O site vai gerar links para http://localhost:3000,\n' +
      '    incluindo os que a Dayse manda no WhatsApp. Defina a variável no painel do Railway\n' +
      '    com o domínio da loja e faça um novo deploy (o valor é inlinado no build). ***\n',
    );
  }
  return 'http://localhost:3000';
}

export const SITE_URL = resolverSiteUrl();
