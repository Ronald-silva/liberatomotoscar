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
    expect(r.naoConfirmado).toEqual(expect.arrayContaining([
      'parcelamento no cartão', 'horário de funcionamento',
    ]));
  });

  it('não inventa prazo nem número de parcelas', () => {
    expect(STORE_POLICY.pagamento.parcelasNoCartao).toBeNull();
    expect(STORE_POLICY.horario).toBeNull();
  });

  it('a garantia é a legal do consumidor, sem prometer cobertura própria', () => {
    expect(STORE_POLICY.garantia).toContain('Código de Defesa do Consumidor');
    expect(resumoDaPolitica().confirmado.garantia).toBeTruthy();
    expect(resumoDaPolitica().naoConfirmado).not.toContain('garantia');
  });
});
