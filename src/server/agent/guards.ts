import { MAP_URL, SITE_URL, STORE, STORE_ADDRESS_LINE, STORE_STREET_ADDRESS } from '@/data/store';
import { semAcento, veiculosCitaveis, type AgentTurnState, type VerifiedVehicle } from './tools';

/**
 * Guardas de saída. Porte de `936d029:src/server/attendance/trade-in-phrasing.ts`, com duas
 * inversões deliberadas.
 *
 * A primeira: aquela versão bloqueava qualquer `R$`, e com isso o agente nunca dava preço. Aqui
 * o preço passa quando confere com o que a ferramenta devolveu — o mystery shop de 100
 * concessionárias mostrou que só 33 dão o preço final.
 *
 * A segunda veio de uma revisão que executou a guarda e achou os buracos: a verificação de
 * número era um conjunto PLANO de dígitos, então o preço de um veículo cobria outro, qualquer
 * número entre 1900 e 2099 passava como "ano", e dígitos digitados no campo versão do painel
 * entravam na lista de permitidos. Agora a verificação é por contexto (o número é dinheiro?) e
 * por veículo (de qual veículo esta frase fala?).
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
const MAX_CARACTERES = 900;

function apenasDigitos(valor: string) {
  return valor.replace(/\D/g, '');
}

/**
 * Textos da loja que o servidor publica e por isso são permitidos na íntegra. Saem antes das
 * checagens de link, telefone e número: o MAP_URL carrega CEP e escapes `%2C`, que de outro
 * modo pareceriam valor inventado e percentual.
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

/** Marcadores que tornam um número da frase um VALOR, e não uma quantidade ou um ano. */
// `r\$` fica fora do \b: `$` não é caractere de palavra, então `\br\$\b` nunca casa com "R$ 2.000".
const MARCADOR_DE_DINHEIRO = /r\$|\b(reais|real|mil|conto|valor|preco|custa|sai por|fica em|fica por|faco por|entrada|parcela|financiament|a vista|desconto)\b/;

/**
 * Um número é VALOR pelo que está colado nele, não por a frase mencionar preço em algum lugar.
 * Tratar a frase inteira como contexto de dinheiro reprovava "tenho 3 agora: a Yamaha Fazer por
 * R$ 10.500,00" — a listagem correta do estoque — porque o "3" virava um preço a conferir.
 */
const GOVERNA_VALOR = /(r\$|fica em|fica por|sai por|sai a|custa|custam|custando|entrada de|parcela de|parcelas de|valor de|por apenas|a vista por|desconto de)\s*$/;
// "mil" só é dinheiro quando não vem seguido de unidade: "40 mil km" é distância, não preço.
const SEGUE_VALOR = /^\s*(reais|real|conto|pila)\b|^\s*mil\b(?!\s*(km|quilometr\w*|kilometr\w*))/;

function ehDinheiro(frase: string, inicio: number, fim: number) {
  return GOVERNA_VALOR.test(frase.slice(Math.max(0, inicio - 20), inicio))
    || SEGUE_VALOR.test(frase.slice(fim, fim + 10));
}

/** Valor escrito por extenso. Não há como verificar, então em contexto de dinheiro é recusa. */
const NUMERO_POR_EXTENSO = /\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)\b[^.]{0,20}\b(mil|milhao|milhoes)\b/;

/**
 * Divide em frases exigindo espaço depois da pontuação. Sem essa exigência, "R$ 2.000" virava
 * duas frases no ponto do milhar, e o valor inventado escapava partido em "2" e "000".
 */
function frasesDe(texto: string): string[] {
  return texto.split(/(?<=[.!?…])\s+|\n+/).filter((f) => f.trim());
}

/** Números que fazem parte do NOME de um veículo verificado ("CG 160", "Fazer 250"). */
function digitosDeNome(veiculos: Iterable<VerifiedVehicle>): Set<string> {
  const nomes = new Set<string>();
  for (const veiculo of veiculos) {
    // Só `modelo`: `titulo` inclui `version`, que é texto livre do painel. Dígito digitado ali
    // virava número permitido para a resposta inteira — era o furo que a revisão demonstrou.
    for (const bruto of (veiculo.modelo.match(/\d+/g) ?? [])) nomes.add(bruto);
  }
  return nomes;
}

function precosDe(veiculos: Iterable<VerifiedVehicle>): Set<string> {
  const precos = new Set<string>();
  for (const v of veiculos) {
    precos.add(String(v.precoCentavos));
    precos.add(String(Math.round(v.precoCentavos / 100)));
  }
  return precos;
}

function outrosNumerosDe(veiculos: Iterable<VerifiedVehicle>): Set<string> {
  const numeros = new Set<string>();
  for (const v of veiculos) {
    if (v.ano !== null) numeros.add(String(v.ano));
    if (v.quilometragem !== null) numeros.add(String(v.quilometragem));
  }
  return numeros;
}

/** Veículos do estado citados nesta frase, para o valor ser conferido contra o veículo certo. */
function veiculosCitadosEm(frase: string, state: AgentTurnState): VerifiedVehicle[] {
  return veiculosCitaveis(state)
    .filter((v) => frase.includes(semAcento(v.modelo)) || frase.includes(semAcento(v.titulo)));
}

export type GuardInput = {
  text: string;
  finishReason: string;
  state: AgentTurnState;
  conversationId?: string;
  /**
   * O que o cliente escreveu neste turno. Repetir de volta um número que ele mesmo deu —
   * "anotei sua Fan 2015 com 40.000 km" — não é inventar dado; é confirmar que anotou, que a
   * política pede. Sem isto, coletar os dados da troca era impossível sem cair na guarda.
   */
  customerText?: string;
};

