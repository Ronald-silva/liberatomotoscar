import { describe, expect, it } from 'vitest';
import { STORE_POLICY, resumoDaPolitica } from '@/data/store-policy';
import { AGENT_SYSTEM_PROMPT } from './prompt';

describe('não ter o veículo hoje não é um "não"', () => {
  it('a rotatividade é fato confirmado da loja e chega ao agente', () => {
    expect(STORE_POLICY.rotatividade).toMatch(/gira|rotativ|chegar/i);
    expect(resumoDaPolitica().confirmado).toHaveProperty('rotatividade');
  });

  it('manda anotar o modelo e falar da rotatividade, sem prometer retorno', () => {
    // O lojista respondeu que a loja NÃO avisa quando chega. A oferta de aviso saiu.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/QUANDO NÃO TEM O QUE A PESSOA QUER/);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Anote o modelo/i);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/estoque gira rápido/i);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/nunca prometa data de chegada/i);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/NUNCA ofereça avisar quando chegar/);
  });
});

describe('praticidade: a regra mais importante é ser curto', () => {
  it('o prompt pede uma ou duas frases, não duas ou três', () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Uma ou duas frases/);
  });

  it('proíbe narrar os bastidores a cada mensagem', () => {
    // "já anotei", "já passei pro vendedor" apareciam em toda resposta da conversa real.
    expect(AGENT_SYSTEM_PROMPT).toMatch(/não anuncie o que você está fazendo nos bastidores/i);
  });

  it('não tem instrução duplicada, que dilui o que é prioridade', () => {
    for (const regra of ['Uma pergunta por mensagem', 'Nunca reinicie a conversa']) {
      expect(AGENT_SYSTEM_PROMPT.split(regra).length - 1, regra).toBe(1);
    }
  });
});
