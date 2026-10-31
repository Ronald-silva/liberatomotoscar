/**
 * Política comercial da loja: o que o agente pode AFIRMAR, e o que ele precisa saber que não
 * sabe.
 *
 * Este arquivo existe porque a versão anterior guardava os fatos da loja dentro de
 * `attendance/knowledge.ts`, junto do motor de regex que falhou. Ao remover o motor, os fatos
 * foram junto — e o agente passou a encaminhar ao vendedor até perguntas triviais como "aceitam
 * cartão?". Separar os dois é o ponto: o classificador era o problema, o conhecimento não.
 *
 * Campo `null` significa "a loja ainda não informou", não "não existe". A diferença importa: o
 * agente afirma o que está preenchido e encaminha o que está null, em vez de encaminhar tudo.
 *
 * **Para o lojista:** preencha os campos null e o agente passa a responder essas perguntas
 * sozinho. Não invente — o que estiver escrito aqui é dito ao cliente como fato da loja.
 */
export const STORE_POLICY = {
  pagamento: {
    /** Confirmado pelo lojista em 30/10/2026. */
    aceitos: [
      'cartão de crédito',
      'Pix',
      'dinheiro',
      'financiamento com análise de crédito',
      'veículo na troca, mediante avaliação presencial',
    ],
    /**
     * Confirmado pelo lojista em 30/10/2026. O agente afirma que a loja aceita cartão e que as
     * condições são tratadas na loja — e NÃO cita número de parcelas nem juros, que ninguém
     * informou. Dizer "o Liberato vê com você" é resposta; "vou chamar um vendedor" não é.
     */
    /**
     * Informado pelo lojista em 30/10/2026, de segunda mão: veio de uma mensagem do outro
     * atendente que o Liberato usa, não do Liberato diretamente. Por isso o agente diz "até 18
     * vezes" como teto e manda confirmar as condições na loja, em vez de afirmar parcela, juros
     * ou valor — que ninguém confirmou.
     */
    parcelasNoCartao: 'em até 18 vezes no cartão; as condições exatas são confirmadas na loja, '
      + 'com o Liberato' as string | null,
    /** Com quais bancos ou financeiras a loja trabalha. Não informado. */
    financeiras: null as string | null,
  },
  /**
   * Confirmado pelo lojista em 30/10/2026: a loja não oferece garantia contratual própria; vale
   * a garantia legal do Código de Defesa do Consumidor. O agente afirma isso e não promete
   * cobertura, prazo nem reparo específico — o que cada caso cobre é com a loja.
   */
  garantia: 'a garantia legal prevista no Código de Defesa do Consumidor; a loja não oferece '
    + 'garantia contratual própria além dela' as string | null,
  /** Confirmado pelo lojista em 30/10/2026, e reconfirmado em 31/10/2026. */
  horario: 'das 9h às 18h, fechado aos domingos' as string | null,
  /**
   * O mesmo horário em forma de máquina, para `openingHoursSpecification` no JSON-LD e para a
   * seção de contato do site. Fica ao LADO da frase em vez de gerá-la: a frase acima entra no
   * prompt da Dayse com redação própria, e derivá-la mudaria o texto que o agente já usa.
   * `store-policy.test.ts` compara os dois campos, então eles não podem divergir em silêncio.
   */
  horarioEstruturado: {
    abre: '09:00',
    fecha: '18:00',
    /** Schema.org exige os nomes em inglês. Domingo fora: a loja fecha. */
    dias: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    /** Para a página, onde o cliente lê em português. */
    rotulo: 'Segunda a sábado, 9h às 18h',
  },
  /** Confirmado em 30/10/2026: ver veículo é sempre com hora marcada. */
  visitaExigeAgendamento: true,
  /**
   * Confirmado em 30/10/2026, e é o melhor argumento honesto que a loja tem: todo veículo passa
   * por revisão antes de ir para a vitrine. Em seminovo, procedência é o que mais trava a venda.
   */
  revisaoAntesDaVitrine: 'todos os veículos passam por revisão antes de entrar na vitrine' as string | null,
  /**
   * Confirmado em 30/10/2026: a loja NÃO avisa quando chega o veículo que o cliente queria.
   * O agente estava oferecendo isso. Prometer retorno que não acontece custa mais caro que não
   * prometer nada — o cliente espera, não recebe, e não volta.
   */
  avisaQuandoChega: false,
  troca: {
    /** Confirmado em 30/10/2026. */
    aceita: 'veículo com documento; outros bens o Liberato analisa caso a caso',
    /**
     * Escolha conservadora, a pedido do lojista. O agente NÃO declara o que a loja recusa: ele
     * não tem como verificar restrição, sinistro ou financiamento em aberto por mensagem, e um
     * "não aceitamos" errado perde uma troca que existiria. Ele coleta e a avaliação decide.
     */
    dadosQueOAvaliadorPrecisa: 'modelo, ano, quilometragem, estado geral, se a documentação '
      + 'está em dia e no nome do cliente, e se ainda há financiamento em aberto',
  },
  /**
   * A transferência é tratada na loja, com o Liberato. Aqui havia o processo do DETRAN-CE
   * inteiro — vistoria, débitos, DAE, prazo — e o agente o recitava para quem tinha perguntado
   * "o que precisa pra fechar negócio". O lojista cortou: isso se resolve pessoalmente, e
   * encher a mensagem com etapa de cartório afasta quem estava perto de comprar.
   */
  documentacao: 'a transferência e a documentação são tratadas na loja, com o Liberato' as string | null,
  /**
   * Confirmado pelo lojista em 30/10/2026. O estoque gira rápido, então não ter o veículo hoje
   * não é um "não". É anotar o modelo e dizer que pode chegar — perder o cliente porque a moto
   * dele não está na vitrine HOJE é perder uma venda que existiria na semana que vem.
   */
  rotatividade: 'o estoque gira rápido e entram veículos novos com frequência; o modelo que o '
    + 'cliente procura pode chegar em pouco tempo' as string | null,
} as const;

