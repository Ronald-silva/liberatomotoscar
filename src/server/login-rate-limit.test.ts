import { describe, expect, it } from 'vitest';
import { createLoginLimiter } from './login-rate-limit';

describe('limite de início de login', () => {
  it('bloqueia excesso e reabre após a janela', () => {
    const consume = createLoginLimiter(2, 60_000);
    expect(consume(1_000).allowed).toBe(true);
    expect(consume(2_000).allowed).toBe(true);
    expect(consume(3_000)).toEqual({ allowed: false, retryAfterSeconds: 58 });
    expect(consume(61_000).allowed).toBe(true);
  });
});
