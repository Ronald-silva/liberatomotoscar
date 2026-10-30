/**
 * Preparo da ficha que o vendedor lê antes de ligar.
 *
 * Ordem de leitura pensada para quem vai atender: primeiro o que a pessoa quer e quanto pode
 * gastar, depois como pretende pagar. A visita sai desta lista e ganha destaque próprio — é o
 * compromisso marcado, não mais um dado entre outros.
 */
export const FACT_LABELS: Record<string, string> = {
  category: 'Categoria',
  model: 'Modelo',
  budget: 'Orçamento',
  payment: 'Pagamento',
  trade_in: 'Troca',
  timeline: 'Prazo',
  visit: 'Visita',
  negotiation: 'Negociação',
  purpose: 'Finalidade',
};

const ORDEM_DA_FICHA = ['purpose', 'category', 'model', 'budget', 'trade_in',
  'payment', 'timeline', 'negotiation'] as const;

/**
 * O cliente escreve como quer, e muita gente digita tudo em maiúsculas. Repetir isso num bloco
 * de destaque faz a ficha parecer quebrada: "ACHO QUE SABADO DEPOIS DDO ALMOCO / 14 HRS" grita
 * na tela do vendedor. Siglas curtas ("CNH", "14H") passam intactas, e o texto original fica no
 * `title` de quem precisar conferir.
 */
export function semGritar(texto: string): string {
  // Só frase é grito. Sigla é palavra única — "IPVA" e "CNH" ficam como estão, e foi o teste
  // com IPVA que mostrou que o critério de tamanho sozinho não serve.
  if (!/\s/.test(texto.trim())) return texto;
  const letras = texto.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras.length < 6) return texto;
  const maiusculas = (texto.match(/[A-ZÀ-Þ]/g) ?? []).length;
  if (maiusculas / letras.length < 0.7) return texto;
  const minusculo = texto.toLocaleLowerCase('pt-BR');
  return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1);
}

export function organizarFicha(facts: { field: string; quote: string }[]) {
  const porCampo = new Map(facts.map((f) => [f.field, f.quote]));
  return {
    visita: porCampo.get('visit') ?? null,
    linhas: ORDEM_DA_FICHA
      .filter((campo) => porCampo.has(campo))
      .map((campo) => ({ campo, rotulo: FACT_LABELS[campo] ?? campo, valor: porCampo.get(campo)! })),
  };
}
