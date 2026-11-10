import type { Metadata } from 'next';
import Link from 'next/link';
import {
  countInbox,
  getInboxConversation,
  inboxFilterSchema,
  listInbox,
  type InboxFilter,
} from '@/server/attendance/inbox';
import { protocolOf } from '@/server/attendance/protocol';
import { organizarFicha, semGritar } from './ficha';
import { InboxOperatorControls } from './InboxOperatorControls';
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

  const [counts, list] = await Promise.all([
    countInbox().catch(() => ({ waiting: 0, mine: 0, automation: 0 })),
    listInbox(filter).catch(() => []),
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

  return (
    <main id="conteudo" className={attendanceStyles.screen}>
      <div className={attendanceStyles.panel}>
        <header className={attendanceStyles.topBar}>
          <div className={attendanceStyles.topBarTitle}>
            <h1>Atendimento · Dayse</h1>
            <p className={attendanceStyles.intro}>
              A Dayse atende com base no estoque publicado. Assuma uma conversa para responder como vendedor e pausar a IA.
            </p>
          </div>
          <Link href="/admin/ajustes" className={attendanceStyles.settingsBtn}>
            <span className={attendanceStyles.settingsDot} aria-hidden="true" />
            Configurar WhatsApp (Meta)
          </Link>
        </header>

        <section aria-label="Fila de conversas" className={attendanceStyles.inboxSection}>
          <nav aria-label="Filtros da fila de atendimento" className={attendanceStyles.filterNav}>
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                href={`/admin/atendimento?fila=${tab.id}`}
                className={`${attendanceStyles.filterTab} ${filter === tab.id ? attendanceStyles.filterTabActive : ''}`}
                aria-current={filter === tab.id ? 'page' : undefined}
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
                        href={`/admin/atendimento?fila=${filter}&conversa=${item.id}#conversa-ativa`}
                        className={`${attendanceStyles.conversationLink} ${isSelected ? attendanceStyles.conversationLinkActive : ''}`}
                        aria-current={isSelected ? 'true' : undefined}
                      >
                        <div className={attendanceStyles.conversationMeta}>
                          <strong>{item.customerName ?? `Atendimento #${protocolOf(item.id)}`}</strong>
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
                                : item.handoffRequestedAt
                                  ? 'Aguardando vendedor (Dayse ativa)'
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
                <article id="conversa-ativa" className={attendanceStyles.conversationDetail} aria-label={`Conversa ${protocolOf(detail.conversation.id)}`}>
                  <header className={attendanceStyles.detailHeader}>
                    <div>
                      <h3>{detail.conversation.customerName ?? `Atendimento #${protocolOf(detail.conversation.id)}`}</h3>
                      {detail.conversation.customerPhone ? <p className={attendanceStyles.current}>{detail.conversation.customerPhone}</p> : null}
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
                              : detail.conversation.handoffRequestedAt
                                ? 'Aguardando vendedor (Dayse ativa)'
                                : 'Atendida pela Dayse'}
                        </strong>
                      </p>
                    </div>
                  </header>

                  {(() => {
                    const ficha = organizarFicha(detail.conversation.facts);
                    if (!ficha.visita && ficha.linhas.length === 0) return null;
                    return (
                      <div className={attendanceStyles.briefing}>
                        {ficha.visita ? (
                          <p className={attendanceStyles.visita}>
                            <span className={attendanceStyles.visitaRotulo}>Visita combinada</span>
                            <span className={attendanceStyles.visitaValor} title={ficha.visita}>
                              {semGritar(ficha.visita)}
                            </span>
                          </p>
                        ) : null}
                        {ficha.linhas.length > 0 ? (
                          <dl className={attendanceStyles.ficha} aria-label="O que o cliente informou">
                            {ficha.linhas.map(({ campo, rotulo, valor }) => (
                              <div key={campo} className={attendanceStyles.fichaLinha}>
                                <dt>{rotulo}</dt>
                                <dd title={valor}>{semGritar(valor)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                      </div>
                    );
                  })()}

                  <p className={attendanceStyles.conversaTitulo}>Conversa</p>
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
                                : msg.sender === 'ai' || msg.sender === 'bot'
                                  ? attendanceStyles.messageAi
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
                    customerPhone={detail.conversation.customerPhone}
                    tenantId={detail.conversation.tenantId}
                    lastVisitorMessageAt={detail.lastVisitorMessageAt?.toISOString() ?? null}
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
