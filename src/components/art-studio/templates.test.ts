import { expect, it } from 'vitest';
import { artFormats, templatesForStatus } from './templates';

it('mantém as dimensões corretas para os quatro destinos de exportação', () => {
  expect(Object.values(artFormats).map(({ width, height }) => [width, height]))
    .toEqual([[1080, 1350], [1080, 1080], [1080, 1920], [1080, 1920]]);
});

it('não apresenta oferta de disponível a anúncio reservado ou vendido', () => {
  expect(templatesForStatus('reserved').map(({ id }) => id)).toEqual(['reserved', 'classic']);
  expect(templatesForStatus('sold').map(({ id }) => id)).toEqual(['sold', 'classic']);
});
