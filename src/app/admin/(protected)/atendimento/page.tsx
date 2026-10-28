import type { Metadata } from 'next';
import Link from 'next/link';
import {
  countInbox,
  getInboxConversation,
  inboxFilterSchema,
  listInbox,
  type InboxFilter,
} from '@/server/attendance/inbox';
import { protocolOf } from '@/server/attendance/site-chat';
import { listWhatsappTenants } from '@/server/whatsapp/embedded-signup';
import { InboxOperatorControls } from './InboxOperatorControls';
import { WhatsAppOnboardingCard } from './WhatsAppOnboardingCard';
import attendanceStyles from './attendance.module.css';

export const metadata: Metadata = { title: 'Atendimento · Dayse', robots: { index: false, follow: false } };

const senderLabels = {
  visitor: 'Cliente',
  bot: 'Dayse',
  ai: 'Dayse (IA)',
  human: 'Vendedor',
  system: 'Sistema',
} as const;
const eventLabels = {
  requested: 'Cliente pediu vendedor',
  assumed: 'Vendedor assumiu a conversa (IA pausada)',
  released: 'Conversa devolvida para a Dayse',
  closed: 'Conversa encerrada',
} as const;
const reasonLabels = {
  visitor_request: 'pedido do cliente',
  financing: 'financiamento',
  trade_in: 'veículo na troca',
  ai_suggested: 'encaminhamento da Dayse',
  operator: 'ação do vendedor',
} as const;
const factLabels: Record<string, string> = {
  category: 'Categoria',
  model: 'Modelo',
  budget: 'Orçamento',
  payment: 'Pagamento',
  trade_in: 'Troca',
  timeline: 'Prazo',
  visit: 'Visita',
  negotiation: 'Negociação',
  purpose: 'Finalidade',
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Fortaleza',
});

