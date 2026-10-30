import { describe, expect, it } from 'vitest';
import { STORE } from '@/data/store';
import { AGENT_SYSTEM_PROMPT } from './prompt';

describe('prompt de sistema', () => {
  it('codifica as decisões comerciais da Fase 0', () => {
    // 0.1 escopo: qualificar e encaminhar, sem negociar.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/não negocia desconto/i);
    // 0.2 troca: nunca estimar valor, avaliação presencial.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/NUNCA diz quanto vale/i);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/sempre presencial/i);
  });

  it('manda usar o que a loja confirmou em vez de encaminhar tudo', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('podeAfirmar');
    expect(AGENT_SYSTEM_PROMPT).toContain('precisaConfirmarComAloja');
  });

  it('proíbe narrar as próprias correções', () => {
    // Em duas conversas reais o agente gastou a mensagem se retratando:
    // "corrigindo o que te falei" e "desconsidere o que eu disse".
    expect(AGENT_SYSTEM_PROMPT).toMatch(/não narre correções/i);
  });

  it('fala o nome real da loja, não uma persona removida', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(STORE.name);
    expect(AGENT_SYSTEM_PROMPT).not.toMatch(/\bDayse\b/);
  });
});
