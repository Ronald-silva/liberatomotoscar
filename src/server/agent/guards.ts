import { brandsFor, modelsFor } from '@/data/catalogo-marcas-modelos';
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

function escaparRegex(valor: string) {
  return valor.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
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

/** Marcas e modelos que a loja pode vender, para reconhecer uma afirmação de estoque. */
const MARCAS_CONHECIDAS = [...new Set([...brandsFor('motorcycle'), ...brandsFor('car')])]
  .filter((marca) => marca.toLocaleLowerCase('pt-BR') !== 'outra')
  .map(semAcento);

const MODELOS_CONHECIDOS = [...new Set(
  [...brandsFor('motorcycle'), ...brandsFor('car')].flatMap((marca) => [
    ...modelsFor('motorcycle', marca), ...modelsFor('car', marca),
  ]),
)].map(semAcento).filter((modelo) => modelo.length >= 3);

/** Palavras próprias da loja e do contexto, que não são afirmação de estoque. */
const PROPRIOS_DA_LOJA = new Set([
  ...semAcento(STORE.name).split(/\s+/), 'fortaleza', 'parangaba', 'ceara', 'ce', 'brasil',
  'whatsapp', 'google', 'maps', 'pix', 'uber', 'ifood', 'detran', 'liberato',
]);

/**
 * Frase que AFIRMA ter um veículo. Só dentro dela a citação de marca ou modelo precisa estar
 * verificada: "não encontrei nenhuma Yamaha" e "quer que eu veja Honda?" são respostas honestas
 * e foi justamente bloqueá-las que a revisão apontou como falso positivo caro.
 */
const AFIRMA_ESTOQUE = /\b(temos|tenho|tem aqui|chegou|chega|esta disponivel|ta disponivel|disponivel|na loja|aqui na loja|separei|olha essa|essa aqui)\b/;

/** Marcadores que tornam um número da frase um VALOR, e não uma quantidade ou um ano. */
// `r\$` fica fora do \b: `$` não é caractere de palavra, então `\br\$\b` nunca casa com "R$ 2.000".
const MARCADOR_DE_DINHEIRO = /r\$|\b(reais|real|mil|conto|valor|preco|custa|sai por|fica em|fica por|faco por|entrada|parcela|financiament|a vista|desconto)\b/;

/** Valor escrito por extenso. Não há como verificar, então em contexto de dinheiro é recusa. */
const NUMERO_POR_EXTENSO = /\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)\b[^.]{0,20}\b(mil|milhao|milhoes)\b/;

