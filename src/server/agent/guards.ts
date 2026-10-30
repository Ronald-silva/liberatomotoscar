import { brandsFor } from '@/data/catalogo-marcas-modelos';
import { MAP_URL, SITE_URL, STORE, STORE_ADDRESS_LINE, STORE_STREET_ADDRESS } from '@/data/store';
import { semAcento, type AgentTurnState, type VerifiedVehicle } from './tools';

/**
 * Guardas de saída. Porte de `936d029:src/server/attendance/trade-in-phrasing.ts`, com uma
 * diferença deliberada: aquela versão bloqueava qualquer `R$`, e com isso o agente nunca dava
 * preço. Aqui o preço passa quando confere com o que a ferramenta devolveu — o mystery shop de
 * 100 concessionárias mostrou que só 33 dão o preço final, então dar preço verificado é o
 * diferencial, não o risco. O risco é dar preço *inventado*, e é isso que a guarda mede.
 */
export type GuardViolation =
  | 'resposta_truncada'
  | 'tamanho_invalido'
  | 'promessa_nao_autorizada'
  | 'valor_nao_verificado'
  | 'veiculo_nao_verificado'
  | 'link_nao_autorizado'
  | 'telefone_nao_autorizado';

export type GuardVerdict =
  | { ok: true }
  | { ok: false; violation: GuardViolation; detail: string };

const MIN_CARACTERES = 2;
/** Uma mensagem de WhatsApp que não cabe numa tela não é lida; 2–3 frases é a política. */
const MAX_CARACTERES = 700;

function apenasDigitos(valor: string) {
  return valor.replace(/\D/g, '');
}

/**
 * Textos da loja que o servidor publica e por isso são permitidos na íntegra. São removidos
 * antes das checagens de link, telefone e número: o MAP_URL carrega CEP e escapes `%2C`, que
 * de outro modo pareceriam valor inventado e percentual.
 */
const TRECHOS_DA_LOJA = [
  MAP_URL, SITE_URL, STORE_ADDRESS_LINE, STORE_STREET_ADDRESS, STORE.street,
  STORE.phoneDisplay, STORE.phoneE164, STORE.whatsappNumber, STORE.postalCode,
];

function removerTrechosDaLoja(texto: string) {
  let restante = texto;
  for (const trecho of TRECHOS_DA_LOJA) restante = restante.split(trecho).join(' ');
  return restante;
}

/** Números que a resposta pode citar: ano de modelo e o que veio de ferramenta. */
function numerosPermitidos(veiculos: Iterable<VerifiedVehicle>): Set<string> {
  const permitidos = new Set<string>();
  for (const veiculo of veiculos) {
    if (veiculo.ano !== null) permitidos.add(String(veiculo.ano));
    if (veiculo.quilometragem !== null) permitidos.add(String(veiculo.quilometragem));
    permitidos.add(String(veiculo.precoCentavos));
    permitidos.add(String(Math.round(veiculo.precoCentavos / 100)));
    // "CG 160", "Fazer 250": o número faz parte do nome e aparece em toda frase útil.
    for (const bruto of `${veiculo.titulo} ${veiculo.modelo}`.match(/\d+/g) ?? []) permitidos.add(bruto);
  }
  return permitidos;
}

/** Marcas que a loja pode vender. Citar uma que não veio da busca é inventar estoque. */
const MARCAS_CONHECIDAS = [...new Set([...brandsFor('motorcycle'), ...brandsFor('car')])]
  .filter((marca) => marca.toLowerCase() !== 'outra')
  .map((marca) => ({ marca, normalizada: semAcento(marca) }));

export type GuardInput = {
  text: string;
  finishReason: string;
  state: AgentTurnState;
  conversationId?: string;
};

