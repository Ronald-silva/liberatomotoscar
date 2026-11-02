import { and, count, eq, inArray, notExists } from 'drizzle-orm';
import { closeDb, getDb } from '@/server/db/client';
import { conversationMessages, conversations } from '@/server/db/schema';

// O chat do site nunca existiu como tela: sobraram conversas `site` sem nenhuma fala. Este script
// só enxerga essas — canal `site`, zero turnos do visitante e nenhuma linha em
// `conversation_messages`. Conversas do WhatsApp, a linha `site` de `channel_settings`, sua
// auditoria e `demo_ai_usage` ficam intactas.
const vazias = () => and(
  eq(conversations.channel, 'site'),
  eq(conversations.visitorTurns, 0),
  notExists(getDb().select({ um: conversationMessages.id }).from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversations.id))),
);

async function main() {
  const executar = process.argv[2] === '--execute-local';
  try {
    const servidor = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'DATABASE_URL ausente';
    console.log(`Banco: ${servidor}`);
    const [{ total }] = await getDb().select({ total: count() }).from(conversations).where(vazias());
    console.log(`Conversas do site sem nenhuma mensagem: ${total}.`);
    if (!executar) {
      console.log('Simulação: nada foi apagado. Para apagar, rode de novo com --execute-local.');
      return;
    }
    const ids = (await getDb().select({ id: conversations.id }).from(conversations).where(vazias())).map((row) => row.id);
    // Reaplica o filtro na própria exclusão: se uma mensagem chegou no meio do caminho, a conversa fica.
    const apagadas = ids.length === 0 ? [] : await getDb().delete(conversations)
      .where(and(inArray(conversations.id, ids), vazias())).returning({ id: conversations.id });
    console.log(`Apagadas: ${apagadas.length}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha ao limpar as conversas do site.');
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
