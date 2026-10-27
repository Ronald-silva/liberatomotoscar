/** Ensaio manual de inferência real: somente SELECT no Neon e consumo OpenRouter. */
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { loadEnvConfig } from '@next/env';

if (!process.argv.includes('--execute-local')) {
  console.error('Use --execute-local após autorizar consumo e conferir a chave OpenRouter.');
  process.exit(2);
}

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY ausente.');
  const [{ runDemoAgent }, { getVehicleDetails }, { getDb }, { vehicles }, { eq }] = await Promise.all([
    import('@/server/ai/demo-agent'), import('@/server/vehicles/agent-catalog'),
    import('@/server/db/client'), import('@/server/db/schema'), import('drizzle-orm'),
  ]);
  type Session = Parameters<typeof runDemoAgent>[0];
  const session = (turns: Session['turns'] = [], facts: Session['facts'] = []): Session => ({
    v: 2, sessionId: randomUUID(), adminUserId: 'smoke-local', expiresAt: Date.now() + 30 * 60_000,
    handoffRequested: false, facts, turns,
  });
  let totalInput = 0;
  let totalOutput = 0;
  let usedModel = '';
  async function runCase(name: string, context: Session, message: string) {
    const progress: string[] = [];
    const observations: unknown[] = [];
    const result = await runDemoAgent(context, message, (status) => progress.push(status), undefined,
      (event) => observations.push(event));
    assert(progress.includes('inventory_checked'), `${name}: busca de estoque não observada`);
    totalInput += result.usage.inputTokens;
    totalOutput += result.usage.outputTokens;
    usedModel = result.model;
    console.log(JSON.stringify({ case: name, model: result.model, progress, observations, stage: result.lead.stage,
      factFields: result.lead.facts.map((fact) => fact.field), cards: result.cards.map((card) => ({
        title: card.title, priceCents: card.priceCents, href: card.href,
      })), handoff: result.handoffRequested, usage: result.usage }));
    return result;
  }

  const firstMessage = 'Quero uma moto para trabalhar até 18 mil';
  const budget = await runCase('moto_orcamento', session(), firstMessage);
  assert(budget.cards.length > 0, 'moto_orcamento: nenhum anúncio retornado');
  for (const card of budget.cards) {
    assert(card.type === 'motorcycle' && card.priceCents <= 1_800_000, 'moto_orcamento: filtro incorreto');
    assert((await getVehicleDetails({ id: card.id })).item, 'moto_orcamento: anúncio não publicado');
  }
  if (process.argv.includes('--only-budget')) return;

  const trade = await runCase('troca', session([{ user: firstMessage, assistant: budget.answer }], budget.lead.facts),
    'Tenho uma Fan para dar na troca. O que você recomenda?');
  assert(trade.lead.facts.some((fact) => fact.field === 'trade_in'), 'troca: interesse não identificado');
  assert(trade.lead.facts.some((fact) => fact.field === 'budget'), 'troca: orçamento anterior perdido');
  assert(trade.handoffRequested && trade.handoffUrl, 'troca: passagem humana não oferecida');
  if (process.argv.includes('--only-trade')) return;

  const human = await runCase('humano', session(), 'Quero falar com um vendedor, por favor.');
  assert(human.handoffRequested && human.handoffUrl, 'humano: passagem humana não oferecida');

  const nonexistent = await runCase('inexistente', session(), 'Tem a moto modelo ZZ-Inexistente-2099?');
  assert(nonexistent.cards.length === 0, 'inexistente: anúncio incompatível apresentado');

  const [sold] = await getDb().select({ id: vehicles.id, brand: vehicles.brand, model: vehicles.model })
    .from(vehicles).where(eq(vehicles.status, 'sold')).limit(1);
  if (sold) {
    const soldAsk = await runCase('vendido', session(), `A ${sold.brand} ${sold.model} já vendida está disponível?`);
    assert(!soldAsk.cards.some((card) => card.id === sold.id), 'vendido: anúncio encerrado recomendado');
  }
  const catalog = await fetch(`https://openrouter.ai/api/v1/models?q=${encodeURIComponent(usedModel)}`);
  const modelInfo = catalog.ok ? (await catalog.json()).data?.find((item: { id: string }) => item.id === usedModel) : null;
  const inputRate = Number(modelInfo?.pricing?.prompt);
  const outputRate = Number(modelInfo?.pricing?.completion);
  const estimatedUsdAtListedRate = Number.isFinite(inputRate) && Number.isFinite(outputRate)
    ? Number((totalInput * inputRate + totalOutput * outputRate).toFixed(6)) : null;
  console.log(JSON.stringify({ totalUsage: { inputTokens: totalInput, outputTokens: totalOutput }, usedModel,
    estimatedUsdAtListedRate, note: 'Tarifa base pública pode variar por provedor/horário; conferir cobrança real no OpenRouter.' }));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('Smoke real falhou:', error instanceof Error && error.message === 'OPENROUTER_API_KEY ausente.'
    ? error.message : error && typeof error === 'object' && 'code' in error ? String(error.code)
      : error instanceof Error ? error.name : 'erro desconhecido');
  process.exit(1);
});
