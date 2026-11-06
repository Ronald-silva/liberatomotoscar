import { describe, expect, it } from 'vitest';
import { composeVehicleTitle, FALLBACK_TITLE } from './art-title';

describe('título da arte sem repetição', () => {
  it('não repete marca e modelo que a versão já traz', () => {
    // Dado real do estoque (§13 do spec): o Lander 250 tem version = "Yamaha xtz Lander 250".
    // 'XTZ' em caixa alta é a regra de sigla que a vitrine já aplica — ver o ruling da Tarefa 9.
    expect(composeVehicleTitle({ brand: 'Yamaha', model: 'Lander 250', version: 'Yamaha xtz Lander 250' }))
      .toBe('Yamaha Lander 250 XTZ');
  });

  it('mantém a versão quando ela acrescenta informação', () => {
    expect(composeVehicleTitle({ brand: 'Volkswagen', model: 'Saveiro', version: 'Robust' }))
      .toBe('Volkswagen Saveiro Robust');
  });

  it('ignora diferença de caixa ao comparar', () => {
    expect(composeVehicleTitle({ brand: 'Honda', model: 'Pop', version: 'HONDA pop 110i' }))
      .toBe('Honda Pop 110i');
  });

  it('ignora diferença de acento ao comparar', () => {
    expect(composeVehicleTitle({ brand: 'Citroën', model: 'C3', version: 'citroen c3 attraction' }))
      .toBe('Citroën C3 Attraction');
  });

  it('número conta como palavra e não se repete', () => {
    expect(composeVehicleTitle({ brand: 'Honda', model: 'CG 160', version: 'CG 160 Start' }))
      .toBe('Honda CG 160 Start');
  });

  it('veículo sem marca e sem modelo recebe título de reserva', () => {
    // Existe um rascunho assim no estoque.
    expect(composeVehicleTitle({ brand: null, model: null, version: null })).toBe('Veículo sem título');
  });

  it('título degenerado de um caractere também cai no texto de reserva', () => {
    // Review Focus 1: o rascunho real tem título de 1 caractere. A arte reserva o maior corpo da
    // peça para o título; uma linha de um caractere ali é a peça saindo errada em silêncio.
    expect(composeVehicleTitle({ brand: null, model: null, version: 'x' })).toBe(FALLBACK_TITLE);
    expect(composeVehicleTitle({ brand: 'y', model: null, version: null })).toBe(FALLBACK_TITLE);
  });

  it('título só de pontuação cai no texto de reserva, por mais longo que seja', () => {
    expect(composeVehicleTitle({ brand: null, model: null, version: '--- ...' })).toBe(FALLBACK_TITLE);
  });

  it('título plausível de dois caracteres passa', () => {
    expect(composeVehicleTitle({ brand: 'BMW', model: 'X1', version: null })).toBe('BMW X1');
  });

  it('espaço sobrando e quebra de linha do cadastro não entram no título', () => {
    expect(composeVehicleTitle({ brand: '  Honda ', model: 'CG\n150', version: ' ' }))
      .toBe('Honda CG 150');
  });
});
