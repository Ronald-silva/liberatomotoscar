import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { attendanceIncidents } from '@/server/db/schema';

/**
 * Incidente e encaminhamento do atendimento, gravados para serem **lidos numa tela**.
 *
 * A Fase 0 passou a contar `falhasOperacionais` e a registrar `encaminhado_<motivo>`,
 * `encaminhamento_nao_registrado` e `cliente_sem_atendimento` — tudo em `console`. Log de função
 * serverless não acorda ninguém e ninguém abre o painel da Vercel para conferir se um cliente
 * ficou sem vendedor ontem. Este módulo é a única razão pela qual o lojista pode ver isso.
 */

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

export type IncidentChannel = 'site' | 'whatsapp';
export type IncidentRegistro = 'completo' | 'parcial' | 'nenhum';

export type AttendanceIncidentInput = {
  channel: IncidentChannel;
  evento: string;
  motivo?: string | null;
  registro?: IncidentRegistro | null;
  conversationId?: string | null;
};

/** O webhook passa `conversationIdForTurn ?? ''` em alguns caminhos; '' não é uuid e vira null. */
const conversationIdSchema = z.uuid();

/**
 * Grava o incidente. **Nunca lança e nunca atrasa o atendimento**: é chamada de dentro do caminho
 * de erro do webhook, onde uma exceção reabriria exatamente o problema que o incidente denuncia.
 *
 * O retorno é honesto sobre o que aconteceu, porque quem chama registra o resultado no log: se o
 * banco está fora do ar, nem o incidente é gravado, e a tela não tem como saber disso. É por isso
 * que `notifyOps` continua existindo — ele é o caminho que não passa pelo Postgres.
 */
export async function recordAttendanceIncident(
  input: AttendanceIncidentInput,
  /**
   * Resolvido DENTRO do try, e não como valor padrão do parâmetro: `getDb()` sem `DATABASE_URL`
   * lança de forma síncrona, e um lançamento síncrono escaparia por fora da Promise — direto para
   * o caminho de erro do webhook, que é o último lugar que pode receber uma exceção nova.
   */
  db?: Pick<ReturnType<typeof getDb>, 'insert'>,
): Promise<'gravado' | 'falhou'> {
  const parsed = input.conversationId ? conversationIdSchema.safeParse(input.conversationId) : null;
  try {
    await (db ?? getDb()).insert(attendanceIncidents).values({
      channel: input.channel,
      evento: input.evento,
      motivo: input.motivo ?? null,
      registro: input.registro ?? null,
      conversationId: parsed?.success ? parsed.data : null,
    });
    return 'gravado';
  } catch (erro) {
    console.error('[ops] incidente não pôde ser gravado', JSON.stringify({
      evento: 'incidente_nao_gravado', incidente: input.evento,
      detalhe: erro instanceof Error ? erro.message : String(erro), em: new Date().toISOString(),
    }));
    return 'falhou';
  }
}

export type IncidentWindow = { channel: IncidentChannel; since: Date };

/** Uma linha por combinação evento/motivo/registro: é assim que a tela mostra "por motivo". */
export function buildIncidentBreakdownQuery(db: Db, { channel, since }: IncidentWindow) {
  return db.select({
    evento: attendanceIncidents.evento,
    motivo: attendanceIncidents.motivo,
    registro: attendanceIncidents.registro,
    total: sql<number>`count(*)::int`,
  }).from(attendanceIncidents)
    .where(and(eq(attendanceIncidents.channel, channel), gte(attendanceIncidents.occurredAt, since)))
    .groupBy(attendanceIncidents.evento, attendanceIncidents.motivo, attendanceIncidents.registro);
}

/**
 * As conversas que ninguém garantiu que chegaram ao vendedor, com id e hora — o lojista precisa
 * poder ABRIR a conversa, não só saber que existem três.
 */