const ROTULOS: Record<string, string> = {
  parcelasNoCartao: 'parcelamento no cartão',
  financeiras: 'bancos e financeiras parceiros',
  garantia: 'garantia',
  horario: 'horário de funcionamento',
  documentacao: 'transferência e documentação',
};

/**
 * Divide a política em "pode afirmar" e "precisa confirmar com a loja". É o formato que a
 * ferramenta entrega ao modelo: sem essa separação explícita ele trata tudo como incerto.
 */
export function resumoDaPolitica() {
  const naoConfirmado: string[] = [];
  if (STORE_POLICY.pagamento.parcelasNoCartao === null) naoConfirmado.push(ROTULOS.parcelasNoCartao);
  if (STORE_POLICY.pagamento.financeiras === null) naoConfirmado.push(ROTULOS.financeiras);
  if (STORE_POLICY.garantia === null) naoConfirmado.push(ROTULOS.garantia);
  if (STORE_POLICY.horario === null) naoConfirmado.push(ROTULOS.horario);
  if (STORE_POLICY.documentacao === null) naoConfirmado.push(ROTULOS.documentacao);

  return {
    confirmado: {
      pagamento: [...STORE_POLICY.pagamento.aceitos],
      servicos: ['compra', 'venda', 'troca mediante avaliação presencial'],
      ...(STORE_POLICY.rotatividade ? { rotatividade: STORE_POLICY.rotatividade } : {}),
      ...(STORE_POLICY.revisaoAntesDaVitrine ? { revisao: STORE_POLICY.revisaoAntesDaVitrine } : {}),
      visitaExigeAgendamento: STORE_POLICY.visitaExigeAgendamento,
      avisaQuandoChega: STORE_POLICY.avisaQuandoChega,
      troca: STORE_POLICY.troca,
      ...(STORE_POLICY.pagamento.parcelasNoCartao ? { parcelamento: STORE_POLICY.pagamento.parcelasNoCartao } : {}),
      ...(STORE_POLICY.garantia ? { garantia: STORE_POLICY.garantia } : {}),
      ...(STORE_POLICY.horario ? { horario: STORE_POLICY.horario } : {}),
      ...(STORE_POLICY.documentacao ? { documentacao: STORE_POLICY.documentacao } : {}),
    },
    naoConfirmado,
  };
}
