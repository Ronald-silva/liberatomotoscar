import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkAgentReply } from './guards';
import { createAgentTurnState, type VerifiedVehicle } from './tools';

/**
 * A guarda ficou só com a conferência de FATO. A decisão semântica — promessa, negociação,
 * aceite, afirmação de estoque — saiu para `judge.ts`, e os casos dela vivem em
 * `evals/judge-cases.jsonl`, medidos por `npm run eval:judge` contra modelo real.
 *
 * Esta suíte garante as duas pontas: o que é mecânico continua sendo pego, e o que é semântico
 * NÃO é mais decidido aqui — porque decidir semântica por regex foi o que produziu 41% de falso
 * positivo numa conversa real de troca.
 */
const fazer: VerifiedVehicle = {
  id: '11111111-1111-4111-8111-111111111111', titulo: 'Yamaha Fazer 250 Flex 8000',
  marca: 'Yamaha', modelo: 'Fazer 250', tipo: 'motorcycle', ano: 2014,
  quilometragem: 72_000, cor: 'Branca', precoCentavos: 1_050_000, slug: 'fazer',
};

function comEstoque() {
  const s = createAgentTurnState();
  s.allowedVehicles.set(fazer.id, fazer);
  return s;
}

const check = (text: string, state = createAgentTurnState(), customerText?: string) =>
  checkAgentReply({ text, finishReason: 'stop', state, customerText });

describe('conferência mecânica: o que a guarda ainda decide', () => {
  it('bloqueia valor que nenhuma ferramenta devolveu', () => {
    expect(check('A Yamaha Fazer 250 sai por R$ 8.000,00.', comEstoque()).ok).toBe(false);
    expect(check('A entrada fica em R$ 1.950.', comEstoque()).ok).toBe(false);
    expect(check('A parcela fica em 1.999 por mês.', comEstoque()).ok).toBe(false);
  });

  it('não deixa dígito do campo versão virar valor permitido', () => {
    // `titulo` tem "Flex 8000"; `modelo` não. R$ 8.000 segue sendo inventado.
    expect(check('Essa moto sai por R$ 8.000 hoje.', comEstoque()).ok).toBe(false);
  });

  it('deixa passar o preço e a quilometragem do cadastro', () => {
    expect(check('A Yamaha Fazer 250 2014 está R$ 10.500,00, com 72.000 km.', comEstoque()).ok).toBe(true);
  });

  it('deixa passar quantidade e ano fora de contexto de dinheiro', () => {
    expect(check('Tenho 3 motos agora, uma delas é 2014.', comEstoque()).ok).toBe(true);
  });

  it('deixa passar número que o próprio cliente informou, inclusive por extenso', () => {
    expect(check('Anotei: 40.000 km.', createAgentTurnState(), 'ela tem 40 mil km').ok).toBe(true);
  });

  it('bloqueia link e telefone de terceiro, e deixa passar os da loja', () => {
    expect(check('Olha em bit.ly/promo.').ok).toBe(false);
    expect(check('Liga no 85 9 8812 3344.').ok).toBe(false);
    expect(check('Veja em https://olx.com.br/moto').ok).toBe(false);
  });

  it('bloqueia id de veículo vazado', () => {
    expect(check('O veículo 33333333-3333-4333-8333-333333333333 está disponível.').ok).toBe(false);
  });

  it('bloqueia resposta vazia e truncada', () => {
    expect(checkAgentReply({ text: '', finishReason: 'stop', state: createAgentTurnState() }).ok).toBe(false);
    expect(checkAgentReply({ text: 'Claro, me conta qual', finishReason: 'length',
      state: createAgentTurnState() }).ok).toBe(false);
  });
});

describe('o que a guarda NÃO decide mais, e por quê', () => {
  /**
   * Todas estas saíram de conversas reais, reprovadas estando CORRETAS. Se alguma voltar a ser
   * bloqueada aqui, é sinal de que a decisão semântica voltou para a regex — que é exatamente a
   * arquitetura que falhou.
   */
  it.each([
    'Não quero te garantir uma condição que eu não sei se existe.',
    'Vale a garantia legal do Código de Defesa do Consumidor.',
    'Aceitamos cartão de crédito, Pix e dinheiro.',
    'Desconto e condição especial quem trata é o vendedor.',
    'No momento não tenho nenhuma Fan no estoque.',
    'Essa conta eu não consigo fazer por aqui, porque o valor da sua Titan só sai na avaliação presencial.',
    'A loja trabalha com troca, sempre mediante avaliação presencial.',
  ])('a conferência mecânica não opina sobre: %s', (frase) => {
    const v = check(frase, comEstoque());
    expect(v.ok, !v.ok ? `${v.violation}: ${v.detail}` : '').toBe(true);
  });
});

describe('a cobertura semântica existe, só mudou de lugar', () => {
  const casos = readFileSync(new URL('../../../evals/judge-cases.jsonl', import.meta.url), 'utf8')
    .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as
      { id: string; frase: string; deveBloquear: boolean; porque: string });

  it('o corpus do juiz cobre as duas direções', () => {
    expect(casos.filter((c) => c.deveBloquear).length).toBeGreaterThanOrEqual(8);
    expect(casos.filter((c) => !c.deveBloquear).length).toBeGreaterThanOrEqual(8);
    for (const c of casos) expect(c.porque, c.id).toBeTruthy();
  });

  it('inclui os falsos positivos que a regex produzia em produção', () => {
    const ids = new Set(casos.map((c) => c.id));
    for (const id of ['recusa-valor-troca', 'nao-tem-no-estoque', 'aceita-cartao', 'garantia-legal']) {
      expect(ids, `o corpus do juiz perdeu ${id}`).toContain(id);
    }
  });
});
