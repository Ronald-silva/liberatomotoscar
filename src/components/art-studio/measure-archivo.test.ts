import { describe, expect, it } from 'vitest';
import advances from './__fixtures__/archivo-advances.json';
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

  it('caractere fora da tabela não vira NaN nem zero', () => {
    // A observação é texto livre digitado pelo operador: emoji e pontuação exótica chegam ali.
    // Uma medição `NaN` propaga por toda a composição e não falha em lugar nenhum — ela só entrega
    // uma peça vazia.
    const measure = createArchivoMeasure();
    for (const peso of [400, 900]) {
      const largura = measure('\u{1F525}', 76, peso);
      expect(Number.isFinite(largura)).toBe(true);
      expect(largura).toBeGreaterThan(0);
    }
  });

  it('caractere ausente é aproximado para cima, nunca para baixo', () => {
    // Sub-medir é o único erro perigoso desta tabela: o teste abençoa um layout que estoura na
    // produção, que é precisamente o defeito que a medição fiel existe para matar. Super-medir só
    // encolhe o corpo um degrau.
    const measure = createArchivoMeasure();
    for (const peso of [400, 900]) {
      const maisLargo = Math.max(...[...'WM%ÃÇ@'].map((char) => measure(char, 76, peso)));
      expect(measure('\u{1F525}', 76, peso)).toBeGreaterThanOrEqual(maisLargo);
    }
  });

  it('a fixture cobre cada caractere que o estoque real usa', () => {
    const corpus = [
      'Volkswagen Saveiro', 'Yamaha Lander 250', 'Honda Pop', 'Yamaha Crosser', 'Fiat Strada',
      '2024 · 56.000 km · Branca', '660 km · Branca com banco vermelho', 'Vermelha e preta',
      '2016 · 89.000 km · Cinza-escuro', 'R$ 460.000,00', '(85) 99636-5664',
      'PREÇO DO ANÚNCIO', 'RECÉM-CHEGADO', 'DESTAQUE DA SEMANA', 'PREÇO EM DESTAQUE',
      'VENDIDO', 'RESERVADO', 'ESTOQUE LIBERATO', 'PRÉVIA · NÃO PUBLICAR',
      'Consulte disponibilidade e condições', 'Entrada a partir de 20% e parcelas',
      // Observação é texto livre: a pontuação que um vendedor digita de verdade entra aqui.
      'Aceito troca! Tem interesse? Chame no zap: 24h', 'Único dono; IPVA 2026 pago',
    ].join(' ');
    const tabelas: Record<string, number>[] = [advances.weights['400'], advances.weights['900']];
    const faltando = new Set<string>();
    for (const char of corpus) {
      for (const tabela of tabelas) if (tabela[char] === undefined) faltando.add(char);
    }
    expect([...faltando].sort()).toEqual([]);
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
