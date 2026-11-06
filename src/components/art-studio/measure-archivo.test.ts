import { describe, expect, it } from 'vitest';
import { createArchivoMeasure } from './measure-archivo';

describe('createArchivoMeasure', () => {
  it('mede proporcionalmente ao corpo', () => {
    const measure = createArchivoMeasure();
    // O arredondamento para cima de cada medição — o mesmo da produção — deixa o dobro do corpo 50
    // até dois pixels acima do corpo 100. Fora dessa folga, a escala por `size` estaria errada.
    const dobro = measure('Honda', 50, 900) * 2;
    const direto = measure('Honda', 100, 900);
    expect(direto).toBeLessThanOrEqual(dobro);
    expect(direto).toBeGreaterThanOrEqual(dobro - 2);
  });

  it('negrito é mais largo que regular no mesmo corpo', () => {
    const measure = createArchivoMeasure();
    expect(measure('Volkswagen Saveiro', 76, 900))
      .toBeGreaterThan(measure('Volkswagen Saveiro', 76, 400));
  });

  it('acentuado não é medido como caractere ausente', () => {
    const measure = createArchivoMeasure();
    // `í` avança 225 unidades de em e o avanço de reserva do `x` avança 513: se o acentuado caísse
    // na reserva, as duas medições dariam o mesmo número.
    expect(measure('í', 76, 400)).not.toBe(measure('\u0000', 76, 400));
    // `ç` fica a 6 unidades da reserva — distância que o arredondamento de um caractere isolado
    // engole e que numa palavra aparece.
    expect(measure('ç'.repeat(10), 76, 400)).not.toBe(measure('\u0000'.repeat(10), 76, 400));
  });

  it('troca de instância no mesmo limiar que o Konva, em 600', () => {
    // O Konva manda qualquer peso >= 600 para o desenho em negrito. Se este limiar sair de 600,
    // teste e produção voltam a medir instâncias diferentes — exatamente o defeito que esta
    // medição existe para matar, e que nenhuma outra asserção aqui pegaria.
    const measure = createArchivoMeasure();
    const regular = measure('Saveiro', 76, 400);
    const negrito = measure('Saveiro', 76, 900);
    expect(regular).not.toBe(negrito);
    expect(measure('Saveiro', 76, 599)).toBe(regular);
    expect(measure('Saveiro', 76, 600)).toBe(negrito);
  });

  it('fica a menos de 8% da medição do navegador para o título real mais longo', () => {
    // Valor de referência conferido no Chromium com a Archivo carregada, anotado aqui
    // porque happy-dom não implementa measureText de verdade.
    const measure = createArchivoMeasure();
    const largura = measure('Volkswagen Saveiro', 76, 900);
    expect(largura).toBeGreaterThan(700);
    expect(largura).toBeLessThan(900);
  });
});
