import { describe, expect, it } from 'vitest';
import { inventoryHref, pageCount, parsePage, parseSearch, statusSlugs } from './inventoryQuery';
import { parseStatusFilter } from './StatusFilter';

describe('leitura da URL do estoque', () => {
  it('a busca é aparada e tem teto; o que não é texto não é busca', () => {
    expect(parseSearch('  honda fan  ')).toBe('honda fan');
    expect(parseSearch(undefined)).toBe('');
    expect(parseSearch(['honda'])).toBe('');
    expect(parseSearch('x'.repeat(500))).toHaveLength(120);
  });

  it('página inválida volta para a primeira em vez de virar salto negativo', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-2')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage(['2'])).toBe(1);
  });

  it('o número de páginas nunca é zero — uma lista vazia ainda é uma página', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(-5, 20)).toBe(1);
    expect(pageCount(10, 0)).toBe(10);
  });
});

describe('montagem dos links do estoque', () => {
  it('o estoque inteiro, na primeira página, é a URL limpa', () => {
    expect(inventoryHref({})).toBe('/admin');
    expect(inventoryHref({ search: '', page: 1 })).toBe('/admin');
  });

  it('a busca sobrevive à troca de ficha de estado', () => {
    expect(inventoryHref({ status: 'published', search: 'honda' })).toBe('/admin?estado=publicado&busca=honda');
  });

  it('a página só entra quando não é a primeira, e a busca vai junto', () => {
    expect(inventoryHref({ search: 'honda', page: 1 })).toBe('/admin?busca=honda');
    expect(inventoryHref({ search: 'honda', page: 2 })).toBe('/admin?busca=honda&pagina=2');
    expect(inventoryHref({ status: 'draft', search: 'fan', page: 3 })).toBe('/admin?estado=rascunho&busca=fan&pagina=3');
  });

  it('espaço e acento viajam codificados e voltam inteiros', () => {
    const href = inventoryHref({ search: 'citroën c3' });
    expect(href).toBe('/admin?busca=citro%C3%ABn+c3');
    expect(new URL(href, 'http://x').searchParams.get('busca')).toBe('citroën c3');
  });

  // Os dois lados do mesmo contrato: quem escreve o slug e quem o lê têm de concordar, ou tocar
  // numa ficha de estado abriria a lista de tudo.
  it('todo slug que os links escrevem é um slug que a tela sabe ler', () => {
    for (const [status, slug] of Object.entries(statusSlugs)) expect(parseStatusFilter(slug)).toBe(status);
  });
});
