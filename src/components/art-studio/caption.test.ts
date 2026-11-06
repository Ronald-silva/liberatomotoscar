import { describe, expect, it } from 'vitest';
import { createCaption, type CaptionVehicle } from './caption';
import { DESTINATION_ORDER } from './destinations';
import { BRAND } from '@/data/brand';

const moto: CaptionVehicle = {
  title: 'Honda CG Titan 150 EX', brand: 'Honda', model: 'CG Titan 150', type: 'motorcycle',
  year: 2013, mileageKm: 42_000, color: 'Vermelha', price: 'R$ 12.990,00',
  priceCents: 1_299_000, status: 'published', publicUrl: 'https://loja.example/veiculos/honda-cg',
};
const TELEFONE = '(85) 99636-5664';

describe('legendas por destino', () => {
  it('usa somente dados confirmados e hashtags específicas no Feed', () => {
    const text = createCaption(moto, 'feed', TELEFONE);
    expect(text).toContain('Honda CG Titan 150 EX • 2013');
    expect(text).toContain('42.000 km • Vermelha');
    expect(text).toContain('R$ 12.990,00');
    expect(text).toContain('#HondaCGTitan150 #MotosFortaleza #LiberatoMotosCar');
    expect(text).not.toMatch(/desconto|financiamento|garantia|#fyp/i);
  });

  it('reserva e venda não geram chamada de compra de veículo indisponível', () => {
    const reserved = createCaption({ ...moto, status: 'reserved' }, 'feed', TELEFONE);
    const sold = createCaption({ ...moto, status: 'sold' }, 'tiktok', TELEFONE);
    expect(reserved).toContain('Reservado.');
    expect(sold).toContain('Vendido.');
    expect(sold).not.toContain('R$ 12.990,00');
    expect(sold).not.toContain('Anúncio:');
  });

  it('o veículo vendido não tem o endereço do anúncio promovido nem no Feed', () => {
    expect(createCaption({ ...moto, status: 'sold' }, 'feed', TELEFONE)).not.toContain('https://');
  });

  it('faz texto curto para Stories e não põe hashtags no Status', () => {
    const story = createCaption(moto, 'story', TELEFONE);
    const status = createCaption(moto, 'whatsapp', TELEFONE);
    expect(story).toContain('#MotosFortaleza');
    expect(status).not.toContain('#');
    expect(status).toContain(`WhatsApp da Liberato: ${TELEFONE}`);
  });

  it('cria hashtag de carro sem copiar caracteres especiais do modelo', () => {
    const text = createCaption({ ...moto, title: 'Fiat Strada 1.4', brand: 'Fiat', model: 'Strada 1.4',
      type: 'car', year: null, mileageKm: null, color: null }, 'feed', TELEFONE);
    expect(text).toContain('#FiatStrada14 #CarrosFortaleza #LiberatoMotosCar');
    expect(text).not.toContain('42.000 km');
    expect(text).not.toContain('Vermelha');
  });

  it('a legenda do Feed traz o endereço do anúncio quando existe', () => {
    const texto = createCaption({ ...moto, publicUrl: 'https://exemplo.com/veiculos/saveiro' }, 'feed', TELEFONE);
    expect(texto).toContain('https://exemplo.com/veiculos/saveiro');
  });

  it('Stories, Status e TikTok não trazem endereço', () => {
    for (const d of ['story', 'whatsapp', 'tiktok'] as const) {
      expect(createCaption({ ...moto, publicUrl: 'https://exemplo.com/x' }, d, TELEFONE))
        .not.toContain('https://');
    }
  });

  it('o Feed sem endereço cadastrado não inventa linha de anúncio', () => {
    expect(createCaption({ ...moto, publicUrl: null }, 'feed', TELEFONE)).not.toContain('Anúncio:');
  });

  it('o Status do WhatsApp não leva hashtag', () => {
    expect(createCaption(moto, 'whatsapp', TELEFONE)).not.toContain('#');
  });

  it('vendido não anuncia preço em nenhum destino', () => {
    for (const d of DESTINATION_ORDER) {
      expect(createCaption({ ...moto, status: 'sold' }, d, TELEFONE)).not.toContain('R$');
    }
  });

  it('somente o Feed recebe a variante longa', () => {
    // Sem isto, uma legenda que ignora o destino e devolve sempre a variante longa passa em
    // todo o resto deste arquivo.
    const longa = createCaption(moto, 'feed', TELEFONE);
    expect(longa).toContain('Veja as fotos e os detalhes');
    for (const d of ['story', 'whatsapp', 'tiktok'] as const) {
      expect(createCaption(moto, d, TELEFONE)).not.toContain('Veja as fotos e os detalhes');
    }
    for (const d of DESTINATION_ORDER) {
      expect(createCaption(moto, d, TELEFONE).split('\n').length)
        .toBeLessThanOrEqual(longa.split('\n').length);
    }
  });

  it('a hashtag de categoria é só do TikTok', () => {
    expect(createCaption(moto, 'tiktok', TELEFONE)).toContain('#MotosCE');
    for (const d of ['feed', 'story', 'whatsapp'] as const) {
      expect(createCaption(moto, d, TELEFONE)).not.toContain('#MotosCE');
    }
  });

  it('as hashtags da loja saem do BrandKit, não cravadas na legenda', () => {
    const texto = createCaption(moto, 'tiktok', TELEFONE);
    for (const tag of [...BRAND.hashtags.brand, ...BRAND.hashtags.local.motorcycle,
      ...BRAND.hashtags.category.motorcycle]) {
      expect(texto).toContain(tag);
    }
    const carro = createCaption({ ...moto, type: 'car' }, 'tiktok', TELEFONE);
    for (const tag of [...BRAND.hashtags.local.car, ...BRAND.hashtags.category.car]) {
      expect(carro).toContain(tag);
    }
    for (const tag of BRAND.hashtags.local.motorcycle) expect(carro).not.toContain(tag);
  });

  it('nenhum destino repete hashtag', () => {
    for (const d of DESTINATION_ORDER) {
      const tags = createCaption(moto, d, TELEFONE).match(/#[\w]+/g) ?? [];
      expect(tags.length).toBe(new Set(tags).size);
    }
  });
});
