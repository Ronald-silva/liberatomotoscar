import { describe, expect, it } from 'vitest';
import { STORE } from '@/data/store';
import { checkAgentReply } from './guards';
import { createAgentTurnState, type VerifiedVehicle } from './tools';

const cg: VerifiedVehicle = {
  id: '11111111-1111-4111-8111-111111111111',
  titulo: 'Honda CG 160 Start', marca: 'Honda', modelo: 'CG 160 Start',
  tipo: 'motorcycle', ano: 2022, quilometragem: 21_000, cor: 'Vermelha',
  precoCentavos: 1_250_000, slug: 'honda-cg-160-2022',
};
const fazer: VerifiedVehicle = {
  id: '22222222-2222-4222-8222-222222222222',
  titulo: 'Yamaha Fazer 250', marca: 'Yamaha', modelo: 'Fazer 250',
  tipo: 'motorcycle', ano: 2014, quilometragem: 38_000, cor: 'Azul',
  precoCentavos: 900_000, slug: 'yamaha-fazer-2014',
};

function estado(veiculos: VerifiedVehicle[] = [], marcasBuscadas: string[] = [], semResultado = true) {
  const s = createAgentTurnState();
  for (const v of veiculos) s.allowedVehicles.set(v.id, v);
  for (const m of marcasBuscadas) s.searchedBrands.add(m);
  if (!semResultado) s.searchFoundResults = true;
  return s;
}

const bloqueia = (texto: string, s = estado()) =>
  checkAgentReply({ text: texto, finishReason: 'stop', state: s });

describe('C1 — valor que a guarda deixava passar', () => {
  it('bloqueia valor inventado que cai na janela do ano de modelo', () => {
    expect(bloqueia('Na troca a gente consegue te dar R$ 2.000 pela sua moto.').ok).toBe(false);
    expect(bloqueia('A entrada fica em R$ 1.950 e o resto a gente vê na loja.').ok).toBe(false);
    expect(bloqueia('A parcela fica em 1.999 por mês, tranquilo.').ok).toBe(false);
  });

  it('bloqueia valor escrito por extenso', () => {
    expect(bloqueia('Essa sai por quinze mil reais, fechou?').ok).toBe(false);
    expect(bloqueia('Consigo te dar uns três mil na sua moto na troca.').ok).toBe(false);
    expect(bloqueia('Fica em dezoito mil, mas pra você faço por dezesseis.').ok).toBe(false);
  });

  it('não libera número porque alguém digitou dígitos no campo versão', () => {
    const sujo: VerifiedVehicle = { ...cg, titulo: 'Honda CG 160 Start Flex 8000 2 unidades' };
    expect(bloqueia('Essa moto sai por R$ 8.000 hoje.', estado([sujo])).ok).toBe(false);
  });

  it('bloqueia o preço de um veículo atribuído a outro', () => {
    const v = bloqueia('A Fazer 250 sai por R$ 12.500 e tem 21000 km.', estado([cg, fazer]));
    expect(v.ok).toBe(false);
  });

  it('deixa passar o preço certo do veículo certo', () => {
    expect(bloqueia('A Yamaha Fazer 250 sai por R$ 9.000.', estado([cg, fazer])).ok).toBe(true);
    expect(bloqueia('A Honda CG 160 Start está R$ 12.500, com 21.000 km.', estado([cg, fazer])).ok).toBe(true);
  });
});

describe('C2/C3 — promessa que a guarda deixava passar', () => {
  it('bloqueia oferta de valor pela troca em qualquer verbo', () => {
    for (const f of [
      'Na troca a gente consegue te dar R$ 2.000 pela sua moto.',
      'Consigo te dar uns três mil na sua moto.',
      'Pela sua moto fica em torno de doze mil.',
      'Te ofereço um bom valor pela sua.',
      'A gente faz por menos, pode vir.',
    ]) expect(bloqueia(f).ok, f).toBe(false);
  });

  it('bloqueia promessa de financiamento sem usar a palavra aprovado', () => {
    for (const f of [
      'Seu crédito já está liberado, pode vir buscar.',
      'Seu financiamento passou na análise, é só vir assinar.',
      'Pode contar comigo, seu financiamento sai sem problema.',
      'A gente cobre qualquer oferta da concorrência.',
    ]) expect(bloqueia(f).ok, f).toBe(false);
  });
});

describe('C4 — veículo que a loja não tem', () => {
  it('bloqueia marca fora da lista conhecida', () => {
    expect(bloqueia('Temos uma Ducati Monster aqui, chega amanhã.').ok).toBe(false);
  });

  it('bloqueia nome de modelo que nenhuma ferramenta devolveu', () => {
    expect(bloqueia('Temos uma Biz zero km aqui na loja, quer ver?').ok).toBe(false);
    expect(bloqueia('Temos uma Hayabusa na loja agora.').ok).toBe(false);
  });

  it('não deixa o modelo liberar marca só de buscar por ela', () => {
    const s = estado([], ['ducati'], false);
    expect(bloqueia('Temos uma Ducati Monster disponível, quer ver as fotos?', s).ok).toBe(false);
  });

  it('deixa passar a resposta honesta de busca vazia', () => {
    const s = estado([], ['yamaha']);
    expect(bloqueia('Não encontrei nenhuma Yamaha publicada agora, quer que eu veja Honda?', s).ok).toBe(true);
  });
});

describe('I1 — português correto que a guarda bloqueava', () => {
  it.each([
    'Aceitamos cartão sim, o vendedor confirma as condições com você.',
    'Essa moto tem 3 anos de uso.',
    'Temos 2 unidades dessa moto.',
    'Separei 2 opções pra você.',
    `Nosso telefone é ${STORE.phoneDisplay}.`,
    'Não trabalho com desconto por aqui, isso é com o vendedor.',
    'Posso fazer a ponte com o vendedor agora mesmo.',
  ])('deixa passar: %s', (frase) => {
    expect(bloqueia(frase).ok, frase).toBe(true);
  });

  it('deixa passar resposta honesta quando a busca foi por modelo, não por marca', () => {
    const s = estado();
    s.searchedModels.add('fazer');
    expect(bloqueia('Não encontrei nenhuma Fazer publicada no momento.', s).ok).toBe(true);
  });
});

describe('I3 — link fora da loja', () => {
  it('bloqueia domínio sem esquema', () => {
    expect(bloqueia('Olha as fotos em bit.ly/motos-promo.').ok).toBe(false);
  });

  it('bloqueia domínio colado no domínio da loja', () => {
    expect(bloqueia('Veja em liberatomotoscar.com.br.promocoes-moto.com/oferta.').ok).toBe(false);
  });
});

describe('Minor 7 — telefone de terceiro em outros espaçamentos', () => {
  it('bloqueia número de terceiro escrito com espaços', () => {
    expect(bloqueia('Liga no 85 9 8812 3344 que resolvemos.').ok).toBe(false);
  });
});
