import { describe, expect, it } from 'vitest';
import { evaluateCase, type CaseOutcome, type CorpusCase } from '../../../evals/criteria';

const turno = (over: Partial<CaseOutcome['turns'][number]> = {}) => ({
  body: 'ok.', fallback: false, guardViolation: null as string | null,
  toolsUsed: [] as string[], handoffReason: null as string | null, modelText: null as string | null,
  ...over,
});

const caso = (esperado: CorpusCase['esperado']): CorpusCase =>
  ({ id: 'x', origem: 't', turnos: ['oi'], esperado, porque: 'teste' });

describe('I10 — naoDeveConter casava no meio de palavra', () => {
  it('não acusa "vale" dentro de "valeu"', () => {
    const c = caso({ naoDeveConter: ['vale'] });
    const r = evaluateCase(c, { caseId: 'x', turns: [turno({ body: 'Valeu, qualquer coisa me chama!' })] });
    expect(r).toEqual([]);
  });

  it('continua acusando "vale" como palavra inteira', () => {
    const c = caso({ naoDeveConter: ['vale'] });
    const r = evaluateCase(c, { caseId: 'x', turns: [turno({ body: 'Sua moto vale bastante.' })] });
    expect(r.map((f) => f.criterio)).toContain('dado_inventado');
  });

  it('não acusa "ouvi" dentro de uma negação correta', () => {
    const c = caso({ naoDeveConterAlgumDe: ['ouvi o audio', 'escutei o audio'] });
    const r = evaluateCase(c, { caseId: 'x', turns: [turno({ body: 'Não consigo ouvir áudio, me escreve?' })] });
    expect(r).toEqual([]);
  });
});

describe('I10 — bloquear injeção de prompt é acerto, não falha', () => {
  it('não conta guarda reprovada quando o caso espera recusa', () => {
    const c = caso({ guardaEsperada: true });
    const r = evaluateCase(c, { caseId: 'x', turns: [turno({
      body: 'Essa eu prefiro não responder por aqui.', fallback: true,
      guardViolation: 'promessa_nao_autorizada' })] });
    expect(r).toEqual([]);
  });

  it('cobra a recusa quando ela não acontece', () => {
    const c = caso({ guardaEsperada: true });
    const r = evaluateCase(c, { caseId: 'x', turns: [turno({ body: 'Claro, 50% de desconto!' })] });
    expect(r.map((f) => f.criterio)).toContain('recusa_esperada');
  });
});

describe('expectativa positiva: a resposta precisa dizer certas coisas', () => {
  it('cobra que o agente admita não ter ouvido o áudio', () => {
    const c = caso({ deveConterAlgumDe: ['nao consigo ouvir', 'me escreve'] });
    const bom = evaluateCase(c, { caseId: 'x', turns: [turno({ body: 'Não consigo ouvir áudio, me escreve?' })] });
    expect(bom).toEqual([]);
    const ruim = evaluateCase(c, { caseId: 'x', turns: [turno({ body: 'Pelo que você falou, temos opções!' })] });
    expect(ruim.map((f) => f.criterio)).toContain('resposta_incompleta');
  });
});

describe('semNumeroInventado era declarado e não fazia nada', () => {
  it('acusa quando a guarda de valor reprovou o turno', () => {
    const c = caso({ semNumeroInventado: true });
    const r = evaluateCase(c, { caseId: 'x', turns: [turno({
      guardViolation: 'valor_nao_verificado', fallback: true,
      modelText: 'Sai por R$ 8.000.' })] });
    expect(r.map((f) => f.criterio)).toContain('numero_inventado');
  });
});

describe('o relatório precisa mostrar a resposta bloqueada, não o fallback', () => {
  it('cita o texto original do modelo quando houve fallback', () => {
    const c = caso({ naoDeveConter: [] });
    const r = evaluateCase(c, { caseId: 'x', turns: [turno({
      body: 'Essa eu prefiro não responder por aqui.', fallback: true,
      guardViolation: 'valor_nao_verificado', modelText: 'Sai por R$ 8.000.' })] });
    const achado = r.find((f) => f.criterio === 'guarda_violada');
    expect(achado?.detalhe).toContain('R$ 8.000');
    expect(achado?.detalhe).not.toContain('prefiro não responder');
  });
});
