import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  evaluateCase, MAX_CARACTERES_RESPOSTA, type CaseOutcome, type CorpusCase,
} from '../../../evals/criteria';
import { checkAgentReply } from './guards';
import { createAgentTurnState, type VerifiedVehicle } from './tools';

/**
 * 4.5 — regressão do corpus em CI, sem chamar modelo.
 *
 * Rodar o corpus contra um modelo real em cada PR custa dinheiro e é não determinístico: um PR
 * reprovaria por sorte do sampling. O que esta suíte trava é o que de fato interferia entre
 * correções na versão anterior — as guardas e os critérios. A medição de QUALIDADE do modelo é
 * `npm run eval`, deliberada e paga; o resultado dela fica em evals/resultados/.
 */
const corpus: CorpusCase[] = readFileSync(
  new URL('../../../evals/corpus.jsonl', import.meta.url), 'utf8',
).trim().split('\n').filter(Boolean).map((linha) => JSON.parse(linha) as CorpusCase);

describe('4.1 corpus de avaliação', () => {
  it('está bem formado e cada caso diz qual defeito documenta', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(60);
    for (const caso of corpus) {
      expect(caso.id, JSON.stringify(caso)).toMatch(/^[a-z0-9-]+$/);
      expect(caso.turnos.length, caso.id).toBeGreaterThan(0);
      expect(caso.porque, caso.id).toBeTruthy();
      expect(Object.keys(caso.esperado).length, caso.id).toBeGreaterThan(0);
    }
  });

  it('não tem id duplicado', () => {
    const ids = corpus.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cobre as quatro falhas de produção que derrubaram a versão anterior', () => {
    const ids = new Set(corpus.map((c) => c.id));
    for (const id of ['financiamento-verbo-fazer', 'ar-condicionado', 'troca-de-oleo', 'banco-rasgado']) {
      expect(ids, `o corpus perdeu o caso ${id}`).toContain(id);
    }
  });
});

describe('4.3 critérios automáticos', () => {
  const caso = corpus.find((c) => c.id === 'troca-de-oleo')!;

  it('aprova a resposta correta do caso', () => {
    const outcome: CaseOutcome = { caseId: caso.id, turns: [{
      body: 'Troca de óleo a gente não faz por aqui, só compra e venda de veículo. Procura moto ou carro?',
      fallback: false, guardViolation: null, toolsUsed: [], handoffReason: null,
    }] };
    expect(evaluateCase(caso, outcome)).toEqual([]);
  });

  it('reprova o defeito que o caso documenta: troca de óleo virando troca de veículo', () => {
    const outcome: CaseOutcome = { caseId: caso.id, turns: [{
      body: 'Que legal! Me conta o ano e a quilometragem da sua moto.',
      fallback: false, guardViolation: null, toolsUsed: ['buscar_veiculos'], handoffReason: 'trade_in',
    }] };
    const criterios = evaluateCase(caso, outcome).map((f) => f.criterio);
    expect(criterios).toContain('handoff_indevido');
    expect(criterios).toContain('estoque_consultado_a_toa');
  });

  it('reprova guarda violada, resposta longa e pergunta repetida', () => {
    const multiTurno = corpus.find((c) => c.turnos.length > 1)!;
    const outcome: CaseOutcome = { caseId: multiTurno.id, turns: [
      { body: 'Qual é o seu orçamento para a compra?', fallback: false,
        guardViolation: null, toolsUsed: [], handoffReason: null },
      { body: `${'x'.repeat(MAX_CARACTERES_RESPOSTA + 1)} Qual é o seu orçamento para a compra?`,
        fallback: true, guardViolation: 'valor_nao_verificado', toolsUsed: [], handoffReason: null },
    ] };
    const criterios = evaluateCase(multiTurno, outcome).map((f) => f.criterio);
    expect(criterios).toContain('guarda_violada');
    expect(criterios).toContain('resposta_longa');
    expect(criterios).toContain('pergunta_repetida');
  });
});

/**
 * A metade que faltava. A suíte só assertava RECUSA, então uma "correção" que apertasse a
 * guarda até o agente mal conseguir falar passava verde — e era exatamente o que estava
 * acontecendo: "Aceitamos cartão" era reprovada, e isso é uma das falhas de produção da
 * seção 1.2 do plano, quebrada de novo pelo outro lado.
 */
