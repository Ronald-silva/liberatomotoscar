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
    /** Em quantas vezes no cartão, e se há juros. Não informado. */
    parcelasNoCartao: null as string | null,
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
  /** Dias e horários de atendimento presencial. Não informado. */
  horario: null as string | null,
  /** Como funciona a transferência e a documentação. Não informado. */
  documentacao: null as string | null,
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
      ...(STORE_POLICY.pagamento.parcelasNoCartao ? { parcelamento: STORE_POLICY.pagamento.parcelasNoCartao } : {}),
      ...(STORE_POLICY.garantia ? { garantia: STORE_POLICY.garantia } : {}),
      ...(STORE_POLICY.horario ? { horario: STORE_POLICY.horario } : {}),
      ...(STORE_POLICY.documentacao ? { documentacao: STORE_POLICY.documentacao } : {}),
    },
    naoConfirmado,
  };
}
