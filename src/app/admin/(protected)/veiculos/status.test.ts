import { describe, expect, it } from 'vitest';
import { allowedStatusTransitions } from '@/server/vehicles/validation';
import { actionLabels, badgeClassName, statusLabels } from './status';

const styles = { badge_draft: 'd', badge_published: 'p', badge_reserved: 'r', badge_sold: 's', badge_archived: 'a', badge: 'b' };

describe('estados do veículo', () => {
  it('tem rótulo e classe de etiqueta para cada um dos cinco estados', () => {
    for (const status of Object.keys(allowedStatusTransitions)) {
      expect(statusLabels[status as keyof typeof statusLabels]).toBeTruthy();
      expect(badgeClassName(styles, status)).not.toContain('undefined');
      expect(badgeClassName(styles, status)).toContain(styles[`badge_${status}` as keyof typeof styles]);
    }
  });

  it('nunca produz "undefined" nem para estado desconhecido', () => {
    expect(badgeClassName(styles, 'qualquer')).toBe('b');
    expect(badgeClassName({}, 'draft')).not.toContain('undefined');
  });

  it('tem rótulo de ação para todo destino possível', () => {
    for (const targets of Object.values(allowedStatusTransitions)) for (const target of targets) expect(actionLabels[target]).toBeTruthy();
  });
});
