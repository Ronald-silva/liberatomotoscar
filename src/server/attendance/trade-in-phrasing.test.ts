import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

import { isSafeTradeInPhrasing } from './trade-in-phrasing';
import type { TradeInDetails } from './knowledge';

const pop: TradeInDetails = {
  vehicle: 'Honda Pop', year: 2019, mileageKm: 18000,
  condition: null, paperworkOk: null, singleOwner: null,
};

/**
 * A avaliação é presencial e quem define o valor é a loja. O estado da troca é determinístico;
 * o modelo só redige. Tudo que escape dessa fronteira precisa ser recusado, e o chamador cai
 * no texto determinístico.
 */
describe('Guarda da redação da troca', () => {
  it.each([
    ['Que bom, anotei sua **Honda Pop 2019** com 18.000 km. A avaliação é feita aqui na loja pelo nosso avaliador — quer combinar um horário?'],
    ['Entendi! Já tenho a Honda Pop de 2019 anotada. Você sabe me dizer o estado de conservação dela?'],
    ['Desculpe a demora! Sua Honda Pop segue anotada para avaliação na loja. Pode passar por aqui esta semana?'],
  ])('aceita frase natural e ancorada: %j', (frase) => {
    expect(isSafeTradeInPhrasing(frase, pop)).toBe(true);
  });

  it.each([
    ['dá valor em reais', 'Sua Honda Pop 2019 deve valer uns R$ 8.000 na troca, mediante avaliação.'],
    ['estima sem reais', 'Pela avaliação, sua Honda Pop 2019 vale em torno de 8 mil.'],
    ['promete aceite sem avaliação', 'Com certeza aceitamos sua Honda Pop 2019 como entrada!'],
    ['fala em aprovação', 'Sua entrada já está aprovada, pode vir buscar a moto.'],
    ['promete desconto', 'Consigo um desconto de 10% na troca da sua Honda Pop.'],
    ['avalia a distância', 'Me manda as fotos que eu avalio por mensagem a distância mesmo.'],
    ['manda link', 'Veja em https://liberatomotoscar.up.railway.app/veiculos'],
    ['cita número não confirmado', 'Anotei sua Honda Pop 2019 com 45.000 km rodados.'],
  ])('recusa quando %s', (_motivo, frase) => {
    expect(isSafeTradeInPhrasing(frase, pop)).toBe(false);
  });

  it('recusa frase vazia ou longa demais para uma mensagem de WhatsApp', () => {
    expect(isSafeTradeInPhrasing('ok', pop)).toBe(false);
    expect(isSafeTradeInPhrasing('a'.repeat(601), pop)).toBe(false);
  });

  it('permite falar de troca desde que condicione à avaliação', () => {
    expect(isSafeTradeInPhrasing(
      'A loja trabalha com troca, mediante avaliação do veículo aqui na loja. Quer passar?', pop,
    )).toBe(true);
    expect(isSafeTradeInPhrasing('Pode trazer, aceitamos sua moto na entrada.', pop)).toBe(false);
  });

  it('não deixa passar número algum quando nada foi confirmado', () => {
    const vazio: TradeInDetails = {
      vehicle: null, year: null, mileageKm: null,
      condition: null, paperworkOk: null, singleOwner: null,
    };
    expect(isSafeTradeInPhrasing('Me diz o ano e a quilometragem da sua moto, por favor?', vazio)).toBe(true);
    expect(isSafeTradeInPhrasing('Imagino que seja uma 2015, certo?', vazio)).toBe(false);
  });
});

describe('Guarda recusa frase incompleta', () => {
  it.each([
    'Oi, Ronald! Anotei que você tem uma Honda Pop. Para o avaliador se adiantar, me conta',
    'Perfeito, já tenho a Honda Pop anotada e só falta',
  ])('recusa texto cortado no meio: %j', (frase) => {
    expect(isSafeTradeInPhrasing(frase, pop)).toBe(false);
  });

  it.each([
    'Anotei sua Honda Pop para a avaliação na loja. Quer combinar um horário?',
    'Anotei sua Honda Pop para a avaliação na loja, combinado? 😊',
    'Já está anotada para o avaliador ver aqui na loja.',
  ])('aceita frase terminada: %j', (frase) => {
    expect(isSafeTradeInPhrasing(frase, pop)).toBe(true);
  });
});
