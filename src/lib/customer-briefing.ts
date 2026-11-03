/** Campos da ficha que o vendedor lê antes de ligar. */
export const FACT_LABELS: Record<string, string> = {
  category: 'Categoria', model: 'Modelo', budget: 'Orçamento', payment: 'Pagamento',
  trade_in: 'Troca', timeline: 'Prazo', visit: 'Visita', negotiation: 'Negociação', purpose: 'Finalidade',
};

const ORDEM_DA_FICHA = ['purpose', 'category', 'model', 'budget', 'trade_in',
  'payment', 'timeline', 'negotiation'] as const;

/** Texto em caixa alta vira frase legível; palavras únicas e siglas ficam como o cliente escreveu. */
export function semGritar(texto: string): string {
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
