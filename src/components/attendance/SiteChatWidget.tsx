'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { STORE } from '@/data/store';
import type { DeterministicChoice } from '@/server/attendance/deterministic';
import type { SiteChatView } from '@/server/attendance/site-chat';
import styles from './site-chat.module.css';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const senderName = {
  visitor: 'Você',
  bot: 'Atendimento Liberato',
  ai: 'Assistente Liberato (IA)',
  human: 'Vendedor Liberato',
  system: 'Sistema',
} as const;

const modeSubtitle = {
  disabled: 'Atendimento pelo WhatsApp',
  deterministic: 'Menu rápido de estoque',
  ai: 'Assistente com inteligência artificial',
} as const;

export function SiteChatWidget({ access = 'public' }: { access?: 'public' | 'admin' }) {
  const [allowed, setAllowed] = useState(access === 'public');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SiteChatView | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!allowed) return null;

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !view) {
      void loadView();
    }
  }

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
    : false;

  const handoffHref = view?.handoffUrl ?? `https://wa.me/${STORE.whatsappNumber}`;

  return (
    <div className={styles.launcherWrap}>
      {open ? (
        <section className={styles.dialog} aria-labelledby="site-chat-title">
          <header className={styles.header}>
            <div>
              <h2 id="site-chat-title" className={styles.headerTitle}>Atendimento Liberato</h2>
              <span className={styles.headerSub}>
                {view?.conversation?.owner === 'human'
                  ? `Protocolo #${view.conversation.protocol} · Vendedor acionado`
                  : view
                    ? modeSubtitle[view.mode]
                    : 'Carregando atendimento…'}
              </span>
            </div>
            <div className={styles.headerActions}>
              {view?.conversation ? (
                <button type="button" className={styles.closeButton} onClick={() => void resetConversation()} disabled={busy}>
                  Nova
                </button>
              ) : null}
              <button type="button" className={styles.closeButton} onClick={() => setOpen(false)}>
                Fechar
              </button>
            </div>
          </header>

          <p className={styles.privacy}>
            Aviso de privacidade: não envie documentos nem senhas. O atendimento pode usar respostas automáticas ou IA e guarda a conversa temporariamente para suporte da loja.
          </p>

          <div className={styles.stream} aria-live="polite">
            {view && view.mode !== 'disabled' && view.conversation?.owner !== 'human' && view.conversation?.status !== 'closed' ? (
              <div className={styles.choiceRow} role="group" aria-label="Opções rápidas de atendimento">
                {view.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={styles.choiceButton}
                    disabled={busy || !canSend}
                    onClick={() => void sendPayload({ choice: choice.id })}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            ) : null}

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
                        <strong>{card.title}</strong>
                        <span>
                          {card.year ? `${card.year} · ` : ''}
                          {brl.format(card.priceCents / 100)}
                        </span>
                        <a href={card.href}>Ver anúncio</a>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
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
                  aria-label="Mensagem para o atendimento"
                  placeholder="Digite sua dúvida…"
                />
                <button type="submit" className={styles.sendButton} disabled={busy || !draft.trim()}>
                  {busy ? '…' : 'Enviar'}
                </button>
              </form>
            ) : null}
            <a className={styles.handoffLink} href={handoffHref} target="_blank" rel="noopener noreferrer">
              Continuar com vendedor no WhatsApp
            </a>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className={styles.launcherButton}
        aria-expanded={open}
        onClick={toggleOpen}
      >
        {open ? 'Ocultar atendimento' : 'Atendimento online'}
      </button>
    </div>
  );
}
