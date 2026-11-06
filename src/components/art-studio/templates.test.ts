import { expect, it } from 'vitest';
import * as templates from './templates';
import { artBadges, badgesForStatus } from './templates';

it('o tema claro e o quadrado saíram', () => {
  expect(artBadges.map((b) => b.id)).not.toContain('classic');
});

it('as dimensões saíram daqui: quem precisa de formato lê do destino', () => {
  expect(Object.keys(templates)).not.toContain('artFormats');
  expect(Object.keys(templates)).not.toContain('ART_THEMES');
});

it('vendido e reservado não oferecem selo de oferta', () => {
  expect(badgesForStatus('sold').map((b) => b.id)).toEqual(['sold']);
  expect(badgesForStatus('reserved').map((b) => b.id)).toEqual(['reserved']);
  expect(badgesForStatus('published').map((b) => b.id)).toEqual(['new', 'highlight', 'offer']);
});
