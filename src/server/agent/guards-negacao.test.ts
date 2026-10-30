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

describe('quantidade não é preço só porque a frase cita preço', () => {
  const moto = (id: string, marca: string, modelo: string, ano: number, km: number, preco: number): VerifiedVehicle =>
    ({ id, titulo: `${marca} ${modelo}`, marca, modelo, tipo: 'motorcycle', ano,
      quilometragem: km, cor: 'Preta', precoCentavos: preco, slug: id });

  function estoqueReal() {
    const s = createAgentTurnState();
    for (const v of [
      moto('a', 'Yamaha', 'Fazer', 2014, 72_000, 1_050_000),
      moto('b', 'Honda', 'Titan', 2013, 70_760, 1_150_000),
      moto('c', 'Yamaha', 'Lander 250', 2023, 23_218, 2_530_000),
    ]) s.allowedVehicles.set(v.id, v);
    return s;
  }

  it('deixa passar a listagem completa do estoque', () => {
    // Saiu de uma conversa real e foi reprovada pelo "3" de "tenho 3 agora".
    const texto = 'Ronald, no estoque de motos tenho 3 agora: a Yamaha Fazer 2014 por R$ 10.500,00 '
      + '(72.000 km), a Honda Titan 2013 por R$ 11.500,00 (70.760 km) e a Yamaha Lander 250 2023 '
      + 'por R$ 25.300,00 (23.218 km). Qual te interessa?';
    const v = checkAgentReply({ text: texto, finishReason: 'stop', state: estoqueReal() });
    expect(v.ok, !v.ok ? v.violation + '/' + v.detail : '').toBe(true);
  });

  it('continua bloqueando valor que não é de nenhum veículo', () => {
    expect(checkAgentReply({ text: 'A Yamaha Fazer 2014 sai por R$ 8.000,00.',
      finishReason: 'stop', state: estoqueReal() }).ok).toBe(false);
  });

  it('continua bloqueando parcela e entrada inventadas', () => {
    for (const f of ['A parcela fica em 1.999 por mês.', 'A entrada fica em R$ 1.950.']) {
      expect(checkAgentReply({ text: f, finishReason: 'stop', state: estoqueReal() }).ok, f).toBe(false);
    }
  });

  it('continua bloqueando quilometragem que não é do cadastro', () => {
    expect(checkAgentReply({ text: 'A Honda Titan 2013 tem 9.000 km rodados.',
      finishReason: 'stop', state: estoqueReal() }).ok).toBe(false);
  });
});
