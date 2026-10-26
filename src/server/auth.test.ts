import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminAuthConfigured, isAllowedGoogleProfile, allowedAdminEmails } from './auth-policy';

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

  it('aceita qualquer conta da lista separada por vírgula', () => {
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', 'Proprietario@Example.com, Gerente@Example.com');
    expect(isAllowedGoogleProfile('google', { email: 'proprietario@example.com', email_verified: true })).toBe(true);
    expect(isAllowedGoogleProfile('google', { email: 'gerente@example.com', email_verified: true })).toBe(true);
    expect(isAllowedGoogleProfile('google', { email: 'terceiro@example.com', email_verified: true })).toBe(false);
  });

  it('mantém as demais exigências para cada conta da lista', () => {
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', 'proprietario@example.com,gerente@example.com');
    expect(isAllowedGoogleProfile('google', { email: 'gerente@example.com', email_verified: false })).toBe(false);
    expect(isAllowedGoogleProfile('credentials', { email: 'gerente@example.com', email_verified: true })).toBe(false);
    expect(isAllowedGoogleProfile('google', { email: 'gerente@example.com' })).toBe(false);
  });

  it('tolera espaços e vírgula sobrando na lista', () => {
    vi.stubEnv('AUTH_GOOGLE_ID', 'id');
    vi.stubEnv('AUTH_GOOGLE_SECRET', 'segredo');
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', '  proprietario@example.com ,  gerente@example.com , ');
    expect(isAdminAuthConfigured()).toBe(true);
    expect(isAllowedGoogleProfile('google', { email: 'gerente@example.com', email_verified: true })).toBe(true);
  });

  it('fecha o acesso quando qualquer conta da lista está malformada', () => {
    vi.stubEnv('AUTH_GOOGLE_ID', 'id');
    vi.stubEnv('AUTH_GOOGLE_SECRET', 'segredo');
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', 'proprietario@example.com,gerente-sem-arroba');
    expect(isAdminAuthConfigured()).toBe(false);
  });

  it('fecha o acesso quando a lista não tem nenhuma conta', () => {
    vi.stubEnv('AUTH_GOOGLE_ID', 'id');
    vi.stubEnv('AUTH_GOOGLE_SECRET', 'segredo');
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', ' , , ');
    expect(isAdminAuthConfigured()).toBe(false);
    expect(isAllowedGoogleProfile('google', { email: 'proprietario@example.com', email_verified: true })).toBe(false);
  });
});

// Consumida também por scripts/grant-admin-development.ts, que fica fora do alcance dos testes.
// Antes de ser compartilhada, o script tinha a própria cópia da leitura e parou de achar a conta
// quando uma segunda foi acrescentada ao ADMIN_GOOGLE_EMAIL — sem quebrar o login.
describe('lista de contas administrativas', () => {
  it('separa por vírgula, apara espaços e normaliza a caixa', () => {
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', ' Proprietario@Example.com , Gerente@Example.com ');
    expect(allowedAdminEmails()).toEqual(['proprietario@example.com', 'gerente@example.com']);
  });

  it('devolve uma só quando há uma só, sem vírgula sobrando', () => {
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', 'unico@example.com');
    expect(allowedAdminEmails()).toEqual(['unico@example.com']);
  });

  it('devolve lista vazia quando a variável está ausente ou vazia', () => {
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', '');
    expect(allowedAdminEmails()).toEqual([]);
    vi.stubEnv('ADMIN_GOOGLE_EMAIL', ' , ');
    expect(allowedAdminEmails()).toEqual([]);
  });
});
