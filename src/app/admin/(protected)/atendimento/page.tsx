import type { Metadata } from 'next';
import Link from 'next/link';
import {
  countInbox,
  getInboxConversation,
  inboxFilterSchema,
  listInbox,
  type InboxFilter,
} from '@/server/attendance/inbox';
import { listAdminSiteModeChanges, readAdminSiteSetting } from '@/server/attendance/settings';
import { protocolOf } from '@/server/attendance/site-chat';
import { listWhatsappTenants } from '@/server/whatsapp/embedded-signup';
import { InboxOperatorControls } from './InboxOperatorControls';
import { SiteModeForm } from './SiteModeForm';
import { WhatsAppOnboardingCard } from './WhatsAppOnboardingCard';
import attendanceStyles from './attendance.module.css';

export const metadata: Metadata = { title: 'Atendimento do site', robots: { index: false, follow: false } };

const names = { disabled: 'Desativado', deterministic: 'Chatbot', ai: 'IA' } as const;
const senderLabels = {
  visitor: 'Visitante',
  bot: 'Chatbot',
  ai: 'IA',
  human: 'Vendedor',
  system: 'Sistema',
} as const;
const eventLabels = {
  requested: 'Transferência solicitada',
  assumed: 'Conversa assumida por vendedor',
  released: 'Conversa devolvida para automação',
  closed: 'Conversa encerrada',
} as const;
const reasonLabels = {
  visitor_request: 'pedido do visitante',
  financing: 'financiamento',
  trade_in: 'veículo na troca',
  ai_suggested: 'sugestão da IA',
  operator: 'ação do operador',
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

  const [setting, changes, counts, list, tenants] = await Promise.all([
    readAdminSiteSetting(),
    listAdminSiteModeChanges(),
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
    { id: 'mine', label: `Comigo (${counts.mine})` },
    { id: 'automation', label: `Em automação (${counts.automation})` },
    { id: 'closed', label: 'Encerradas' },
  ];

  return (
    <main id="conteudo" className={attendanceStyles.screen}>
      <div className={attendanceStyles.panel}>
        <Link href="/admin" className={attendanceStyles.back}>Voltar ao painel</Link>
        <h1>Atendimento do site</h1>
        <p className={attendanceStyles.intro}>
          Escolha como o site deverá responder quando o atendimento público for liberado. Quando um vendedor assume uma conversa, a automação daquela conversa é suspensa imediatamente.
        </p>
        <SiteModeForm mode={setting.mode} version={setting.version} />

        <WhatsAppOnboardingCard initialTenants={tenants} />

        <section aria-labelledby="inbox-title" className={attendanceStyles.inboxSection}>
          <div className={attendanceStyles.inboxHeader}>
            <h2 id="inbox-title">Fila de conversas do site</h2>
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
            <p className={attendanceStyles.current}>Nenhuma conversa neste filtro.</p>
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
                          <strong>Protocolo #{protocolOf(item.id)}</strong>
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
                                  ? 'Em atendimento humano'
                                  : 'Aguardando vendedor'
                                : 'Em automação'}
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
                      <h3>Protocolo #{protocolOf(detail.conversation.id)}</h3>
                      <p className={attendanceStyles.current}>
                        Estado: <strong>{detail.conversation.status === 'closed' ? 'Encerrada' : 'Aberta'}</strong> · Responsável:{' '}
                        <strong>
                          {detail.conversation.owner === 'human'
                            ? detail.conversation.assignedTo === detail.viewerUserId
                              ? 'Você (vendedor)'
                              : detail.conversation.assignedTo
                                ? 'Outro vendedor'
                                : 'Fila humana (aguardando assumir)'
                            : 'Automação'}
                        </strong>
                      </p>
                    </div>
                  </header>

                  {detail.conversation.facts.length > 0 ? (
                    <ul className={attendanceStyles.factList} aria-label="Interesses informados pelo visitante">
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

        <section aria-labelledby="mode-history-title" className={attendanceStyles.history}>
          <h2 id="mode-history-title">Últimas alterações de modo</h2>
          {changes.length ? (
            <ol>
              {changes.map((change) => (
                <li key={change.id}>
                  <span>{names[change.beforeMode]} → {names[change.afterMode]}</span>
                  <time dateTime={change.occurredAt.toISOString()}>
                    {dateFormatter.format(change.occurredAt)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p>Nenhuma alteração registrada. O canal começa desativado.</p>
          )}
        </section>
      </div>
    </main>
  );
}
