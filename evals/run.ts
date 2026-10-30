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

function lerCorpus(): CorpusCase[] {
  const bruto = readFileSync(join(aqui, 'corpus.jsonl'), 'utf8').trim();
  return bruto.split('\n').filter(Boolean).map((linha) => JSON.parse(linha) as CorpusCase);
}

type RunAgentTurn = typeof import('@/server/agent/run').runAgentTurn;

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
  const arquivo = join(dir, `${modelId.replace(/\//g, '_')}.jsonl`);
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
