import { describe, expect, it } from 'vitest';
import { brandsFor, COMMON_COLORS, modelsFor, suggest } from './catalogo-marcas-modelos';

describe('marcas por tipo', () => {
  it('separa o que é de moto e o que é de carro', () => {
    expect(brandsFor('motorcycle')).toContain('Honda');
    expect(brandsFor('motorcycle')).toContain('Yamaha');
    expect(brandsFor('motorcycle')).not.toContain('Fiat');
    expect(brandsFor('car')).toContain('Fiat');
    expect(brandsFor('car')).toContain('Volkswagen');
    expect(brandsFor('car')).not.toContain('Yamaha');
  });

  // A loja é de motos com alguns carros: a marca mais vendida precisa estar no primeiro toque.
  it('põe as marcas mais comuns no começo da lista', () => {
    expect(brandsFor('motorcycle').slice(0, 3)).toEqual(['Honda', 'Yamaha', 'Suzuki']);
    expect(brandsFor('car').slice(0, 3)).toEqual(['Volkswagen', 'Fiat', 'Chevrolet']);
  });

  it('não repete marca', () => {
    for (const type of ['motorcycle', 'car'] as const) {
      expect(new Set(brandsFor(type)).size).toBe(brandsFor(type).length);
    }
  });
});

describe('modelos por marca', () => {
  it('devolve os modelos da marca escolhida', () => {
    expect(modelsFor('motorcycle', 'Honda')).toContain('CG 160 Fan');
    expect(modelsFor('car', 'Fiat')).toContain('Strada');
  });

  // Honda vende moto e carro: a lista de modelos não pode misturar os dois.
  it('não mistura modelo de moto com modelo de carro na mesma marca', () => {
    expect(modelsFor('motorcycle', 'Honda')).not.toContain('Civic');
    expect(modelsFor('car', 'Honda')).toContain('Civic');
    expect(modelsFor('car', 'Honda')).not.toContain('CG 160 Fan');
  });

  it('acha a marca digitada sem acento e em qualquer caixa', () => {
    expect(modelsFor('car', 'citroen')).toContain('C3');
    expect(modelsFor('car', 'CITROËN')).toContain('C3');
    expect(modelsFor('motorcycle', ' honda ')).toContain('Biz 125');
  });

  it('devolve vazio para marca desconhecida ou em branco, sem quebrar', () => {
    expect(modelsFor('car', 'Marca Que Não Existe')).toEqual([]);
    expect(modelsFor('car', '')).toEqual([]);
    expect(modelsFor('car', '   ')).toEqual([]);
  });

  it('não repete modelo dentro da marca', () => {
    for (const brand of brandsFor('motorcycle')) {
      const models = modelsFor('motorcycle', brand);
      expect(new Set(models).size).toBe(models.length);
    }
  });
});

describe('sugestões conforme digita', () => {
  const models = modelsFor('motorcycle', 'Honda');

  it('mostra o começo da lista antes de digitar, para a pessoa ver que há sugestão', () => {
    expect(suggest(models, '').length).toBeGreaterThan(0);
    expect(suggest(models, '', 3)).toHaveLength(3);
  });

  it('acha pelas primeiras letras', () => {
    expect(suggest(models, 'cg')).toContain('CG 160 Fan');
    expect(suggest(models, 'biz')).toContain('Biz 125');
  });

  it('prefere o que começa com o que foi digitado', () => {
    const found = suggest(modelsFor('car', 'Volkswagen'), 'go');
    expect(found[0]).toBe('Gol');
  });

  it('também acha no meio do nome, porque é assim que a pessoa lembra', () => {
    expect(suggest(models, 'twister')).toContain('CB 300F Twister');
    expect(suggest(models, '160')).toContain('CG 160 Fan');
  });

  it('ignora acento e caixa', () => {
    expect(suggest(modelsFor('motorcycle', 'Yamaha'), 'tenere')).toContain('Ténéré 250');
    expect(suggest(models, 'AFRICA')).toContain('Africa Twin');
  });

  it('devolve vazio quando nada casa, em vez de a lista inteira', () => {
    expect(suggest(models, 'zzzz')).toEqual([]);
  });

  it('respeita o limite para a lista não cobrir a tela', () => {
    expect(suggest(models, 'c', 4)).toHaveLength(4);
  });
});

describe('cores comuns', () => {
  it('cobre as cores de estoque sem repetir', () => {
    expect(COMMON_COLORS).toContain('Preto');
    expect(COMMON_COLORS).toContain('Prata');
    expect(new Set(COMMON_COLORS).size).toBe(COMMON_COLORS.length);
  });
});
