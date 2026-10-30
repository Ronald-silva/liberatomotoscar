/**
 * Ensaio manual da Dayse ponta a ponta. Usa o `handleSiteTurn` de produção com um repositório
 * em memória, então o roteamento, o contexto de troca, a fila de vendedor e o acúmulo de fatos
 * são os reais — nada é reimplementado aqui. Somente SELECT no Neon + consumo OpenRouter.
 *
 *   npx tsx scripts/ensaio-dayse.ts --execute-local
 *   npx tsx scripts/ensaio-dayse.ts --execute-local --cenario=troca
 *   npx tsx scripts/ensaio-dayse.ts --execute-local --cenario=troca --whatsapp
 */
import { randomUUID } from 'node:crypto';
import { loadEnvConfig } from '@next/env';
import type { SiteChatDeps } from '@/server/attendance/site-chat';
import type { ConversationRow, MessageRow } from '@/server/attendance/conversation-repository';

if (!process.argv.includes('--execute-local')) {
  console.error('Use --execute-local após autorizar o consumo da chave OpenRouter.');
  process.exit(2);
}

loadEnvConfig(process.cwd());

const asWhatsApp = process.argv.includes('--whatsapp');
const pedido = process.argv.find((arg) => arg.startsWith('--cenario='))?.split('=')[1] ?? 'todos';

const CENARIOS: Record<string, { titulo: string; nome: string; mensagens: string[] }> = {
  consultoria: {
    titulo: 'Consultoria — primeira moto, pós-venda e encerramento',
    nome: 'Ronald',
    mensagens: [
      'Boa tarde',
      'é a primeira moto da minha vida, tenho medo de fazer uma má escolha',
      'eu rodo muito no centro, trânsito pesado, o que você sugere?',
      'quanto custa a Fazer?',
      'achei caro, consegue melhorar?',
      'e se eu nao gostar depois posso trocar?',
      'tem algo com 2 anos de garantia?',
      'obrigado, vou pensar',
    ],
  },
  troca: {
    titulo: 'Troca multi-turno — moto própria como entrada',
    nome: 'Ronald',
    mensagens: [
      'Boa tarde',
      'Aceitam uma moto que tenho como entrada?',
      'é uma Honda Pop',
      '2019',
      'tem 18.000 km',
      '????',
      'quero trocar na Fazer, dando 3 mil de entrada também',
    ],
  },
  bicicleta: {
    titulo: 'Troca fora do nicho — bicicleta elétrica como entrada',
    nome: 'Ronald',
    mensagens: [
      'Boa tarde',
      'Tenho uma bicicleta elétrica avaliada em 2 mil reais. Vcs recebe de entrada para a compra de uma Bros?',
      'aceita?',
      'e se eu quiser uma moto do estoque mesmo?',
    ],
  },
};

