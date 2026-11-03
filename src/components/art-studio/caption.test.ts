import { describe, expect, it } from 'vitest';
import { createCaption, type CaptionVehicle } from './caption';

const moto: CaptionVehicle = {
  title: 'Honda CG Titan 150 EX', brand: 'Honda', model: 'CG Titan 150', type: 'motorcycle',
  year: 2013, mileageKm: 42_000, color: 'Vermelha', price: 'R$ 12.990,00',
  priceCents: 1_299_000, status: 'published', publicUrl: 'https://loja.example/veiculos/honda-cg',
};

describe('legendas por destino', () => {
  it('usa somente dados confirmados e hashtags específicas no Instagram', () => {
    const text = createCaption(moto, 'instagram', 'feed', '(85) 99636-5664');
    expect(text).toContain('Honda CG Titan 150 EX • 2013');
    expect(text).toContain('42.000 km • Vermelha');
    expect(text).toContain('R$ 12.990,00');
    expect(text).toContain('#HondaCGTitan150 #MotosFortaleza #LiberatoMotosCar');
    expect(text).not.toMatch(/desconto|financiamento|garantia|#fyp/i);
    expect(text).not.toContain('https://');
  });

  it('reserva e venda não geram chamada de compra de veículo indisponível', () => {
    const reserved = createCaption({ ...moto, status: 'reserved' }, 'facebook', 'feed', '85 99999-9999');
    const sold = createCaption({ ...moto, status: 'sold' }, 'tiktok', 'tiktok', '85 99999-9999');
    expect(reserved).toContain('Reservado.');
    expect(sold).toContain('Vendido.');
    expect(sold).not.toContain('R$ 12.990,00');
    expect(sold).not.toContain('Anúncio:');
  });

  it('faz texto curto para Stories e não põe hashtags no Status', () => {
    const story = createCaption(moto, 'instagram', 'story', '85 99999-9999');
    const status = createCaption(moto, 'whatsapp', 'story', '85 99999-9999');
    expect(story).toContain('#MotosFortaleza');
    expect(status).not.toContain('#');
    expect(status).toContain('WhatsApp da Liberato: 85 99999-9999');
  });

  it('cria hashtag de carro sem copiar caracteres especiais do modelo', () => {
    const text = createCaption({ ...moto, title: 'Fiat Strada 1.4', brand: 'Fiat', model: 'Strada 1.4',
      type: 'car', year: null, mileageKm: null, color: null }, 'facebook', 'feed', '85 99999-9999');
    expect(text).toContain('#FiatStrada14 #CarrosFortaleza #LiberatoMotosCar');
    expect(text).not.toContain('42.000 km');
    expect(text).not.toContain('Vermelha');
  });
});