function avaliar({ text, finishReason, state, customerText }: GuardInput): GuardVerdict {
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
  // Terminar no link do mapa ou no telefone da loja é mensagem inteira, não frase cortada —
  // uma URL acaba em dígito e cairia nesta regra.
  const terminaEmDadoDaLoja = TRECHOS_DA_LOJA.some((trecho) => texto.endsWith(trecho));
  if (!terminaEmDadoDaLoja && !/[.!?…)\]}"'*\p{Extended_Pictographic}]$/u.test(texto)) {
    return { ok: false, violation: 'resposta_truncada', detail: 'frase sem pontuação final' };
  }

  const restante = removerTrechosDaLoja(texto);
  const plano = semAcento(restante);

  // A verificação SEMÂNTICA — promessa, negociação, aceite, afirmação de estoque — saiu daqui
  // para `judge.ts`, decidida por modelo. Eram ~200 linhas de regex classificando português, o
  // mesmo mecanismo que derrubou a versão anterior, movido da entrada para a saída. Medido numa
  // conversa real de troca: 41% de falso positivo, incluindo a recusa CORRETA "o valor da sua
  // Titan só sai na avaliação presencial", bloqueada por "cita valor para o veículo do cliente".
  //
  // O que fica aqui é conferência de FATO, não de sentido: id exposto, link e telefone de
  // terceiro, e número que nenhuma ferramenta devolveu. Determinístico, e nunca produziu falso
  // positivo.
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(texto)) {
    return { ok: false, violation: 'veiculo_nao_verificado', detail: 'id de veículo exposto na resposta' };
  }

  // ---- 3.5 link e telefone fora dos dados da loja ----
  if (/https?:\/\/|www\.|@/.test(restante)
    || /\b[a-z0-9][a-z0-9-]*\.(com|com\.br|net|br|org|io|me|ly|app|site|shop|xyz|link)\b/i.test(restante)) {
    return { ok: false, violation: 'link_nao_autorizado', detail: 'link ou e-mail fora dos dados da loja' };
  }
  if (/\(?\d{2}\)?\s*9?\s*\d{4}[-\s.]?\d{4}\b/.test(restante)) {
    return { ok: false, violation: 'telefone_nao_autorizado', detail: 'telefone que não é o da loja' };
  }

  // ---- 3.1 valor que nenhuma ferramenta devolveu ----
  const nomes = digitosDeNome(veiculosCitaveis(state));
  /**
   * Números que o cliente escreveu, incluindo a forma por extenso. Quem escreve "40 mil km"
   * espera ouvir "40.000 km" de volta; sem expandir, a confirmação do dado dele era recusada
   * como número inventado.
   */
  const ditosPeloCliente = new Set<string>();
  for (const bruto of customerText?.match(/\d[\d.,]*/g) ?? []) {
    const digitos = apenasDigitos(bruto);
    if (digitos) ditosPeloCliente.add(digitos);
  }
  for (const [, numero] of (customerText ?? '').matchAll(/(\d[\d.,]*)\s*mil\b/gi)) {
    const base = Number(apenasDigitos(numero));
    if (Number.isSafeInteger(base) && base > 0) ditosPeloCliente.add(String(base * 1000));
  }
  for (const frase of frasesDe(plano)) {
    const temMarcadorDeDinheiro = MARCADOR_DE_DINHEIRO.test(frase);
    const citados = veiculosCitadosEm(frase, state);
    // Quando a frase fala de UM veículo, o valor tem de ser o dele. Era aqui que o preço de um
    // veículo cobria outro: "A Fazer sai por R$ 12.500" com o 12.500 sendo da CG.
    const escopo = citados.length === 1 ? citados : veiculosCitaveis(state);
    const precos = precosDe(escopo);
    const outros = outrosNumerosDe(escopo);

    const porExtensoEmKm = /\b(mil|milhao|milhoes)\b\s*(km|quilometr\w*|kilometr\w*)/.test(frase);
    if (temMarcadorDeDinheiro && !porExtensoEmKm && NUMERO_POR_EXTENSO.test(frase)) {
      return { ok: false, violation: 'valor_nao_verificado',
        detail: 'valor por extenso, que nenhuma ferramenta pode confirmar' };
    }
    // "é o valor da sua moto?" é julgamento, não conferência de fato: foi esta regra que
    // bloqueou a recusa correta "o valor da sua Titan só sai na avaliação presencial". Quem
    // decide isso agora é o juiz.

    for (const achado of frase.matchAll(/\d[\d.,]*/g)) {
      const digitos = apenasDigitos(achado[0]);
      if (!digitos) continue;
      if (nomes.has(digitos)) continue;          // número que faz parte do nome do veículo
      if (ditosPeloCliente.has(digitos)) continue; // número que o próprio cliente informou
      if (precos.has(digitos) || outros.has(digitos)) continue;
      const numero = Number(digitos);
      const dinheiro = ehDinheiro(frase, achado.index, achado.index + achado[0].length);
      // Ano de modelo só passa fora de contexto de dinheiro: a faixa 1900–2099 é exatamente a
      // de uma entrada ou parcela inventada, e passava como se fosse ano.
      if (!dinheiro && digitos.length === 4 && numero >= 1900 && numero <= 2099) continue;
      // Quantidade do dia a dia ("tenho 3 agora", "2 opções", "3 anos").
      if (!dinheiro && numero < 1000) continue;
      return { ok: false, violation: 'valor_nao_verificado',
        detail: `número ${digitos} não veio de nenhuma ferramenta` };
    }
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
