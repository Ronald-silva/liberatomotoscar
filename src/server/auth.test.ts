import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminAuthConfigured, isAllowedGoogleProfile } from './auth-policy';

afterEach(() => vi.unstubAllEnvs());

describe('entrada Google permitida', () => {
  it('permanece fechada quando falta configuração', () => {
    vi.stubEnv('AUTH_GOOGLE_ID', '');
    vi.stubEnv('AUTH_GOOGLE_SECRET', '');
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', '');
    vi.stubEnv('AUTH_SECRET', '');
    expect(isAdminAuthConfigured()).toBe(false);
  });

  it('aceita somente a conta exata com e-mail confirmado pelo Google', () => {
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', 'Proprietario@Example.com');
    expect(isAllowedGoogleProfile('google', { email: 'proprietario@example.com', email_verified: true })).toBe(true);
    expect(isAllowedGoogleProfile('google', { email: 'outro@example.com', email_verified: true })).toBe(false);
    expect(isAllowedGoogleProfile('google', { email: 'proprietario@example.com', email_verified: false })).toBe(false);
    expect(isAllowedGoogleProfile('credentials', { email: 'proprietario@example.com', email_verified: true })).toBe(false);
    expect(isAllowedGoogleProfile('google', { email: 'proprietario@example.com' })).toBe(false);
  });
});
