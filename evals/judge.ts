/**
 * Eval do juiz de política (tarefa 4.3 aplicada à guarda semântica).
 *
 *   OPENROUTER_API_KEY=... npm run eval:judge
 *
 * Cada caso saiu de uma conversa real ou de uma violação que a política proíbe. Os que
 * `deveBloquear: false` são os falsos positivos que a guarda por regex produzia — é neles que
 * a arquitetura anterior falhava, e é por eles que vale medir.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';

const aqui = dirname(fileURLToPath(import.meta.url));

type Caso = {
  id: string; frase: string; veiculos: string[]; customerText?: string;
  deveBloquear: boolean; porque: string;
};

async function main() {
  loadEnvConfig(join(aqui, '..'));
  const { judgeAgentReply } = await import('@/server/agent/judge');
  const { getAgentProviderConfig } = await import('@/server/agent/provider');
  const modelo = process.env.AGENT_JUDGE_MODEL?.trim()
    || (await import('@/server/agent/judge')).DEFAULT_JUDGE_MODEL;
  getAgentProviderConfig(modelo);

  const casos: Caso[] = readFileSync(join(aqui, 'judge-cases.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Caso);

  console.log(`Juiz: ${modelo} | ${casos.length} casos\n`);
  let falsoPositivo = 0, falsoNegativo = 0;

  for (const caso of casos) {
    const veiculos = caso.veiculos.map((texto, i) => ({
      id: `v${i}`, titulo: texto.split(' — ')[0].replace(/\s+\d{4}$/, ''),
      marca: texto.split(' ')[0], modelo: texto.split(' ').slice(1, 3).join(' '),
      tipo: 'motorcycle' as const, ano: Number(texto.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0) || null,
      quilometragem: null, cor: null,
      precoCentavos: Number((texto.split('R$ ')[1] ?? '0').replace(/\D/g, '')) * 100, slug: `v${i}`,
    }));
    const v = await judgeAgentReply({ reply: caso.frase, veiculos, customerText: caso.customerText });
    const bloqueou = !v.ok;
    const certo = bloqueou === caso.deveBloquear;
    if (!certo && bloqueou) falsoPositivo++;
    if (!certo && !bloqueou) falsoNegativo++;
    console.log(`${certo ? 'ok   ' : 'ERRO '} ${caso.id.padEnd(26)} ${caso.deveBloquear ? 'deve bloquear' : 'deve passar  '}`
      + (certo ? '' : ` -> ${bloqueou ? 'bloqueou: ' + (v as { detail: string }).detail : 'passou'}`));
    await new Promise((ok) => setTimeout(ok, 1200));
  }

  const acertos = casos.length - falsoPositivo - falsoNegativo;
  console.log(`\n${'='.repeat(56)}`);
  console.log(`acertos            ${acertos}/${casos.length}`);
  console.log(`falso positivo     ${falsoPositivo}  (bloqueou resposta correta — era o defeito da regex)`);
  console.log(`falso negativo     ${falsoNegativo}  (deixou passar violação real)`);
  console.log('='.repeat(56));
  process.exit(falsoPositivo + falsoNegativo > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
