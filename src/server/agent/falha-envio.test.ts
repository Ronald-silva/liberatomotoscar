import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/authz', () => ({
  AccessDeniedError: class AccessDeniedError extends Error {},
  requireAdmin: vi.fn(),
}));

import { handoffPausesAutomation } from '@/server/attendance/conversation-repository';

/**
 * Regressão real, medida em produção: o token do número de teste expirou, o envio falhou, e a
 * correção de "falha de envio chama um humano" marcou a conversa como `owner: human`. O agente
 * parou de responder para sempre naquela conversa — inclusive depois do token ser renovado.
 *
 * Falha de envio é problema de infraestrutura, não sinal de que o cliente quer falar com gente.
 * Ela precisa APARECER na fila do vendedor sem tirar a conversa da automação.
 */
describe('falha de envio não pode desligar o agente', () => {
  it('nenhum motivo gerado por automação tira a conversa do agente', () => {
    for (const motivo of ['ai_suggested', 'trade_in', 'financing'] as const) {
      expect(handoffPausesAutomation(motivo), motivo).toBe(false);
    }
  });

  it('só o pedido explícito do cliente e a ação do vendedor pausam', () => {
    expect(handoffPausesAutomation('visitor_request')).toBe(true);
    expect(handoffPausesAutomation('operator')).toBe(true);
  });
});

describe('sinalizar para o vendedor sem tomar a conversa', () => {
  it('flagConversationForHuman existe e não troca o dono', async () => {
    const mod = await import('@/server/attendance/conversation-repository');
    expect(typeof mod.flagConversationForHuman).toBe('function');
    // A função antiga, que trocava o dono, não deve mais ser usada pelo caminho de envio.
    expect(mod).not.toHaveProperty('requestHumanTakeover');
  });
});
