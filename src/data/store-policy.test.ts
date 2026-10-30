import { describe, expect, it } from 'vitest';
import { STORE_POLICY, resumoDaPolitica } from './store-policy';

describe('política comercial da loja', () => {
  it('lista as formas de pagamento confirmadas pelo lojista', () => {
    expect(STORE_POLICY.pagamento.aceitos).toEqual(expect.arrayContaining([
      'cartão de crédito', 'Pix', 'dinheiro', 'financiamento com análise de crédito',
      'veículo na troca, mediante avaliação presencial',
    ]));
  });

  it('separa o que foi confirmado do que ninguém informou ainda', () => {
    const r = resumoDaPolitica();
    expect(r.confirmado.pagamento).toContain('cartão de crédito');
    // Prazo de parcelamento, horário e garantia nunca foram informados pela loja: o agente
    // precisa saber que não sabe, em vez de inventar ou de calar sobre o que sabe.
    // Só as financeiras parceiras seguem sem informação.
    expect(r.naoConfirmado).toEqual(['bancos e financeiras parceiros']);
  });

  it('fala do cartão sem inventar número de parcelas nem juros', () => {
    const texto = STORE_POLICY.pagamento.parcelasNoCartao!;
    expect(texto).toContain('Liberato');
    expect(texto).not.toMatch(/\d+\s*x|\d+\s*vezes|juros de/i);
  });

  it('remete a transferência à loja, sem recitar o processo', () => {
    const texto = STORE_POLICY.documentacao!;
    expect(texto).toMatch(/loja|Liberato/i);
    // O processo do DETRAN inteiro estava aqui, e o agente o recitava para quem perguntava
    // "o que precisa pra fechar negócio". Decisão do lojista: isso se resolve pessoalmente.
    expect(texto).not.toMatch(/vistoria|DAE|30 dias|ATPV|CRV|R\$/i);
  });

  it('informa o horário confirmado', () => {
    expect(STORE_POLICY.horario).toContain('9h às 18h');
    expect(STORE_POLICY.horario).toContain('domingos');
  });

  it('a garantia é a legal do consumidor, sem prometer cobertura própria', () => {
    expect(STORE_POLICY.garantia).toContain('Código de Defesa do Consumidor');
    expect(resumoDaPolitica().confirmado.garantia).toBeTruthy();
    expect(resumoDaPolitica().naoConfirmado).not.toContain('garantia');
  });
});
