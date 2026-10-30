import { describe, expect, it } from 'vitest';
import { cardsFor } from './run';
import type { VerifiedVehicle } from './tools';

const titanDaLoja: VerifiedVehicle = {
  id: '11111111-1111-4111-8111-111111111111', titulo: 'Honda Titan', marca: 'Honda',
  modelo: 'Titan', tipo: 'motorcycle', ano: 2013, quilometragem: 70_760, cor: 'Vermelha',
  precoCentavos: 1_150_000, slug: 'honda-titan-2013',
};
const lander: VerifiedVehicle = {
  id: '22222222-2222-4222-8222-222222222222', titulo: 'Yamaha Lander 250', marca: 'Yamaha',
  modelo: 'Lander 250', tipo: 'motorcycle', ano: 2023, quilometragem: 23_218, cor: 'Vermelha',
  precoCentavos: 2_530_000, slug: 'yamaha-lander-2023',
};

describe('cartão não pode anunciar o veículo que o cliente deu na troca', () => {
  it('não anexa cartão quando a moto citada é a do cliente', () => {
    // Conversa real: o cliente disse "Titan 2002" falando da própria moto, e o agente anexou o
    // cartão da Titan 2013 da loja, por R$ 11.500 — como se estivesse oferecendo o que ele
    // acabou de dizer que quer entregar.
    const texto = 'Anotei: Honda Titan 2002 para a troca. A avaliação é feita pessoalmente na '
      + 'loja, então não consigo adiantar valor, mas o vendedor já tem essa informação para te '
      + 'atender na Lander 250. Você sabe quantos km ela está rodando?';
    const cartoes = cardsFor(texto, [titanDaLoja, lander]);
    expect(cartoes.map((c) => c.title)).toEqual(['Yamaha Lander 250']);
  });

  it('não anexa cartão de veículo citado com ano diferente do cadastro', () => {
    const cartoes = cardsFor('Você falou da Titan 2002, certo?', [titanDaLoja]);
    expect(cartoes).toEqual([]);
  });

  it('continua anexando quando o agente oferece o veículo da loja', () => {
    const cartoes = cardsFor('Temos a Honda Titan 2013 disponível, quer ver as fotos?', [titanDaLoja]);
    expect(cartoes.map((c) => c.title)).toEqual(['Honda Titan']);
  });

  it('continua anexando quando o ano nem é citado', () => {
    const cartoes = cardsFor('A Honda Titan está disponível, quer ver?', [titanDaLoja]);
    expect(cartoes).toHaveLength(1);
  });
});
