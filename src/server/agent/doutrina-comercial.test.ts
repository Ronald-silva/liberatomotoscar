import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT as P } from './prompt';

/**
 * A prioridade declarada pelo lojista é VENDER. Estas regras vêm de prática do setor e da
 * evidência que o próprio plano reúne: o Pied Piper PSI mostra que resposta automática rica
 * seguida de contato pessoal é o que converte, e o mystery shop de 100 concessionárias mostra
 * que dar o preço final é o diferencial barato.
 */
describe('objetivo da conversa', () => {
  it('é marcar a visita, porque a loja atende com hora marcada', () => {
    // O lojista respondeu "sim, sempre agendar". Antes o objetivo era só "levar à loja".
    expect(P).toMatch(/O OBJETIVO DE TODA CONVERSA/);
    expect(P).toMatch(/Marcar a visita/);
    expect(P).toMatch(/nenhuma conversa fecha no WhatsApp/i);
  });

  it('tem objetivo secundário quando a visita não sai agora', () => {
    expect(P).toMatch(/deixar o vendedor pronto/i);
    expect(P).toMatch(/registrar_lead/);
  });

  it('convida para ver assim que há interesse, sem esperar amadurecer', () => {
    expect(P).toMatch(/quem pergunta preço de um veículo já está interessado/i);
  });
});

describe('o que nunca dizer, mesmo sendo verdade', () => {
  it('não oferece argumento contra a própria venda', () => {
    expect(P).toMatch(/nunca oferece um argumento contra a própria venda/i);
    expect(P).toMatch(/Não cite quilometragem alta, idade, desgaste/i);
  });

  it('mas responde com honestidade se perguntarem', () => {
    // A regra é não TRAZER o negativo, não escondê-lo. Omitir dado pedido é outra coisa.
    expect(P).toMatch(/Se a pessoa perguntar, responda com honestidade/i);
  });

  it('não fala mal de veículo, do que a pessoa tem, nem de concorrente', () => {
    expect(P).toMatch(/Nunca fale mal de um veículo/i);
    expect(P).toMatch(/Nunca compare com concorrente/i);
  });

  it('não estima chance de aprovação de crédito', () => {
    expect(P).toMatch(/Nunca estime chance de aprovação/i);
  });
});

describe('quando parar e chamar o vendedor', () => {
  it('lista os gatilhos de negociação, confiança e dinheiro', () => {
    expect(P).toMatch(/QUANDO PARAR E CHAMAR O VENDEDOR/);
    for (const gatilho of ['fechar, reservar, negociar', 'na troca', 'financiar',
      'falar com alguém', 'pressa real', 'irritada']) {
      expect(P, gatilho).toContain(gatilho);
    }
  });

  it('proíbe usar o encaminhamento como fuga', () => {
    expect(P).toMatch(/nunca use o encaminhamento como forma de escapar/i);
  });
});
