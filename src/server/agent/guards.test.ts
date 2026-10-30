import { describe, expect, it, vi } from 'vitest';
import { STORE, MAP_URL } from '@/data/store';
import { checkAgentReply, type GuardVerdict } from './guards';
import { createAgentTurnState, type VerifiedVehicle } from './tools';

const cg: VerifiedVehicle = {
  id: '11111111-1111-4111-8111-111111111111',
  titulo: 'Honda CG 160 Start', marca: 'Honda', modelo: 'CG 160 Start',
  tipo: 'motorcycle', ano: 2022, quilometragem: 18_400, cor: 'Vermelha',
  precoCentavos: 1_450_000, slug: 'honda-cg-160-2022',
};

function estadoCom(veiculos: VerifiedVehicle[] = [cg]) {
  const state = createAgentTurnState();
  for (const v of veiculos) state.allowedVehicles.set(v.id, v);
  return state;
}

function verifica(text: string, opcoes: { finishReason?: string; veiculos?: VerifiedVehicle[] } = {}): GuardVerdict {
  return checkAgentReply({
    text,
    finishReason: opcoes.finishReason ?? 'stop',
    state: estadoCom(opcoes.veiculos ?? [cg]),
  });
}

/**
 * Promessa, estimativa de troca e afirmação de estoque saíram desta suíte: são decisão
 * semântica, e agora é `judge.ts` quem decide, medido por `npm run eval:judge`. O que sobra
 * aqui é conferência de fato.
 */
describe('guardas de saída do agente', () => {
  it('3.1 bloqueia valor em reais que nenhuma ferramenta devolveu', () => {
    const v = verifica('Essa moto sai por R$ 8.000 hoje.');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.violation).toBe('valor_nao_verificado');
  });

  it('3.1 deixa passar o preço exato que a ferramenta devolveu', () => {
    expect(verifica('A Honda CG 160 Start está R$ 14.500,00.').ok).toBe(true);
  });

  it('3.1 deixa passar ano de modelo e quilometragem vindos da ferramenta', () => {
    expect(verifica('É uma 2022 com 18.400 km rodados.').ok).toBe(true);
  });

  it('3.1 bloqueia quilometragem que não é a do cadastro', () => {
    const v = verifica('É uma 2022 com 9.000 km rodados.');
    expect(v.ok).toBe(false);
  });



  it('3.2 deixa passar troca condicionada à avaliação presencial', () => {
    expect(verifica('A loja trabalha com troca, mediante avaliação presencial aqui na loja.').ok).toBe(true);
  });


  it('3.3 deixa passar o veículo que a ferramenta devolveu', () => {
    expect(verifica('Temos uma Honda CG 160 Start aqui na loja.').ok).toBe(true);
  });

  it('3.3 bloqueia id de veículo vazado na resposta', () => {
    const v = verifica('O veículo 33333333-3333-4333-8333-333333333333 está disponível.');
    expect(v.ok).toBe(false);
  });

  it('3.4 bloqueia resposta truncada pelo limite de tokens', () => {
    const v = verifica('Claro, me conta qual modelo você', { finishReason: 'length' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.violation).toBe('resposta_truncada');
  });

  it('3.4 bloqueia frase cortada no meio mesmo com finishReason stop', () => {
    const v = verifica('Claro, me conta qual modelo você');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.violation).toBe('resposta_truncada');
  });

  it('3.5 bloqueia link e e-mail que não são da loja', () => {
    expect(verifica('Veja em https://olx.com.br/moto').ok).toBe(false);
    expect(verifica('Manda um e-mail para vendas@outraloja.com').ok).toBe(false);
  });

  it('3.5 deixa passar o mapa e o telefone da loja', () => {
    expect(verifica(`Estamos na ${STORE.street}. Mapa: ${MAP_URL}`).ok).toBe(true);
    expect(verifica(`Nosso WhatsApp é ${STORE.phoneDisplay}.`).ok).toBe(true);
  });

  it('3.5 bloqueia telefone que não é o da loja', () => {
    const v = verifica('Liga no (85) 98888-7777 que resolvemos.');
    expect(v.ok).toBe(false);
  });

  it('bloqueia resposta vazia e resposta longa demais para o WhatsApp', () => {
    expect(verifica('   ').ok).toBe(false);
    expect(verifica(`${'Oi, tudo bem com você por aí hoje. '.repeat(40)}Abraço.`).ok).toBe(false);
  });

  it('3.6 toda rejeição gera log estruturado com a saída original', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = 'Essa moto sai por R$ 8.000 hoje.';
    checkAgentReply({ text: original, finishReason: 'stop', state: estadoCom(), conversationId: 'conv-123' });
    expect(warn).toHaveBeenCalledTimes(1);
    const registrado = JSON.parse(warn.mock.calls[0][1] as string);
    expect(registrado).toMatchObject({
      evento: 'guarda_reprovada', violacao: 'valor_nao_verificado',
      conversationId: 'conv-123', saidaOriginal: original,
    });
    expect(registrado.detalhe).toBeTruthy();
    warn.mockRestore();
  });

  it('não registra log quando a resposta passa', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkAgentReply({ text: 'A Honda CG 160 Start está R$ 14.500,00.', finishReason: 'stop', state: estadoCom() });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('marca citada depois de uma busca sem resultado', () => {
  it('deixa passar a resposta honesta sobre a marca que o modelo buscou e não achou', () => {
    const state = createAgentTurnState();
    state.searchedBrands.add('yamaha');
    const v = checkAgentReply({
      text: 'Não encontrei nenhuma Yamaha publicada no momento. Quer que eu veja outras marcas?',
      finishReason: 'stop', state,
    });
    expect(v.ok).toBe(true);
  });

});
