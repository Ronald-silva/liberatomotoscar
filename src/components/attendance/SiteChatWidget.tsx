'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, MessageCircle, RefreshCw, Send, X } from 'lucide-react';
import { SITE_URL, STORE } from '@/data/store';
import type { DeterministicChoice } from '@/server/attendance/deterministic';
import type { SiteChatView } from '@/server/attendance/site-chat';
import styles from './site-chat.module.css';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const senderName = {
  visitor: 'Você',
  bot: 'Dayse · Liberato',
  ai: 'Dayse · Liberato',
  human: 'Consultor Liberato',
  system: 'Sistema',
} as const;

const modeSubtitle = {
  disabled: 'Atendimento direto com a loja',
  deterministic: 'Consultora Digital · Estoque ao vivo',
  ai: 'Consultora Digital · Estoque ao vivo',
} as const;

const quickPrompts: { label: string; choice?: DeterministicChoice; message?: string }[] = [
  { label: '🏍️ Ver motos', choice: 'motorcycles' },
  { label: '🚗 Ver carros', choice: 'cars' },
  { label: '🎯 Até R$ 15 mil', message: 'Quero ver motos até 15 mil' },
  { label: '🔄 Avaliar troca', choice: 'trade_in' },
  { label: '💳 Financiamento', choice: 'financing' },
  { label: '👤 Falar c/ vendedor', choice: 'human' },
];

