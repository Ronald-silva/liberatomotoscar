/**
 * Runner da eval (tarefa 4.2). Roda o corpus contra um modelo real e grava as respostas, para
 * que a tarefa 4.5 possa comparar sem gastar token em cada PR.
 *
 *   OPENROUTER_API_KEY=... OPENROUTER_MODEL=anthropic/claude-sonnet-5-5 npm run eval
 *
 * Gasta dinheiro de verdade: cada caso é uma conversa com o modelo, com consulta ao banco.
 * Exige DATABASE_URL apontando para um banco com estoque, porque o ponto da eval é justamente
 * medir o agente com dado real — mockar o catálogo mediria o mock.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import { evaluateCase, summarize, type CaseOutcome, type CorpusCase, type Finding } from './criteria';

const aqui = dirname(fileURLToPath(import.meta.url));

/**
 * `--limit=N` e `--only=id,id` existem para o teste de fumaça: a rodada inteira gasta crédito
 * de verdade, e descobrir que o pipeline está quebrado no caso 1 de 60 é caro demais.
 */
function lerCorpus(): CorpusCase[] {
  const bruto = readFileSync(join(aqui, 'corpus.jsonl'), 'utf8').trim();
  const todos = bruto.split('\n').filter(Boolean).map((linha) => JSON.parse(linha) as CorpusCase);
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8));
  const filtrados = only?.length ? todos.filter((c) => only.includes(c.id)) : todos;
  return Number.isSafeInteger(limit) && limit > 0 ? filtrados.slice(0, limit) : filtrados;
}

type RunAgentTurn = typeof import('@/server/agent/run').runAgentTurn;

/**
 * Contas novas no OpenRouter têm teto de 20 requisições/minuto nos modelos Anthropic, e um
 * turno gasta 1 a 3 chamadas. Sem ritmo, 14% dos turnos voltavam como erro de upstream e a
 * comparação media o rate limit, não o modelo. Não afeta produção: 150 chamadas por dia numa
 * concessionária não chega perto disso.
 */
const PAUSA_ENTRE_CASOS_MS = Number(process.env.EVAL_PAUSA_MS ?? 6_000);

function pausar(ms: number) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function rodarCaso(runAgentTurn: RunAgentTurn, caso: CorpusCase): Promise<CaseOutcome> {
  const turns: CaseOutcome['turns'] = [];
  const history: { id: string; sender: string; body: string; cards: unknown }[] = [];

  for (const mensagem of caso.turnos) {
    const r = await runAgentTurn({
      conversationId: `eval-${caso.id}`,
      message: mensagem,
      history: history as never,
    });
    turns.push({
      body: r.reply.body,
      modelText: r.modelText,
      fallback: r.fallback,
      guardViolation: r.guard.ok ? null : r.guard.violation,
      toolsUsed: r.toolsUsed,
      handoffReason: r.reply.handoffReason ?? null,
    });
    history.push({ id: `u${history.length}`, sender: 'visitor', body: mensagem, cards: null });
    history.push({ id: `a${history.length}`, sender: 'ai', body: r.reply.body, cards: r.reply.cards });
  }
  return { caseId: caso.id, turns };
}

/** Em main() porque o alvo é CJS (sem "type": "module"), que não aceita await de topo. */
async function main() {
  // loadEnvConfig precisa rodar antes de qualquer módulo ler process.env, daí o import tardio.
  loadEnvConfig(join(aqui, '..'));
  const { runAgentTurn } = await import('@/server/agent/run');
  const { getAgentProviderConfig } = await import('@/server/agent/provider');

  const { modelId } = getAgentProviderConfig();
  const corpus = lerCorpus();
  console.log(`Rodando ${corpus.length} casos (${corpus.reduce((a, c) => a + c.turnos.length, 0)} turnos) em ${modelId}\n`);

  const resultados: CaseOutcome[] = [];
  const achados: Finding[] = [];
  for (const [i, caso] of corpus.entries()) {
    if (i > 0) await pausar(PAUSA_ENTRE_CASOS_MS);
    const outcome = await rodarCaso(runAgentTurn, caso);
    resultados.push(outcome);
    const doCaso = evaluateCase(caso, outcome);
    achados.push(...doCaso);
    const marca = doCaso.length === 0 ? 'ok   ' : 'FALHA';
    console.log(`${String(i + 1).padStart(3)}/${corpus.length} ${marca} ${caso.id}`
      + (doCaso.length ? `\n        ${doCaso.map((f) => `${f.criterio}: ${f.detalhe}`).join('\n        ')}` : ''));
  }

  const dir = join(aqui, 'resultados');
  mkdirSync(dir, { recursive: true });
  const parcial = corpus.length < 60 ? '.parcial' : '';
  const arquivo = join(dir, `${modelId.replace(/\//g, '_')}${parcial}.jsonl`);
  writeFileSync(arquivo, `${resultados.map((r) => JSON.stringify({ ...r, modelId })).join('\n')}\n`);

  const casosComFalha = new Set(achados.map((f) => f.caseId)).size;
  console.log(`\n${'='.repeat(62)}`);
  console.log(`modelo              ${modelId}`);
  console.log(`casos               ${corpus.length}`);
  console.log(`casos sem achado    ${corpus.length - casosComFalha}`);
  console.log(`casos com achado    ${casosComFalha}`);
  console.log('-'.repeat(62));
  for (const [criterio, n] of summarize(achados)) console.log(`${criterio.padEnd(32)} ${n}`);
  console.log('='.repeat(62));
  console.log(`respostas gravadas em ${arquivo}`);

  process.exit(casosComFalha > 0 ? 1 : 0);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
