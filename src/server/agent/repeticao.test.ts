import { describe, expect, it } from 'vitest';
import { STORE_POLICY } from '@/data/store-policy';
import { cardsFor } from './run';
import { AGENT_SYSTEM_PROMPT } from './prompt';
import type { VerifiedVehicle } from './tools';

const saveiro: VerifiedVehicle = {
  id: '11111111-1111-4111-8111-111111111111', titulo: 'Volkswagen Saveiro Robust',
  marca: 'Volkswagen', modelo: 'Saveiro Robust', tipo: 'car', ano: 2024,
  quilometragem: 56_000, cor: 'Branca', precoCentavos: 6_999_900, slug: 'saveiro',
};
const strada: VerifiedVehicle = {
  id: '22222222-2222-4222-8222-222222222222', titulo: 'Fiat Strada', marca: 'Fiat',
  modelo: 'Strada', tipo: 'car', ano: 2016, quilometragem: 89_000, cor: 'Cinza',
  precoCentavos: 6_700_000, slug: 'strada',
};

describe('o mesmo cartão não vai três vezes', () => {
  it('não reenvia o veículo que a conversa já mostrou', () => {
    // Conversa real: a Saveiro foi anexada em três mensagens seguidas.
    const texto = 'Pra fechar a Saveiro Robust, o caminho é ir até a loja e acertar com o Liberato.';
    expect(cardsFor(texto, [saveiro], [saveiro.id])).toEqual([]);
  });

  it('envia na primeira vez', () => {
    const texto = 'Temos a Volkswagen Saveiro Robust 2024, quer ver?';
    expect(cardsFor(texto, [saveiro], []).map((c) => c.title)).toEqual(['Volkswagen Saveiro Robust']);
  });

  it('um veículo novo na conversa continua sendo enviado', () => {
    const texto = 'Também tenho a Fiat Strada 2016 e a Saveiro Robust 2024.';
    expect(cardsFor(texto, [saveiro, strada], [saveiro.id]).map((c) => c.title)).toEqual(['Fiat Strada']);
  });
});

describe('o agente não dá aula de documentação', () => {
  it('a política remete a transferência à loja, sem recitar o processo', () => {
    const texto = STORE_POLICY.documentacao ?? '';
    expect(texto).toMatch(/loja|Liberato/i);
    // O cliente perguntou "o que precisa pra fechar" e ouviu DETRAN, vistoria e débitos.
    expect(texto).not.toMatch(/vistoria|DAE|30 dias|ATPV|CRV/i);
  });

  it('o prompt proíbe despejar processo que ninguém perguntou', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/não.{0,40}(despeje|enumere|recite)/i);
  });
});
