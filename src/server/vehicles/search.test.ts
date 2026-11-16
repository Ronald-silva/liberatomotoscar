import { expect, it, describe } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { dobrar, escaparLike, searchTerms, vehicleSearchCondition } from './search';

// A consulta de verdade, com o mesmo dialeto que o serviço usa: o que se afirma aqui é o SQL que
// o Postgres recebe, não a árvore intermediária do Drizzle.
const dialeto = new PgDialect();
const compilar = (condicao: SQL | undefined) => dialeto.sqlToQuery(condicao!);

describe('dobra do texto', () => {
  it('tira acento e caixa, que é o que o celular erra', () => {
    expect(dobrar('Citroën')).toBe('citroen');
    expect(dobrar('TÉNÉRÉ')).toBe('tenere');
    expect(dobrar('Doblò')).toBe('doblo');
    expect(dobrar('Up!')).toBe('up!');
  });
});

describe('termos da busca', () => {
  it('cada palavra é um filtro, em qualquer ordem', () => {
    expect(searchTerms('honda fan')).toEqual(['honda', 'fan']);
    expect(searchTerms('  FAN   Honda  ')).toEqual(['fan', 'honda']);
  });

  it('texto ausente ou só espaço é "sem busca", não "nada encontrado"', () => {
    expect(searchTerms(null)).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchTerms('')).toEqual([]);
    expect(searchTerms('    ')).toEqual([]);
    // Um array vindo da URL (?busca=a&busca=b) não é texto e não vira busca.
    expect(searchTerms(['honda'] as unknown as string)).toEqual([]);
  });

  it('um colar acidental não vira consulta sem fim', () => {
    expect(searchTerms('a b c d e f g h i j')).toHaveLength(6);
    expect(searchTerms('x'.repeat(200))[0]).toHaveLength(40);
  });
});

describe('escape de curinga', () => {
  it('%, _ e \\ são texto procurado, não curinga', () => {
    expect(escaparLike('100%')).toBe('100\\%');
    expect(escaparLike('cg_160')).toBe('cg\\_160');
    expect(escaparLike('a\\b')).toBe('a\\\\b');
  });
});

describe('condição SQL', () => {
  it('sem termo não há condição — a lista continua inteira', () => {
    expect(vehicleSearchCondition('')).toBeUndefined();
    expect(vehicleSearchCondition('   ')).toBeUndefined();
    expect(vehicleSearchCondition(null)).toBeUndefined();
  });

  it('cada termo vira um filtro próprio, somados com AND', () => {
    const { sql, params } = compilar(vehicleSearchCondition('honda fan'));
    expect(params).toContain('%honda%');
    expect(params).toContain('%fan%');
    expect(sql).toContain(' and ');
    expect(compilar(vehicleSearchCondition('honda')).params).not.toContain('%fan%');
  });

  it('varre marca, modelo, versão e ano, e nada mais', () => {
    const { sql } = compilar(vehicleSearchCondition('honda'));
    for (const coluna of ['"brand"', '"model"', '"version"', '"year"']) expect(sql).toContain(coluna);
    // Preço e descrição ficam de fora de propósito: "18500" tem de achar ano, não achar preço.
    expect(sql).not.toContain('price_cents');
    expect(sql).not.toContain('"description"');
  });

  it('a dobra de acento acontece na coluna, não só no que foi digitado', () => {
    const { sql, params } = compilar(vehicleSearchCondition('citroen'));
    expect(sql).toContain('translate(lower(');
    expect(params).toContain('áàâãäåéèêëíìîïóòôõöúùûüçñýÿ');
    expect(params).toContain('aaaaaaeeeeiiiiooooouuuucnyy');
    expect(params).toContain('%citroen%');
  });

  it('o curinga digitado chega escapado, e o LIKE declara o escape', () => {
    const { sql, params } = compilar(vehicleSearchCondition('100%'));
    expect(params).toContain('%100\\%%');
    expect(sql).toContain("escape '\\'");
  });
});
