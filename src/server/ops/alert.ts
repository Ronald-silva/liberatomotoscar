/**
 * Destino para os incidentes que antes só existiam em `console.error`. O log de um serviço
 * serverless não acorda ninguém: `cliente_sem_atendimento` e `encaminhamento_nao_registrado`
 * precisam chegar a uma pessoa enquanto o cliente ainda está esperando.
 *
 * O caminho mais simples que avisa alguém de verdade é um webhook de entrada: a mesma chamada
 * serve Slack (`text`), Discord (`content`) e qualquer automação que leia o corpo em JSON. Não
 * exige dependência nova, conta de APM nem segredo além da própria URL.
 *
 * Nada do cliente entra no payload: só o identificador da conversa, que é interno e sem o qual
 * o aviso não serve para nada. Telefone, nome e texto da mensagem nunca saem daqui.
 */
export type OpsAlert = {
  evento: string;
  resumo: string;
  conversationId?: string | null;
  motivo?: string | null;
  detalhe?: string | null;
};

export type OpsAlertOutcome = 'enviado' | 'sem_destino' | 'falhou';

function destino(): string | null {
  const bruto = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!bruto) return null;
  try {
    const url = new URL(bruto);
    // http só em desenvolvimento local: um alerta carrega id de conversa e sai da rede da loja.
    const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Nunca lança e nunca demora: é chamada de dentro do caminho de erro do webhook, onde uma
 * exceção ou uma espera longa reabriria exatamente o problema que o alerta denuncia.
 */
export async function notifyOps(
  alert: OpsAlert,
  send: typeof fetch = fetch,
): Promise<OpsAlertOutcome> {
  const url = destino();
  const em = new Date().toISOString();
  if (!url) {
    console.error('[ops] alerta sem destino configurado', JSON.stringify({
      evento: 'alerta_sem_destino', alerta: alert.evento, conversationId: alert.conversationId ?? null, em,
    }));
    return 'sem_destino';
  }

  const texto = [
    `🚨 Liberato Motos Car — ${alert.resumo}`,
    `evento: ${alert.evento}`,
    alert.conversationId ? `conversa: ${alert.conversationId}` : null,
    alert.motivo ? `motivo: ${alert.motivo}` : null,
    alert.detalhe ? `detalhe: ${alert.detalhe}` : null,
    `em: ${em}`,
  ].filter(Boolean).join('\n');

  try {
    const resposta = await send(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origem: 'liberato-motos-car',
        severidade: 'alerta',
        evento: alert.evento,
        conversationId: alert.conversationId ?? null,
        motivo: alert.motivo ?? null,
        detalhe: alert.detalhe ?? null,
        em,
        // `text` e `content` fazem a mesma mensagem aparecer legível no Slack e no Discord.
        text: texto,
        content: texto,
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!resposta.ok) {
      console.error('[ops] destino do alerta recusou', JSON.stringify({
        evento: 'alerta_recusado', alerta: alert.evento, status: resposta.status, em,
      }));
      return 'falhou';
    }
    return 'enviado';
  } catch (erro) {
    console.error('[ops] envio do alerta falhou', JSON.stringify({
      evento: 'alerta_falhou', alerta: alert.evento,
      detalhe: erro instanceof Error ? erro.message : String(erro), em,
    }));
    return 'falhou';
  }
}
