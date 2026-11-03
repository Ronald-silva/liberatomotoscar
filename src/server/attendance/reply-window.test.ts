import { expect, it } from 'vitest';
import { replyWindowState } from './reply-window';

const now = new Date('2026-11-03T15:00:00Z');

it('permite texto livre somente dentro de 24 horas da última mensagem do cliente', () => {
  expect(replyWindowState(new Date('2026-11-02T15:00:01Z'), now)).toBe('open');
  expect(replyWindowState(new Date('2026-11-02T15:00:00Z'), now)).toBe('closed');
  expect(replyWindowState(new Date('2026-11-01T15:00:00Z'), now)).toBe('closed');
  expect(replyWindowState(null, now)).toBe('unknown');
});
