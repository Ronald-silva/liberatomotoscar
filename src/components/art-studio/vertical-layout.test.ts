import { describe, expect, it } from 'vitest';
import { VERTICAL_LAYOUT, VERTICAL_SAFE, verticalPhotoBounds } from './vertical-layout';

describe('composição vertical', () => {
  it('mantém os dados essenciais acima dos controles inferiores das redes', () => {
    for (const box of [VERTICAL_LAYOUT.logo, VERTICAL_LAYOUT.kicker, VERTICAL_LAYOUT.title,
      VERTICAL_LAYOUT.year, VERTICAL_LAYOUT.priceLabel, VERTICAL_LAYOUT.price,
      VERTICAL_LAYOUT.contactLabel, VERTICAL_LAYOUT.phone, VERTICAL_LAYOUT.note]) {
      expect(box.x).toBeGreaterThanOrEqual(VERTICAL_SAFE.left);
      expect(box.x + box.width).toBeLessThanOrEqual(VERTICAL_SAFE.right);
      expect(box.y).toBeGreaterThanOrEqual(VERTICAL_SAFE.top);
      expect(box.y + box.height).toBeLessThanOrEqual(VERTICAL_SAFE.bottom);
    }
    expect(VERTICAL_LAYOUT.note.y + VERTICAL_LAYOUT.note.height).toBeLessThanOrEqual(1500);
    expect(VERTICAL_LAYOUT.photo.height).toBeGreaterThanOrEqual(500);
    expect(VERTICAL_LAYOUT.title.y + VERTICAL_LAYOUT.title.height).toBeLessThan(VERTICAL_LAYOUT.year.y);
    expect(VERTICAL_LAYOUT.photo.y + VERTICAL_LAYOUT.photo.height).toBeLessThan(VERTICAL_LAYOUT.priceLabel.y);
  });

  it('afasta a foto dos controles à direita no TikTok', () => {
    const story = verticalPhotoBounds('story');
    const tiktok = verticalPhotoBounds('tiktok');
    expect(tiktok.x + tiktok.width).toBeLessThan(story.x + story.width);
    expect(tiktok.height).toBe(story.height);
  });
});
