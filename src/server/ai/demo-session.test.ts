import { describe, expect, it } from 'vitest';
import { readDemoSession, signDemoSession, InvalidDemoSessionError } from './demo-session';

const secret = 'segredo-longo-apenas-para-teste-de-sessao';

describe('estado assinado da conversa', () => {
  it('preserva contexto sem permitir que o navegador altere falas anteriores', () => {
    const session = readDemoSession(null, 'admin-1', secret, 1_000);
    const token = signDemoSession({ ...session, turns: [{ user: 'Quero uma moto', assistant: 'Qual orçamento?' }] }, secret);
    expect(readDemoSession(token, 'admin-1', secret, 1_001).turns[0].user).toBe('Quero uma moto');
    const [payload, mac] = token.split('.');
    const changed = Buffer.from(Buffer.from(payload, 'base64url').toString('utf8').replace('moto', 'carro')).toString('base64url');
    expect(() => readDemoSession(`${changed}.${mac}`, 'admin-1', secret, 1_001)).toThrow(InvalidDemoSessionError);
  });

  it('recusa sessão de outro administrador e sessão expirada', () => {
    const token = signDemoSession(readDemoSession(null, 'admin-1', secret, 1_000), secret);
    expect(() => readDemoSession(token, 'admin-2', secret, 1_001)).toThrow(InvalidDemoSessionError);
    expect(() => readDemoSession(token, 'admin-1', secret, 1_801_001)).toThrow(InvalidDemoSessionError);
  });
});
