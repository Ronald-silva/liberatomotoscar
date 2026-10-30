import { describe, expect, it } from 'vitest';
import { organizarFicha, semGritar } from './ficha';

describe('texto do cliente na tela do vendedor', () => {
  it('não grita o que o cliente digitou em maiúsculas', () => {
    // Saiu da caixa de entrada real, num bloco de destaque.
    expect(semGritar('ACHO QUE SABADO DEPOIS DDO ALMOCO / 14 HRS'))
      .toBe('Acho que sabado depois ddo almoco / 14 hrs');
  });

  it('deixa intacto o texto escrito normalmente', () => {
    expect(semGritar('até 90 mil')).toBe('até 90 mil');
    expect(semGritar('Saveiro Robust')).toBe('Saveiro Robust');
    expect(semGritar('uma moto para longas viagens')).toBe('uma moto para longas viagens');
  });

  it('não mexe em sigla, que é palavra única', () => {
    for (const sigla of ['CNH', 'IPVA', 'DETRAN', 'CRLV', '14h', 'R$ 90']) {
      expect(semGritar(sigla), sigla).toBe(sigla);
    }
  });

  it('normaliza frase curta em maiúsculas, que sigla não é', () => {
    expect(semGritar('SABADO 14H')).toBe('Sabado 14h');
  });

  it('respeita acento ao baixar a caixa', () => {
    expect(semGritar('QUERO UMA CAMIONETA ATÉ 90 MIL')).toBe('Quero uma camioneta até 90 mil');
  });
});

describe('ordem da ficha', () => {
  const facts = [
    { field: 'payment', quote: 'cartão' },
    { field: 'visit', quote: 'sábado 14h' },
    { field: 'budget', quote: 'até 90 mil' },
    { field: 'purpose', quote: 'longas viagens' },
  ];

  it('tira a visita da lista e devolve em destaque', () => {
    const f = organizarFicha(facts);
    expect(f.visita).toBe('sábado 14h');
    expect(f.linhas.map((l) => l.campo)).not.toContain('visit');
  });

  it('ordena pelo que o vendedor precisa saber primeiro', () => {
    expect(organizarFicha(facts).linhas.map((l) => l.campo)).toEqual(['purpose', 'budget', 'payment']);
  });

  it('sem fatos, não há visita nem linhas', () => {
    expect(organizarFicha([])).toEqual({ visita: null, linhas: [] });
  });
});