/** Referência ao veículo DO CLIENTE: é sobre ele que nenhum valor pode ser dito (decisão 0.2). */
const VEICULO_DO_CLIENTE = /\b(sua|seu|pela sua|pelo seu|na sua|no seu|da sua|do seu)\b[^.]{0,25}\b(moto|carro|veiculo|scooter|bike)\b|\bpel[ao] sua\b|\bpel[ao] seu\b/;

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
  // Terminar no link do mapa ou no telefone da loja é mensagem inteira, não frase cortada —
  // uma URL acaba em dígito e cairia nesta regra.
  const terminaEmDadoDaLoja = TRECHOS_DA_LOJA.some((trecho) => texto.endsWith(trecho));
  if (!terminaEmDadoDaLoja && !/[.!?…)\]}"'*\p{Extended_Pictographic}]$/u.test(texto)) {
    return { ok: false, violation: 'resposta_truncada', detail: 'frase sem pontuação final' };
  }

  const restante = removerTrechosDaLoja(texto);
  const plano = semAcento(restante);

  // ---- 3.2 promessa, estimativa e negociação ----
  const promessas: [RegExp, string][] = [
    [/aprovad[oa]\b/, 'promete aprovação'],
    [/garantid[oa]|\bgaranto\b|\bgarantir\b|\bgarantimos\b/, 'promete garantia de resultado'],
    [/\b(credito|financiament\w*|propost\w*)\b[^.]{0,30}\b(liberad[oa]|aprovad[oa]|passou|certo|garantido|sem problema)\b/,
      'promete resultado de financiamento'],
    [/\b(liberad[oa]|passou|aprovad[oa])\b[^.]{0,30}\b(credito|financiament\w*|analise)\b/,
      'promete resultado de financiamento'],
    [/com certeza aceit/, 'promete aceite'],
    [/\bvale\b|\bvaleria\b|\bvalem\b/, 'estima valor do veículo do cliente'],
    [/avalio em|\bpago\b|\bpagamos\b|\bpagaria\b/, 'oferece pagamento'],
    // Escopo 0.1: o agente não negocia. "Cobrir oferta" e "fazer por menos" são negociação.
    [/\b(cubro|cobrimos|cobre)\b[^.]{0,25}\b(oferta|preco|valor|concorrenc\w*)/, 'promete cobrir oferta'],
    [/\b(fa(z|co|zemos)|deixo|sai)\b[^.]{0,15}\bpor menos\b|\babatiment\w*\b|\bpercentual\b|%/,
      'negocia desconto, fora do escopo'],
    // As duas ordens: "avaliar por foto" e "pela foto consigo avaliar".
    [/(?:avali\w*|analis\w*)[^.]{0,45}(?:por foto|pelas? foto|por mensagem|por whats|a distancia|remotament|online|sem precisar (?:ir|passar|vir))/,
      'promete avaliação à distância'],
    [/(?:por foto|pelas? foto|por mensagem|por whats|a distancia|remotament)[^.]{0,45}(?:avali\w*|analis\w*|consigo (?:te )?(?:dizer|falar|passar))/,
      'promete avaliação à distância'],
  ];
  for (const [padrao, motivo] of promessas) {
    if (padrao.test(plano)) return { ok: false, violation: 'promessa_nao_autorizada', detail: motivo };
  }

  // "desconto" só é recusa quando vem negado. Bloquear a palavra inteira impedia o agente de
  // DIZER que não dá desconto — a frase correta dentro do escopo 0.1.
  if (/\bdesconto\b/.test(plano)
    && !/\b(nao|sem|nenhum|infelizmente)\b[^.]{0,30}\bdesconto\b|\bdesconto\b[^.]{0,40}\b(com o vendedor|e com o vendedor|quem ve e o vendedor|vendedor)\b/.test(plano)) {
    return { ok: false, violation: 'promessa_nao_autorizada', detail: 'negocia desconto, fora do escopo' };
  }

  // Aceite condicionado à avaliação. Restrito a aceitar VEÍCULO: a regra ampla bloqueava
  // "Aceitamos cartão", que é uma das falhas de produção que o plano registra na seção 1.2.
  if (/\baceit\w*/.test(plano) && !/avali\w*/.test(plano)
    && /\baceit\w*[^.]{0,40}\b(sua|seu|troca|entrada|moto|carro|veiculo)\b/.test(plano)) {
    return { ok: false, violation: 'promessa_nao_autorizada', detail: 'fala de aceite sem condicionar à avaliação' };
  }

  // ---- 3.3 veículo que não veio de ferramenta ----
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(texto)) {
    return { ok: false, violation: 'veiculo_nao_verificado', detail: 'id de veículo exposto na resposta' };
  }

  const frasesPlanas = frasesDe(plano);
  const frasesOriginais = frasesDe(restante);
  for (const [i, frase] of frasesPlanas.entries()) {
    if (!AFIRMA_ESTOQUE.test(frase)) continue;
    const verificados = veiculosCitadosEm(frase, state);
    const marcasOk = new Set(veiculosCitaveis(state).map((v) => semAcento(v.marca)));
    const modelosOk = new Set(veiculosCitaveis(state).map((v) => semAcento(v.modelo)));

    const marcaInventada = MARCAS_CONHECIDAS.find((m) =>
      new RegExp(`\\b${escaparRegex(m)}\\b`).test(frase) && !marcasOk.has(m));
    if (marcaInventada) {
      return { ok: false, violation: 'veiculo_nao_verificado',
        detail: `afirma estoque de ${marcaInventada} sem ter vindo de buscar_veiculos` };
    }
    const modeloInventado = MODELOS_CONHECIDOS.find((m) =>
      new RegExp(`\\b${escaparRegex(m)}\\b`).test(frase)
      && ![...modelosOk].some((ok) => ok.includes(m) || m.includes(ok)));
    if (modeloInventado) {
      return { ok: false, violation: 'veiculo_nao_verificado',
        detail: `afirma estoque de ${modeloInventado} sem ter vindo de buscar_veiculos` };
    }
    // Marca fora da lista conhecida: nome próprio no meio de uma afirmação de estoque, sem
    // nenhum veículo verificado citado na mesma frase.
    if (verificados.length === 0) {
      const proprios = (frasesOriginais[i] ?? '').match(/(?<!^)(?<![.!?]\s)\b[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][\wÁÂÃÀÉÊÍÓÔÕÚÇáâãàéêíóôõúç-]{2,}/g) ?? [];
      const inventado = proprios.map(semAcento).find((t) => !PROPRIOS_DA_LOJA.has(t));
      if (inventado) {
        return { ok: false, violation: 'veiculo_nao_verificado',
          detail: `afirma estoque de "${inventado}", que nenhuma ferramenta devolveu` };
      }
    }
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
  for (const frase of frasesPlanas) {
    const temMarcadorDeDinheiro = MARCADOR_DE_DINHEIRO.test(frase);
    const citados = veiculosCitadosEm(frase, state);
    // Quando a frase fala de UM veículo, o valor tem de ser o dele. Era aqui que o preço de um
    // veículo cobria outro: "A Fazer sai por R$ 12.500" com o 12.500 sendo da CG.
    const escopo = citados.length === 1 ? citados : veiculosCitaveis(state);
    const precos = precosDe(escopo);
    const outros = outrosNumerosDe(escopo);

    if (temMarcadorDeDinheiro && NUMERO_POR_EXTENSO.test(frase)) {
      return { ok: false, violation: 'valor_nao_verificado',
        detail: 'valor por extenso, que nenhuma ferramenta pode confirmar' };
    }
    if (VEICULO_DO_CLIENTE.test(frase) && (temMarcadorDeDinheiro || NUMERO_POR_EXTENSO.test(frase))) {
      return { ok: false, violation: 'promessa_nao_autorizada',
        detail: 'cita valor para o veículo do cliente; a avaliação é presencial (0.2)' };
    }

    for (const bruto of frase.match(/\d[\d.,]*/g) ?? []) {
      const digitos = apenasDigitos(bruto);
      if (!digitos) continue;
      if (nomes.has(digitos)) continue;          // número que faz parte do nome do veículo
      if (precos.has(digitos) || outros.has(digitos)) continue;
      const numero = Number(digitos);
      // Ano de modelo só passa fora de contexto de dinheiro: a faixa 1900–2099 é exatamente a
      // de uma entrada ou parcela inventada, e passava como se fosse ano.
      if (!temMarcadorDeDinheiro && digitos.length === 4 && numero >= 1900 && numero <= 2099) continue;
      // Quantidade do dia a dia ("3 anos", "2 opções") fora de contexto de dinheiro.
      if (!temMarcadorDeDinheiro && numero < 1000) continue;
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