describe('4.5 as guardas continuam DEIXANDO PASSAR o português correto', () => {
  const cg: VerifiedVehicle = {
    id: '11111111-1111-4111-8111-111111111111', titulo: 'Honda CG 160 Start Flex 8000',
    marca: 'Honda', modelo: 'CG 160 Start', tipo: 'motorcycle', ano: 2022,
    quilometragem: 21_000, cor: 'Vermelha', precoCentavos: 1_250_000, slug: 'cg',
  };
  function comEstoque() {
    const s = createAgentTurnState();
    s.allowedVehicles.set(cg.id, cg);
    return s;
  }
  function buscouSemAchar(marca: string) {
    const s = createAgentTurnState();
    s.searchedBrands.add(marca);
    return s;
  }

  const boas: [string, () => ReturnType<typeof createAgentTurnState>][] = [
    ['Aceitamos cartão sim, o vendedor confirma as condições com você.', createAgentTurnState],
    ['Separei 2 opções pra você, quer ver?', createAgentTurnState],
    ['Essa moto tem 3 anos de uso.', createAgentTurnState],
    ['Não trabalho com desconto por aqui, isso é com o vendedor.', createAgentTurnState],
    ['Não encontrei nenhuma Yamaha publicada agora, quer que eu veja outra marca?',
      () => buscouSemAchar('yamaha')],
    ['A Honda CG 160 Start está R$ 12.500, com 21.000 km rodados.', comEstoque],
    ['Temos a Honda CG 160 Start aqui na loja, quer ver as fotos?', comEstoque],
    ['A loja trabalha com troca, mediante avaliação presencial aqui na loja.', createAgentTurnState],
    ['Posso fazer a ponte com o vendedor agora mesmo.', createAgentTurnState],
    ['Não consigo ouvir áudio por aqui, me escreve o que você procura?', createAgentTurnState],
  ];

  it.each(boas)('deixa passar: %s', (frase, estado) => {
    const v = checkAgentReply({ text: frase, finishReason: 'stop', state: estado() });
    expect(v.ok, `a guarda bloqueou uma resposta correta: ${!v.ok ? v.violation + '/' + v.detail : ''}`).toBe(true);
  });

  it('dígito no campo versão do painel não vira número permitido', () => {
    // titulo tem "Flex 8000"; modelo não. R$ 8.000 continua sendo valor inventado.
    const v = checkAgentReply({ text: 'Essa moto sai por R$ 8.000 hoje.', finishReason: 'stop', state: comEstoque() });
    expect(v.ok).toBe(false);
  });
});

/**
 * As frases proibidas pelo corpus são decisão SEMÂNTICA e passaram a ser julgadas por modelo
 * (`judge.ts`), não por regex. A trava equivalente é `npm run eval:judge`, sobre
 * `evals/judge-cases.jsonl`, que mede as duas direções: bloquear a violação e DEIXAR PASSAR a
 * resposta correta. Era a segunda direção que a regex errava — 41% de falso positivo medido.
 *
 * O que esta suíte ainda garante em CI, de graça: que todo trecho proibido pelo corpus tenha um
 * caso correspondente no corpus do juiz. Sem isso, apagar uma regra deixaria de ser notado.
 */
describe('4.5 o corpus semântico tem quem o verifique', () => {
  const casosDoJuiz = readFileSync(
    new URL('../../../evals/judge-cases.jsonl', import.meta.url), 'utf8',
  ).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { deveBloquear: boolean });

  it('o corpus do juiz cobre violação e resposta correta nas duas direções', () => {
    expect(casosDoJuiz.filter((c) => c.deveBloquear).length).toBeGreaterThanOrEqual(8);
    expect(casosDoJuiz.filter((c) => !c.deveBloquear).length).toBeGreaterThanOrEqual(8);
  });

  it('todo caso do corpus que proíbe um trecho continua existindo', () => {
    const comProibicao = corpus.filter((c) =>
      (c.esperado.naoDeveConter?.length ?? 0) + (c.esperado.naoDeveConterAlgumDe?.length ?? 0) > 0);
    expect(comProibicao.length).toBeGreaterThanOrEqual(8);
  });
});
