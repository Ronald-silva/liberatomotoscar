import { describe, expect, it } from 'vitest';
import { STORE_POLICY } from '@/data/store-policy';
import { AGENT_SYSTEM_PROMPT as P } from './prompt';

/** Respostas do lojista no questionário, em 30/10/2026. Cada uma vira regra verificável. */
describe('ficha preenchida pelo lojista', () => {
  it('a agente se chama Dayse e espelha o jeito do cliente', () => {
    expect(P).toMatch(/Você é a Dayse/);
    expect(P).toMatch(/Espelhe o jeito da pessoa/i);
  });

  it('NUNCA promete avisar quando o veículo chegar', () => {
    // O lojista respondeu "não, melhor não prometer". O agente estava oferecendo isso.
    expect(STORE_POLICY.avisaQuandoChega).toBe(false);
    expect(P).toMatch(/NUNCA ofereça avisar quando chegar/);
    expect(P).not.toMatch(/ofereça avisar quando chegar\./);
  });

  it('a visita é com hora marcada, não "passa quando quiser"', () => {
    expect(STORE_POLICY.visitaExigeAgendamento).toBe(true);
    expect(P).toMatch(/A loja atende COM HORA MARCADA/);
    expect(P).toMatch(/Não diga "pode passar quando quiser"/);
    expect(P).toMatch(/Marcar a visita/);
  });

  it('atende fora do horário e usa o momento para agendar', () => {
    expect(P).toMatch(/FORA DO HORÁRIO DA LOJA/);
    expect(P).toMatch(/nunca deixa ninguém sem resposta/i);
  });

  it('a revisão de todos os veículos virou argumento de venda', () => {
    expect(STORE_POLICY.revisaoAntesDaVitrine).toMatch(/revisão/i);
    expect(P).toMatch(/POR QUE COMPRAR AQUI/);
    expect(P).toMatch(/todo veículo passa por revisão/i);
    expect(P).toMatch(/nunca diga "somos os melhores"/i);
  });

  it('o cartão tem teto declarado e condição confirmada na loja', () => {
    expect(STORE_POLICY.pagamento.parcelasNoCartao).toMatch(/18 vezes/);
    expect(STORE_POLICY.pagamento.parcelasNoCartao).toMatch(/confirmadas na loja/);
  });

  it('nunca declara que a loja recusa um veículo na troca', () => {
    expect(P).toMatch(/nunca diga que a loja NÃO aceita um veículo/i);
    expect(STORE_POLICY.troca.dadosQueOAvaliadorPrecisa).toMatch(/financiamento em aberto/);
  });

  it('os limites conservadores que o lojista delegou', () => {
    for (const regra of ['conselho jurídico', 'está reservado', 'prometa prazo de entrega',
      'em nome do Liberato']) {
      expect(P, regra).toContain(regra);
    }
  });

  it('chama o Liberato em contraproposta, reclamação e assunto jurídico', () => {
    for (const gatilho of ['contraproposta', 'depois da compra', 'Procon']) {
      expect(P, gatilho).toContain(gatilho);
    }
  });
});
