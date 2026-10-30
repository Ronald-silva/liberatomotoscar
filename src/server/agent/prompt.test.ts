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

  it('usa o nome da loja e a persona que o lojista escolheu', () => {
    // O nome Dayse voltou por decisão do lojista no questionário. O que foi removido em 36444eb
    // foi o motor de regex, não o nome — são coisas diferentes.
    expect(AGENT_SYSTEM_PROMPT).toContain(STORE.name);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Você é a Dayse/);
  });
});
