import { describe, expect, it } from 'vitest';
import { toCatalogVehicle } from './public-catalog';

const BASE = {
  id: 'test', slug: 'moto-teste', type: 'motorcycle' as const,
  brand: 'Honda', model: 'CG 160', version: null,
  year: 2024, mileageKm: 1200, color: 'Preta', priceCents: 1850050,
  description: 'Moto de teste', status: 'reserved' as const,
  publishedAt: new Date(), image: 'https://example.invalid/foto.jpg',
};

describe('catálogo público', () => {
  it('converte centavos sem mudar o estado e usa a foto do anúncio', () => {
    const result = toCatalogVehicle(BASE);
    expect(result).toMatchObject({
      slug: 'moto-teste', title: 'Honda CG 160 2024', category: 'moto',
      priceBRL: 18500.5, availability: 'reservado', image: BASE.image,
    });
  });

  it('deixa cor e condição ausentes em vez de escrever "Não informada"', () => {
    const result = toCatalogVehicle({ ...BASE, color: null });
    expect(result.color).toBeUndefined();
    expect(result.condition).toBeUndefined();
  });

  it('nomeia o veículo com o ano, sem repetir quando a versão já o traz', () => {
    expect(toCatalogVehicle({ ...BASE, version: 'Titan 2024' }).title).toBe('Honda CG 160 Titan 2024');
    expect(toCatalogVehicle({ ...BASE, year: null }).title).toBe('Honda CG 160');
  });

  it('corta o resumo na fronteira de palavra, com reticência', () => {
    const prosa = `A Honda CG 160 2024 reúne a proposta de motocicleta urbana para uso pessoal ou profissional. Esta unidade preta tem 1.200 km informados no anúncio. Os equipamentos podem ser consultados com a loja.`;
    const { shortDescription } = toCatalogVehicle({ ...BASE, description: prosa });
    expect(shortDescription.endsWith('…')).toBe(true);
    const semReticencia = shortDescription.replace('…', '');
    // O resumo é prefixo do original...
    expect(prosa.startsWith(semReticencia)).toBe(true);
    // ...e o caractere seguinte no original não é letra nem dígito, então nenhuma palavra
    // ficou partida. O corte anterior, por contagem de caracteres, produzia "Os equipa" e
    // "tem 56". Espaço ou pontuação servem: a pontuação final do trecho é aparada.
    expect(prosa.charAt(semReticencia.length)).not.toMatch(/[\p{L}\p{N}]/u);
    // E não sobra artigo ou preposição solta antes da reticência ("no anúncio. Os…").
    expect(semReticencia).not.toMatch(/\s\p{L}{1,2}$/u);
  });

  it('troca a ficha de disparo do WhatsApp por um resumo dos dados', () => {
    const disparo = '🏁 CHEGOU NA LOJA: YAMAHA Lander 2023 🏍️\n🔧 Cilindrada: 250\n⚙ Marchas: 5\n📍 KM: 23218\n💰 APENAS: R$ 25300';
    const result = toCatalogVehicle({ ...BASE, description: disparo });
    expect(result.shortDescription).toBe('Honda CG 160 2024 com 1.200 km, cor preta.');
    // A descrição completa continua sendo o texto da loja, só sem emoji.
    expect(result.description).toContain('Cilindrada: 250');
    expect(result.description).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('não apaga números ao remover emoji', () => {
    // `\p{Emoji_Component}` casa os dígitos 0-9: usá-la apagava "2023", "250" e "70.760".
    const { description } = toCatalogVehicle({
      ...BASE,
      description: '🔥 Yamaha 2023 com 70.760 km e 250 cilindradas 🏍️',
    });
    expect(description).toContain('2023');
    expect(description).toContain('70.760');
    expect(description).toContain('250');
  });

  it('não repete ano e km nos destaques, que a ficha já mostra', () => {
    expect(toCatalogVehicle(BASE).highlights).toEqual([]);
  });
});
