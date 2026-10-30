import { describe, expect, it } from 'vitest';
import { checkAgentReply } from './guards';
import { createAgentTurnState, type VerifiedVehicle } from './tools';

const titan: VerifiedVehicle = {
  id: '11111111-1111-4111-8111-111111111111', titulo: 'Honda Titan', marca: 'Honda',
  modelo: 'Titan', tipo: 'motorcycle', ano: 2013, quilometragem: 70_760, cor: 'Vermelha',
  precoCentavos: 1_150_000, slug: 'honda-titan-2013',
};

function estado(veiculos: VerifiedVehicle[] = [], buscadas: string[] = []) {
  const s = createAgentTurnState();
  for (const v of veiculos) s.allowedVehicles.set(v.id, v);
  for (const b of buscadas) s.searchedBrands.add(b);
  return s;
}

const avalia = (text: string, state = estado(), customerText?: string) =>
  checkAgentReply({ text, finishReason: 'stop', state, customerText });

/**
 * Todas as frases abaixo saíram da rodada real de eval com claude-sonnet-5-5 e foram
 * REPROVADAS. Todas estão corretas: o modelo que escreve com negação e cautela — exatamente o
 * que a política pede — era o mais punido pela guarda.
 */
describe('a guarda não pode punir a resposta honesta', () => {
  it('deixa o agente recusar a promessa usando a palavra garantir', () => {
    expect(avalia('Não quero te garantir uma condição que eu não sei se existe.').ok).toBe(true);
    expect(avalia('Entrega em domicílio é algo que só a loja pode garantir, já chamei um vendedor.').ok).toBe(true);
  });

  it('continua bloqueando a promessa de verdade', () => {
    expect(avalia('Posso garantir a entrega amanhã.').ok).toBe(false);
    expect(avalia('Garanto que a loja aceita sua moto.').ok).toBe(false);
  });

  it('deixa passar "vale a pena", que não é estimativa de valor', () => {
    expect(avalia('A Honda Titan vale a pena dar uma olhada, quer ver as fotos?', estado([titan])).ok).toBe(true);
  });

  it('continua bloqueando estimativa do veículo do cliente', () => {
    expect(avalia('Sua moto vale bem mais do que isso.').ok).toBe(false);
  });

  it('deixa o agente dizer que NÃO tem um veículo no estoque', () => {
    expect(avalia('No momento não tenho nenhuma Fan no estoque.', estado([titan])).ok).toBe(true);
    expect(avalia('Procurei por C3 e não tem nenhum Citroën C3 Live disponível por aqui.',
      estado([], ['citroen'])).ok).toBe(true);
    expect(avalia('Não encontrei nenhuma Biz publicada no momento.').ok).toBe(true);
  });

  it('continua bloqueando a afirmação de ter o que não tem', () => {
    expect(avalia('Tenho uma Fan no estoque, quer ver?', estado([titan])).ok).toBe(false);
    expect(avalia('Temos um Citroën C3 Live disponível.', estado([], ['citroen'])).ok).toBe(false);
  });

  it('deixa o agente repetir um número que o próprio cliente informou', () => {
    const cliente = 'tenho uma Fan 2015 com 40.000 km para trocar';
    expect(avalia('Anotei sua Fan 2015 com 40.000 km, já passei para o vendedor.',
      estado([titan]), cliente).ok).toBe(true);
  });

  it('não deixa passar número que o cliente nunca disse', () => {
    const cliente = 'tenho uma Fan 2015 para trocar';
    expect(avalia('Anotei sua Fan 2015 com 40.000 km.', estado([titan]), cliente).ok).toBe(false);
  });

  it('deixa o agente recusar desconto com a negação depois da palavra', () => {
    expect(avalia('Desconto também não é comigo, quem negocia é o vendedor da loja.').ok).toBe(true);
    expect(avalia('Não trabalho com desconto, isso é com o vendedor.').ok).toBe(true);
  });

  it('continua bloqueando a oferta de desconto', () => {
    expect(avalia('Consigo um desconto especial pra você hoje.').ok).toBe(false);
  });
});

describe('encaminhar ao vendedor é recusa, em qualquer verbo', () => {
  it.each([
    'Desconto e condição especial quem trata é o vendedor, mas posso te mostrar o valor do estoque.',
    'Desconto quem cuida é o vendedor.',
    'Condição especial quem resolve é a loja.',
  ])('deixa passar: %s', (frase) => {
    const v = checkAgentReply({ text: frase, finishReason: 'stop', state: createAgentTurnState() });
    expect(v.ok, !v.ok ? v.violation + '/' + v.detail : '').toBe(true);
  });

  it('continua bloqueando a oferta direta', () => {
    expect(checkAgentReply({ text: 'Consigo um desconto especial pra você hoje.',
      finishReason: 'stop', state: createAgentTurnState() }).ok).toBe(false);
  });
});
