// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Attribution } from '@/lib/attribution';
import { trackVehicleView, trackWhatsAppClick } from '@/lib/analytics';

const fbq = vi.fn();
const gtag = vi.fn();
const attribution: Attribution = {} as Attribution;

beforeEach(() => {
  fbq.mockReset();
  gtag.mockReset();
  Object.assign(window, { fbq, gtag, __liberatoAnalyticsLoaded: true });
});
afterEach(() => {
  Object.assign(window, { __liberatoAnalyticsLoaded: false });
});

it('manda ao Pixel a categoria real do veículo, não a da vitrine de prévia', () => {
  trackVehicleView('honda-cg-160-titan-2021', 'motorcycle', attribution);
  expect(fbq).toHaveBeenCalledWith('track', 'ViewContent', expect.objectContaining({
    content_ids: ['honda-cg-160-titan-2021'], content_category: 'motorcycle',
  }));
  expect(JSON.stringify(fbq.mock.calls)).not.toContain('vitrine_ilustrativa');
});

it('carro e moto deixam de cair na mesma categoria inventada', () => {
  trackVehicleView('fiat-mobi-2022', 'car', attribution);
  trackVehicleView('honda-biz-2020', 'motorcycle', attribution);
  const categorias = fbq.mock.calls.map(([, , detalhes]) =>
    (detalhes as { content_category: string }).content_category);
  expect(categorias).toEqual(['car', 'motorcycle']);
});

it('não dispara nada antes do script de medição carregar', () => {
  Object.assign(window, { __liberatoAnalyticsLoaded: false });
  trackVehicleView('fiat-mobi-2022', 'car', attribution);
  trackWhatsAppClick('um veículo', 'ficha', attribution);
  expect(fbq).not.toHaveBeenCalled();
  expect(gtag).not.toHaveBeenCalled();
});
