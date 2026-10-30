import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const { runAgentTurn } = await import('@/server/agent/run');
  type M = { id: string; sender: string; body: string; cards: unknown };
  const out: string[] = [];
  let bloq = 0, tot = 0;
  for (let i = 0; i < 2; i++) {
    const history: M[] = [];
    for (const p of ['Oi', 'quero trocar minha moto numa lander', 'Titan 2002', 'tem 40 mil km',
                     'ta conservada, documentacao em dia', 'quanto fica a diferenca?']) {
      const r = await runAgentTurn({ conversationId: 't3-'+i, message: p, history: history as never });
      tot++;
      if (!r.guard.ok) { bloq++; out.push(`BLOQ r${i} [${p}] ${r.guard.violation} -> ${r.guard.detail} :: ${JSON.stringify((r.modelText ?? '').slice(0,110))}`); }
      history.push({ id: 'u'+history.length, sender: 'visitor', body: p, cards: null });
      history.push({ id: 'a'+history.length, sender: 'ai', body: r.reply.body, cards: r.reply.cards });
      await new Promise((ok) => setTimeout(ok, 7000));
    }
  }
  console.log('\n===== RESUMO =====');
  for (const l of out) console.log(l);
  console.log(`${bloq} bloqueios em ${tot} turnos`);
}
main().then(()=>process.exit(0)).catch((e)=>{console.error(e.message);process.exit(1);});
