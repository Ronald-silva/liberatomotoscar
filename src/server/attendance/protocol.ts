/** Protocolo curto exibido na caixa de entrada do painel. */
export function protocolOf(conversationId: string) {
  return conversationId.replace(/-/g, '').slice(0, 8).toUpperCase();
}