export default async function AttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ fila?: string | string[]; conversa?: string | string[] }>;
}) {
  const resolved = (await searchParams) ?? {};
  const rawFilter = Array.isArray(resolved.fila) ? resolved.fila[0] : resolved.fila;
  const rawConversation = Array.isArray(resolved.conversa) ? resolved.conversa[0] : resolved.conversa;
  const filter: InboxFilter = inboxFilterSchema.parse(rawFilter);

  const [counts, list, tenants] = await Promise.all([
    countInbox().catch(() => ({ waiting: 0, mine: 0, automation: 0 })),
    listInbox(filter).catch(() => []),
    listWhatsappTenants().catch(() => []),
  ]);

  const activeConversationId = rawConversation ?? list[0]?.id ?? null;
  const detail = activeConversationId
    ? await getInboxConversation(activeConversationId).catch(() => null)
    : null;

  const tabs: { id: InboxFilter; label: string }[] = [
    { id: 'waiting', label: `Aguardando vendedor (${counts.waiting})` },
    { id: 'mine', label: `Minhas conversas (${counts.mine})` },
    { id: 'automation', label: `Com a Dayse (${counts.automation})` },
    { id: 'closed', label: 'Encerradas' },
  ];

  const metaAppId = (process.env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID ?? '1727047121923909').trim();
  const metaConfigId = (
    process.env.META_EMBEDDED_SIGNUP_CONFIG_ID ??
    process.env.NEXT_PUBLIC_META_CONFIG_ID ??
    '1590518199231570'
  ).trim();

  return (
    <main id="conteudo" className={attendanceStyles.screen}>
      <div className={attendanceStyles.panel}>
        <Link href="/admin" className={attendanceStyles.back}>Voltar ao painel</Link>
        <h1>Atendimento · Dayse</h1>
        <p className={attendanceStyles.intro}>
          A Dayse atende os clientes automaticamente com base no estoque publicado. Para pausar a IA em qualquer conversa, basta clicar em <strong>Assumir conversa</strong> (ou responder direto pelo celular da loja no WhatsApp).
        </p>

        <WhatsAppOnboardingCard
          initialTenants={tenants}
          metaAppId={metaAppId}
          metaConfigId={metaConfigId}
        />

        <section aria-labelledby="inbox-title" className={attendanceStyles.inboxSection}>
          <div className={attendanceStyles.inboxHeader}>
            <h2 id="inbox-title">Conversas</h2>
          </div>
          <nav aria-label="Filtros da fila de atendimento" className={attendanceStyles.filterNav}>
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                href={`/admin/atendimento?fila=${tab.id}`}
                className={`${attendanceStyles.filterTab} ${filter === tab.id ? attendanceStyles.filterTabActive : ''}`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {list.length === 0 && !detail ? (
            <p className={attendanceStyles.current}>Nenhuma conversa neste filtro no momento.</p>
          ) : (
            <div className={attendanceStyles.inboxGrid}>
              <ul className={attendanceStyles.conversationList} aria-label="Conversas filtradas">
                {list.map((item) => {
                  const isSelected = detail?.conversation.id === item.id;
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/admin/atendimento?fila=${filter}&conversa=${item.id}`}
                        className={`${attendanceStyles.conversationLink} ${isSelected ? attendanceStyles.conversationLinkActive : ''}`}
                      >
                        <div className={attendanceStyles.conversationMeta}>
                          <strong>Atendimento #{protocolOf(item.id)}</strong>
                          <time dateTime={item.lastMessageAt.toISOString()}>
                            {dateFormatter.format(item.lastMessageAt)}
                          </time>
                        </div>
                        <div className={attendanceStyles.conversationMeta}>
                          <span>
                            {item.status === 'closed'
                              ? 'Encerrada'
                              : item.owner === 'human'
                                ? item.assignedTo
                                  ? 'Com vendedor (IA pausada)'
                                  : 'Aguardando vendedor'
                                : 'Com a Dayse (IA ativa)'}
                          </span>
                          <span>{item.visitorTurns} msg(s)</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {detail ? (
                <article className={attendanceStyles.conversationDetail} aria-label={`Conversa ${protocolOf(detail.conversation.id)}`}>
                  <header className={attendanceStyles.detailHeader}>
                    <div>
                      <h3>Atendimento #{protocolOf(detail.conversation.id)}</h3>
                      <p className={attendanceStyles.current}>
                        Status:{' '}
                        <strong>
                          {detail.conversation.status === 'closed'
                            ? 'Encerrada'
                            : detail.conversation.owner === 'human'
                              ? detail.conversation.assignedTo === detail.viewerUserId
                                ? 'Com você (Dayse pausada)'
                                : detail.conversation.assignedTo
                                  ? 'Com vendedor (Dayse pausada)'
                                  : 'Aguardando vendedor assumir'
                              : 'Atendida pela Dayse'}
                        </strong>
                      </p>
                    </div>
                  </header>

                  {detail.conversation.facts.length > 0 ? (
                    <ul className={attendanceStyles.factList} aria-label="Interesses informados pelo cliente">
                      {detail.conversation.facts.map((fact, idx) => (
                        <li key={`${fact.field}-${idx}`} className={attendanceStyles.factChip}>
                          <strong>{factLabels[fact.field] ?? fact.field}:</strong> “{fact.quote}”
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className={attendanceStyles.messageStream} aria-label="Histórico de mensagens">
                    {detail.messages.length === 0 ? (
                      <p className={attendanceStyles.current}>Nenhuma mensagem registrada.</p>
                    ) : (
                      detail.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`${attendanceStyles.messageBubble} ${
                            msg.sender === 'visitor'
                              ? attendanceStyles.messageVisitor
                              : msg.sender === 'human'
                                ? attendanceStyles.messageHuman
                                : ''
                          }`}
                        >
                          <div className={attendanceStyles.messageHeader}>
                            <strong>{senderLabels[msg.sender]}</strong>
                            <time dateTime={msg.createdAt.toISOString()}>
                              {dateFormatter.format(msg.createdAt)}
                            </time>
                          </div>
                          <p className={attendanceStyles.messageBody}>{msg.body}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <InboxOperatorControls
                    conversationId={detail.conversation.id}
                    status={detail.conversation.status}
                    owner={detail.conversation.owner}
                    assignedTo={detail.conversation.assignedTo}
                    viewerUserId={detail.viewerUserId}
                  />

                  {detail.events.length > 0 ? (
                    <ol className={attendanceStyles.eventList} aria-label="Histórico de transferências">
                      {detail.events.map((ev) => (
                        <li key={ev.id}>
                          {eventLabels[ev.event]} ({reasonLabels[ev.reason]}) em {dateFormatter.format(ev.occurredAt)}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </article>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
