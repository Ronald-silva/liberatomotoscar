import { describe, expect, it } from 'vitest';
import { fitTitle } from './title-fit';

// `measure` injetada como largura por caractere: o módulo não depende de fonte nem de DOM.
const medida = (porChar: number) => (t: string, s: number) => t.length * porChar * (s / 100);
const base = { maxWidth: 940, maxHeight: 120, lineHeight: 1.02, candidates: [66, 55, 48] };

describe('fitTitle', () => {
  it('escolhe o maior corpo cujas linhas caibam na altura', () => {
    expect(fitTitle({ ...base, text: 'VOLKSWAGEN SAVEIRO ROBUST', measure: medida(62) }).size).toBe(55);
  });

  it('nunca devolve mais linhas do que cabem na altura', () => {
    const r = fitTitle({ ...base, measure: medida(62),
      text: 'CHEVROLET S10 HIGH COUNTRY 2.8 TURBO DIESEL 4X4 AUTOMATICA COURO' });
    expect(r.lines.length * r.size * 1.02).toBeLessThanOrEqual(120);
  });

  it('quando precisa cortar, sinaliza o corte com reticências dentro da largura', () => {
    const medir = medida(62);
    const r = fitTitle({ ...base, measure: medir,
      text: 'CHEVROLET S10 HIGH COUNTRY 2.8 TURBO DIESEL 4X4 AUTOMATICA COURO' });
    expect(r.lines.at(-1)).toMatch(/…$/);
    expect(medir(r.lines.at(-1)!, r.size)).toBeLessThanOrEqual(940);
  });

  it('mantém o título inteiro quando ele cabe', () => {
    expect(fitTitle({ ...base, text: 'FIAT STRADA', measure: medida(62) }).lines.join(' ')).toBe('FIAT STRADA');
  });

  it('rejeita 66px quando ele só permite uma linha e o texto precisa de duas', () => {
    // o defeito P0-2: a 66px cabe 1 linha (67,32 x 2 = 134,6 > 120)
    const r = fitTitle({ ...base, text: 'SUZUKI BOULEVARD M800', measure: medida(70) });
    expect(r.size).toBeLessThan(66);
    expect(r.lines.join(' ')).toBe('SUZUKI BOULEVARD M800');
  });

  it('parte uma palavra mais larga que a linha em vez de deixá-la vazar', () => {
    const r = fitTitle({ ...base, text: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      measure: medida(100) });
    expect(r.lines.length).toBeGreaterThan(1);
  });
});