function vehicleWhatsAppHref(title: string, priceCents: number, href: string) {
  const fullUrl = new URL(href, SITE_URL).toString();
  const text = `Olá! Vi com a Dayse no site o veículo ${title} (${brl.format(priceCents / 100)}) e quero mais informações: ${fullUrl}`;
  return `https://wa.me/${STORE.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

export function SiteChatWidget({ access = 'public' }: { access?: 'public' | 'admin' }) {
  const [allowed, setAllowed] = useState(access === 'public');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SiteChatView | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadView = useCallback(async () => {
    try {
      const response = await fetch('/api/atendimento', { credentials: 'same-origin' });
      if (!response.ok) return false;
      const data = (await response.json()) as { view: SiteChatView };
      setView(data.view);
      setAllowed(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (access !== 'admin') return;
    let cancelled = false;
    fetch('/api/atendimento', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { view: SiteChatView };
        if (cancelled) return;
        setView(data.view);
        setAllowed(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [access]);

  useEffect(() => {
    if (!open || view?.conversation?.owner !== 'human' || view.conversation.status !== 'open') return;
    const timer = window.setInterval(() => {
      void loadView();
    }, 6_000);
    return () => window.clearInterval(timer);
  }, [open, view?.conversation?.owner, view?.conversation?.status, loadView]);

  useEffect(() => {
    if (open && (view?.messages.length || busy)) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [open, view?.messages.length, busy]);

  if (!allowed) return null;

  async function sendPayload(payload: { message?: string; choice?: DeterministicChoice }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/atendimento', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, clientMessageId: crypto.randomUUID() }),
      });
      const data = (await response.json()) as { view?: SiteChatView; error?: string };
      if (!response.ok || !data.view) {
        throw new Error(data.error ?? 'Não consegui enviar sua mensagem agora.');
      }
      setView(data.view);
      if (payload.message) setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não consegui responder agora.');
    } finally {
      setBusy(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !view) {
      void loadView();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    void sendPayload({ message });
  }

  async function resetConversation() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fetch('/api/atendimento', { method: 'DELETE', credentials: 'same-origin' });
      await loadView();
    } finally {
      setBusy(false);
    }
  }

  const canSend = view
    ? (view.mode !== 'disabled' || view.conversation?.owner === 'human') &&
      view.conversation?.status !== 'closed' &&
      (view.conversation?.turnsLeft ?? 1) > 0
    : true;

  const handoffHref = view?.handoffUrl ?? `https://wa.me/${STORE.whatsappNumber}`;
  const showQuickChips =
    !view || (view.mode !== 'disabled' && view.conversation?.owner !== 'human' && view.conversation?.status !== 'closed');

  return (
    <div className={styles.launcherWrap}>
      {open ? (
        <section className={styles.dialog} aria-labelledby="site-chat-title">
          <header className={styles.header}>
            <div className={styles.headerIdentity}>
              <span className={styles.avatarBadge} aria-hidden="true">
                D
                <span className={styles.onlineDot} />
              </span>
              <div className={styles.headerText}>
                <h2 id="site-chat-title" className={styles.headerTitle}>
                  Dayse · Liberato Motos Car
                </h2>
                <span className={styles.headerSub}>
                  {view?.conversation?.owner === 'human'
                    ? `Protocolo #${view.conversation.protocol} · Vendedor online`
                    : view
                      ? modeSubtitle[view.mode]
                      : 'Consultora Digital · Estoque ao vivo'}
                </span>
              </div>
            </div>
            <div className={styles.headerActions}>
              {view?.conversation ? (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => void resetConversation()}
                  disabled={busy}
                  title="Reiniciar conversa"
                  aria-label="Reiniciar conversa"
                >
                  <RefreshCw size={13} aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setOpen(false)}
                aria-label="Minimizar chat da Dayse"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className={styles.stream} aria-live="polite">
            <div className={styles.welcomeBox}>
              <p className={styles.welcomeCopy}>
                Olá! Sou a <strong>Dayse</strong> 👋 Consulto as motos e carros disponíveis no estoque da loja em Fortaleza ou avalio sua troca agora mesmo.
              </p>
              {showQuickChips ? (
                <div className={styles.choiceGrid} role="group" aria-label="Atalhos rápidos da Dayse">
                  {quickPrompts.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className={styles.choiceButton}
                      disabled={busy || !canSend}
                      onClick={() => void sendPayload({ choice: item.choice, message: item.message })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {view?.messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.bubble} ${
                  msg.sender === 'visitor'
                    ? styles.bubbleVisitor
                    : msg.sender === 'human'
                      ? styles.bubbleHuman
                      : ''
                }`}
              >
                <span className={styles.who}>{senderName[msg.sender]}</span>
                <div>{msg.body}</div>
                {msg.cards.length > 0 ? (
                  <div className={styles.cards}>
                    {msg.cards.map((card) => (
                      <article key={card.id} className={styles.card}>
                        <div className={styles.cardTop}>
                          <span className={styles.cardBadge}>● Em estoque</span>
                          {card.year ? <span className={styles.cardYear}>{card.year}</span> : null}
                        </div>
                        <strong className={styles.cardTitle}>{card.title}</strong>
                        <span className={styles.cardPrice}>{brl.format(card.priceCents / 100)}</span>
                        <div className={styles.cardActions}>
                          <a className={styles.cardPrimaryLink} href={card.href}>
                            Ver veículo <ArrowUpRight size={12} aria-hidden="true" />
                          </a>
                          <a
                            className={styles.cardSecondaryLink}
                            href={vehicleWhatsAppHref(card.title, card.priceCents, card.href)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            WhatsApp
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {busy ? (
              <div className={styles.typingBubble}>
                <span className={styles.pulseDot} aria-hidden="true" />
                Dayse está consultando o estoque…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className={styles.footer}>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            {canSend ? (
              <form className={styles.composer} onSubmit={handleSubmit}>
                <input
                  type="text"
                  className={styles.input}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={1000}
                  disabled={busy}
                  aria-label="Pergunte para a Dayse sobre motos, carros, faixa de preço ou troca"
                  placeholder="Digite sua dúvida ou modelo…"
                />
                <button
                  type="submit"
                  className={styles.sendButton}
                  disabled={busy || !draft.trim()}
                  aria-label="Enviar mensagem"
                >
                  <Send size={14} aria-hidden="true" />
                </button>
              </form>
            ) : null}
            <div className={styles.footerBottom}>
              <span className={styles.privacyHint}>Estoque verificado ao vivo</span>
              <a className={styles.handoffLink} href={handoffHref} target="_blank" rel="noopener noreferrer">
                Chamar no WhatsApp <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className={styles.launcherButton}
          aria-expanded={open}
          aria-label="Abrir chat com a Dayse, consultora da Liberato Motos Car"
          onClick={toggleOpen}
        >
          <span className={styles.launcherAvatar} aria-hidden="true">
            D
            <span className={styles.onlineDot} />
          </span>
          <span className={styles.launcherLabel}>Dayse · Atendimento</span>
          <MessageCircle size={15} className={styles.launcherIcon} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
