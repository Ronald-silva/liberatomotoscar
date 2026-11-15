import { purgeExpiredConversations } from '@/server/attendance/conversation-repository';
import { retryPendingR2Cleanup } from '@/server/storage/cleanup';

/**
 * Rotina de retenção. As duas funções abaixo existiam sem chamador: conversa expirada não saía
 * do banco e objeto órfão não saía do R2. Cada etapa é isolada porque elas falham por motivos
 * diferentes (Neon indisponível × R2 sem credencial) e uma não pode impedir a outra de rodar.
 */
export type RetentionStep =
  | { status: 'ok'; detalhe: Record<string, number> }
  | { status: 'falhou'; erro: string };

export type RetentionRunResult = {
  conversas: RetentionStep;
  arquivos: RetentionStep;
  /** Etapas que falharam. Zero é o único resultado aceitável para o agendamento. */
  falhas: number;
  em: string;
};

export type RetentionDeps = {
  purgeConversations?: () => Promise<Record<string, number>>;
  retryStorageCleanup?: () => Promise<Record<string, number>>;
};

/** Nome do erro, nunca a mensagem: ela pode carregar URL de conexão ou chave do bucket. */
function safeErrorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : 'UnknownError';
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : 'RetentionError';
}

async function step(nome: string, executar: () => Promise<Record<string, number>>): Promise<RetentionStep> {
  try {
    return { status: 'ok', detalhe: await executar() };
  } catch (erro) {
    console.error('[retencao] etapa falhou', JSON.stringify({
      evento: 'retencao_etapa_falhou', etapa: nome, erro: safeErrorCode(erro),
      detalhe: erro instanceof Error ? erro.message : String(erro), em: new Date().toISOString(),
    }));
    return { status: 'falhou', erro: safeErrorCode(erro) };
  }
}

export async function runRetention(deps: RetentionDeps = {}): Promise<RetentionRunResult> {
  const purge = deps.purgeConversations ?? (() => purgeExpiredConversations());
  const retry = deps.retryStorageCleanup ?? (() => retryPendingR2Cleanup());

  const conversas = await step('conversas', purge);
  const arquivos = await step('arquivos', retry);
  const falhas = [conversas, arquivos].filter((etapa) => etapa.status === 'falhou').length;

  console.info('[retencao] execução concluída', JSON.stringify({
    evento: 'retencao_executada', conversas, arquivos, falhas, em: new Date().toISOString(),
  }));

  return { conversas, arquivos, falhas, em: new Date().toISOString() };
}