async function main() {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY ausente.');
  const [
    { handleSiteTurn, siteChatDeps },
    repo,
    { formatDayseWhatsAppReply },
  ] = await Promise.all([
    import('@/server/attendance/site-chat'),
    import('@/server/attendance/conversation-repository'),
    import('@/server/whatsapp/outbound'),
  ]);
  let totalInput = 0;
  let totalOutput = 0;
  let chamadasModelo = 0;

  async function rodar(chave: string) {
    const cenario = CENARIOS[chave]!;
    // Repositório em memória com a mesma semântica da transação real (fatos e dono da conversa).
    const now = new Date();
    const conversa: ConversationRow = {
      id: randomUUID(), channel: 'site', tokenHash: 'hash', owner: 'automation', status: 'open',
      assignedTo: null, facts: [], visitorTurns: 0, turnLockedUntil: null, handoffRequestedAt: null,
      createdAt: now, lastMessageAt: now, expiresAt: new Date(now.getTime() + 86_400_000),
      closedAt: null, closedBy: null,
    };
    const mensagens: MessageRow[] = [];
    const novaMensagem = (campos: Partial<MessageRow>): MessageRow => ({
      id: randomUUID(), conversationId: conversa.id, sender: 'visitor', body: '', cards: null,
      authorUserId: null, clientMessageId: null, createdAt: new Date(), ...campos,
    } as MessageRow);

    const deps: SiteChatDeps = {
      ...siteChatDeps,
      readSetting: async () => ({ mode: 'ai' }),
      findByToken: async () => conversa,
      create: async () => ({ token: 'x'.repeat(43), conversation: conversa }),
      appendVisitor: async (_id, body, clientMessageId) => {
        if (mensagens.some((m) => m.clientMessageId === clientMessageId)) {
          return { duplicate: true as const, message: null };
        }
        const message = novaMensagem({ sender: 'visitor', body, clientMessageId });
        mensagens.push(message);
        conversa.visitorTurns += 1;
        return { duplicate: false as const, message };
      },
      // O tipo inferido do repositório real não admite null, mas o site-chat trata `!reserved`.
      reserveTurn: (async () =>
        conversa.owner === 'automation' && conversa.status === 'open'
          ? conversa : null) as SiteChatDeps['reserveTurn'],
      releaseTurn: async () => { conversa.turnLockedUntil = null; },
      commit: async (_id, reply) => {
        if (conversa.owner !== 'automation' || conversa.status !== 'open') return null;
        const message = novaMensagem({
          sender: reply.sender, body: reply.body, cards: reply.cards.length ? reply.cards : null,
        });
        mensagens.push(message);
        if (reply.facts?.length) {
          conversa.facts = [
            ...conversa.facts.filter((old: ConversationRow['facts'][number]) =>
              !reply.facts!.some((n) => n.field === old.field)),
            ...reply.facts,
          ].slice(-7);
        }
        if (reply.handoffReason) {
          conversa.handoffRequestedAt = conversa.handoffRequestedAt ?? new Date();
          if (repo.handoffPausesAutomation(reply.handoffReason)) conversa.owner = 'human';
        }
        return message;
      },
      readConversation: async () => conversa,
      listMessages: async (_id, limit = 60) => mensagens.slice(-limit),
      reserveAi: async () => { chamadasModelo += 1; return { dayUtc: new Date().toISOString().slice(0, 10) }; },
      // Mesmo ponto onde a produção contabiliza o consumo do turno.
      recordTokens: async (_day, input, output) => { totalInput += input; totalOutput += output; },
    };

    console.log('\n' + '█'.repeat(78));
    console.log(`CENÁRIO: ${cenario.titulo}${asWhatsApp ? '  [renderizado como WhatsApp]' : ''}`);
    console.log('█'.repeat(78));

    for (const mensagem of cenario.mensagens) {
      let resposta: string | null = null;
      let pausada = false;
      try {
        const r = await handleSiteTurn('t'.repeat(43), {
          message: mensagem, clientMessageId: randomUUID(), customerName: cenario.nome,
        }, deps);
        const reply = r.view.messages.find((m) => m.id === r.replyMessageId);
        if (reply) {
          resposta = asWhatsApp
            ? formatDayseWhatsAppReply(reply.body, reply.cards)
            : reply.body + (reply.cards.length ? `\n        anúncios: ${reply.cards.map((c) => c.title).join(' | ')}` : '');
        } else {
          pausada = true;
        }
      } catch (error) {
        resposta = `⚠ ${(error as Error).message}`;
      }
      console.log('\n' + '─'.repeat(78));
      console.log(`CLIENTE: ${mensagem}`);
      if (pausada) {
        console.log('DAYSE: (sem resposta — conversa já está na fila do vendedor)');
      } else {
        console.log(`DAYSE: ${resposta}`);
      }
    }
    console.log(`\n→ dono da conversa: ${conversa.owner}`);
    const fatos = conversa.facts.map((f: ConversationRow['facts'][number]) => `${f.field}="${f.quote}"`);
    console.log(`→ fatos coletados: ${fatos.join(' · ') || '(nenhum)'}`);
  }

  const chaves = pedido === 'todos' ? Object.keys(CENARIOS) : [pedido];
  for (const chave of chaves) {
    if (!CENARIOS[chave]) throw new Error(`Cenário desconhecido: ${chave}`);
    await rodar(chave);
  }
  console.log('\n' + '═'.repeat(78));
  console.log(`Chamadas ao modelo: ${chamadasModelo}  ·  tokens ${totalInput} entrada / ${totalOutput} saída`);
}

main().catch((error) => { console.error(error); process.exit(1); });