export function buildUnattendedConversationsQuery(db: Db, { channel, since }: IncidentWindow, limite = 20) {
  return db.select({
    conversationId: attendanceIncidents.conversationId,
    evento: attendanceIncidents.evento,
    motivo: attendanceIncidents.motivo,
    occurredAt: attendanceIncidents.occurredAt,
  }).from(attendanceIncidents)
    .where(and(
      eq(attendanceIncidents.channel, channel),
      gte(attendanceIncidents.occurredAt, since),
      sql`${attendanceIncidents.evento} in ('cliente_sem_atendimento', 'encaminhamento_nao_registrado')`,
    ))
    .orderBy(desc(attendanceIncidents.occurredAt))
    .limit(limite);
}

export type IncidentBreakdownRow = {
  evento: string;
  motivo: string | null;
  registro: string | null;
  total: number;
};

/**
 * Os dois eventos que o webhook conta como `falhasOperacionais`: cliente esperando **sem
 * confirmação de que alguém foi avisado**. A tela usa a mesma definição do contador para que o
 * número da tela e o do ensaio real possam ser comparados sem tradução.
 */
const EVENTOS_DE_FALHA = ['cliente_sem_atendimento', 'encaminhamento_nao_registrado'] as const;

export const motivoLabels: Record<string, string> = {
  teto_conversa: 'teto de mensagens da conversa',
  sem_cota_loja: 'cota diária de IA da loja',
  infraestrutura: 'falha de infraestrutura',
  menu_legado: 'canal em modo menu (legado)',
  envio_falhou: 'a Meta recusou o envio',
  turno_estourou: 'o turno estourou no webhook',
};

export function deriveIncidentSummary(rows: IncidentBreakdownRow[]) {
  const porMotivo = new Map<string, number>();
  const falhasPorEvento = new Map<string, number>();
  let encaminhamentos = 0;
  let falhasOperacionais = 0;

  for (const row of rows) {
    if (row.evento.startsWith('encaminhado_')) {
      const motivo = row.motivo ?? row.evento.slice('encaminhado_'.length);
      porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + row.total);
      encaminhamentos += row.total;
      continue;
    }
    if ((EVENTOS_DE_FALHA as readonly string[]).includes(row.evento)) {
      const chave = row.motivo ? `${row.evento}:${row.motivo}` : row.evento;
      falhasPorEvento.set(chave, (falhasPorEvento.get(chave) ?? 0) + row.total);
      falhasOperacionais += row.total;
    }
  }

  /**
   * `semRegistro` conta o evento dedicado, não `registro === 'nenhum'` em qualquer linha.
   *
   * Um encaminhamento sem registro gera DUAS linhas: `encaminhamento_nao_registrado`, no momento
   * em que o banco não confirmou nada, e `encaminhado_<motivo>` com `registro: 'nenhum'`, se o
   * envio ao cliente depois deu certo. Somar `registro = 'nenhum'` contaria a mesma conversa duas
   * vezes — e, pior, se o envio falhasse a segunda linha não existiria, então a soma oscilaria
   * conforme o envio, não conforme o incidente.
   */
  const semRegistro = rows
    .filter((row) => row.evento === 'encaminhamento_nao_registrado')
    .reduce((soma, row) => soma + row.total, 0);

  return {
    encaminhamentos,
    encaminhamentosPorMotivo: [...porMotivo].map(([motivo, total]) => ({
      motivo, rotulo: motivoLabels[motivo] ?? motivo, total,
    })).sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo)),
    falhasOperacionais,
    falhasPorEvento: [...falhasPorEvento].map(([chave, total]) => {
      const [evento, motivo = null] = chave.split(':');
      return { evento, motivo, rotulo: motivo ? motivoLabels[motivo] ?? motivo : null, total };
    }).sort((a, b) => b.total - a.total || a.evento.localeCompare(b.evento)),
    semRegistro,
  };
}

export type IncidentSummary = ReturnType<typeof deriveIncidentSummary>;