function avaliar({ text, finishReason, state }: GuardInput): GuardVerdict {
  const texto = text.trim();

  // 3.4 — 'length' significa que o provedor cortou no limite de tokens. Só 'stop' é frase inteira.
  if (finishReason !== 'stop') {
    return { ok: false, violation: 'resposta_truncada', detail: `finishReason=${finishReason}` };
  }
  if (texto.length < MIN_CARACTERES) {
    return { ok: false, violation: 'tamanho_invalido', detail: 'resposta vazia' };
  }
  if (texto.length > MAX_CARACTERES) {
    return { ok: false, violation: 'tamanho_invalido', detail: `${texto.length} caracteres` };
  }
  // Segunda linha de defesa do truncamento: frase que acaba sem pontuação ficou pela metade.
  // Terminar no link do mapa ou no telefone da loja é mensagem inteira, não frase cortada —
  // uma URL acaba em dígito e cairia nesta regra.
  const terminaEmDadoDaLoja = TRECHOS_DA_LOJA.some((trecho) => texto.endsWith(trecho));
  if (!terminaEmDadoDaLoja && !/[.!?…)\]}"'*\p{Extended_Pictographic}]$/u.test(texto)) {
    return { ok: false, violation: 'resposta_truncada', detail: 'frase sem pontuação final' };
  }

  // Os trechos da loja saem antes das checagens de conteúdo: o MAP_URL carrega CEP e escapes
  // `%2C`, que de outro modo pareceriam valor inventado e percentual de desconto.
  const restante = removerTrechosDaLoja(texto);
  const plano = semAcento(restante);

  // 3.2 — promessa, estimativa de valor e desconto. O escopo decidido na Fase 0 é qualificar e
  // encaminhar: o agente não negocia e não avalia. Quem avalia é a loja, presencialmente.
  const promessas: [RegExp, string][] = [
    [/aprovad[oa]/, 'promete aprovação'],
    [/garantid[oa]|\bgaranto\b|\bgarantir\b|\bgarantimos\b/, 'promete garantia de resultado'],
    [/com certeza aceit/, 'promete aceite'],
    [/\bvale\b|\bvaleria\b|\bvalem\b/, 'estima valor do veículo do cliente'],
    [/avalio em|\bpago\b|\bpagamos\b|\bpagaria\b/, 'oferece pagamento'],
    [/\bdesconto\b|\babatimento\b|\bpercentual\b|%/, 'negocia desconto, fora do escopo'],
    [/(?:avali\w*|analis\w*)[^.]{0,45}(?:por foto|pelas foto|por mensagem|por whats|a distancia|remotament|online|sem precisar (?:ir|passar|vir))/,
      'promete avaliação à distância'],
  ];
  for (const [padrao, motivo] of promessas) {
    if (padrao.test(plano)) return { ok: false, violation: 'promessa_nao_autorizada', detail: motivo };
  }
  // Pode falar de troca, desde que condicione à avaliação.
  if (/aceit\w*/.test(plano) && !/avali\w*/.test(plano)) {
    return { ok: false, violation: 'promessa_nao_autorizada', detail: 'fala de aceite sem condicionar à avaliação' };
  }

  // 3.3 — veículo e id que não vieram de ferramenta.
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(texto)) {
    return { ok: false, violation: 'veiculo_nao_verificado', detail: 'id de veículo exposto na resposta' };
  }
  const marcasVerificadas = new Set([
    ...[...state.allowedVehicles.values()].map((veiculo) => semAcento(veiculo.marca)),
    ...state.searchedBrands,
  ]);
  const marcaInventada = MARCAS_CONHECIDAS.find(({ normalizada }) =>
    new RegExp(`\\b${normalizada.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\b`).test(plano)
    && !marcasVerificadas.has(normalizada));
  if (marcaInventada) {
    return { ok: false, violation: 'veiculo_nao_verificado',
      detail: `cita ${marcaInventada.marca} sem ter vindo de buscar_veiculos` };
  }

  // 3.5 — link e telefone fora dos dados da loja.
  if (/https?:\/\/|www\.|@/.test(restante)) {
    return { ok: false, violation: 'link_nao_autorizado', detail: 'link ou e-mail fora dos dados da loja' };
  }
  if (/\(?\d{2}\)?\s*9?\d{4}[-\s.]?\d{4}/.test(restante)) {
    return { ok: false, violation: 'telefone_nao_autorizado', detail: 'telefone que não é o da loja' };
  }

  // 3.1 — valor que nenhuma ferramenta devolveu. Ano de modelo passa sempre: numa loja de
  // seminovos toda frase útil cita ano, e bloqueá-lo descartava a resposta natural inteira.
  const permitidos = numerosPermitidos(state.allowedVehicles.values());
  const naoVerificado = (restante.match(/\d[\d.,]*/g) ?? [])
    .map(apenasDigitos)
    .filter(Boolean)
    .find((digitos) => {
      if (permitidos.has(digitos)) return false;
      const numero = Number(digitos);
      return !(digitos.length === 4 && numero >= 1900 && numero <= 2099);
    });
  if (naoVerificado !== undefined) {
    return { ok: false, violation: 'valor_nao_verificado',
      detail: `número ${naoVerificado} não veio de nenhuma ferramenta` };
  }

  return { ok: true };
}

/**
 * 3.6 — toda rejeição vira uma linha de log estruturada com a saída original. É a fonte da
 * métrica 6.5 (taxa de guarda reprovada) e o que permite virar caso de eval depois.
 */
export function checkAgentReply(input: GuardInput): GuardVerdict {
  const veredito = avaliar(input);
  if (!veredito.ok) {
    console.warn('[agente] guarda reprovada', JSON.stringify({
      evento: 'guarda_reprovada',
      violacao: veredito.violation,
      detalhe: veredito.detail,
      conversationId: input.conversationId ?? null,
      finishReason: input.finishReason,
      saidaOriginal: input.text,
      veiculosVerificados: [...input.state.allowedVehicles.keys()],
      em: new Date().toISOString(),
    }));
  }
  return veredito;
}
