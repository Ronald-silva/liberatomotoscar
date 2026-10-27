'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { STORE } from '@/data/store';
import type { DemoAnswer } from '@/server/ai/demo-agent';
import styles from './demo.module.css';

type Exchange = { user: string; response: DemoAnswer };
type ServerAnswer = DemoAnswer & { state: string };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const stageLabels = {
  researching: 'Pesquisando opções',
  requirements_defined: 'Preferências definidas',
  ready_for_seller: 'Pronto para conversar com a loja',
} as const;
const factLabels = {
  category: 'Categoria', model: 'Modelo', budget: 'Orçamento', payment: 'Pagamento', trade_in: 'Troca',
  timeline: 'Prazo', visit: 'Visita', negotiation: 'Negociação', purpose: 'Finalidade',
} as const;

export function DemoChat({ enabled }: { enabled: boolean }) {
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const latest = exchanges.at(-1)?.response;
  const finished = Boolean(latest?.handoffRequested) || exchanges.length >= 8;

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [exchanges, busy]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!enabled || !message || busy || finished) return;
    setBusy(true);
    setError(null);
    setNotice('Consultando o estoque e preparando a resposta…');
    try {
      const response = await fetch('/api/demo-ia', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message, state }),
      });
      let result: ServerAnswer | null = null;
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        if (!response.body) throw new Error('Não foi possível receber a resposta da IA.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = frame.match(/^event: (.+)$/m)?.[1];
            const data = frame.match(/^data: (.+)$/m)?.[1];
            if (event && data) {
              const payload = JSON.parse(data);
              if (event === 'status') {
                setNotice(payload.status === 'inventory_checked' ? 'Estoque consultado. Preparando resposta…' :
                  payload.status === 'preparing_answer' ? 'Organizando as opções…' : 'Consultando o estoque…');
              }
              if (event === 'error') throw new Error(payload.message || 'Não foi possível responder agora.');
              if (event === 'answer') result = payload as ServerAnswer;
            }
            boundary = buffer.indexOf('\n\n');
          }
          if (done) break;
        }
      } else {
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Não foi possível responder agora.');
        result = payload as ServerAnswer;
      }
      if (!result) throw new Error('A conexão terminou sem resposta validada.');
      setExchanges((current) => [...current, { user: message, response: result }]);
      setState(result.state);
      setDraft('');
      setNotice(result.handoffRequested ? 'Conversa encaminhada para atendimento humano.' : 'Resposta pronta.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível responder agora. Tente novamente.');
      setNotice('');
    } finally { setBusy(false); }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function restart() {
    setState(null);
    setExchanges([]);
    setDraft('');
    setError(null);
    setNotice('Nova conversa iniciada.');
  }

  async function copySummary() {
    if (!latest) return;
    const lines = [stageLabels[latest.lead.stage],
      ...latest.lead.facts.map((fact) => `${factLabels[fact.field]}: “${fact.quote}”`),
      `Próximo passo: ${latest.lead.nextAction}`];
    try { await navigator.clipboard.writeText(lines.join('\n')); setNotice('Resumo copiado.'); }
    catch { setError('Não consegui copiar. Selecione o resumo na tela.'); }
  }

  return <div>
    <section className={styles.panel} aria-labelledby="demo-chat-title">
      <div className={styles.panelHeader}>
        <div><h2 id="demo-chat-title">Converse com o assistente</h2><small>Consulta ao estoque da Liberato</small></div>
        {exchanges.length > 0 && <button className={`${styles.action} ${styles.secondary}`} type="button" onClick={restart}>Nova conversa</button>}
      </div>
      <div className={styles.messages} aria-label="Mensagens da conversa">
        {exchanges.length === 0 && !busy && <p className={styles.empty}>Experimente: “Quero uma moto para trabalhar até 18 mil e tenho uma Fan para dar na troca.”</p>}
        {exchanges.map((exchange, index) => <div className={styles.exchange} key={index}>
          <div className={`${styles.bubble} ${styles.buyer}`}><span className={styles.who}>Você</span>{exchange.user}</div>
          <div className={`${styles.bubble} ${styles.assistant}`}>
            <span className={styles.who}>Assistente Liberato</span>{exchange.response.answer}
            {exchange.response.cards.length > 0 && <div className={styles.cards}>
              {exchange.response.cards.map((card) => <article className={styles.card} key={card.id}>
                <strong>{card.title}</strong>
                <span className={styles.cardMeta}>{card.type === 'motorcycle' ? 'Moto' : 'Carro'}{card.year ? ` · ${card.year}` : ''}{card.mileageKm !== null ? ` · ${card.mileageKm.toLocaleString('pt-BR')} km` : ''}{card.color ? ` · ${card.color}` : ''}</span>
                <span className={styles.cardPrice}>{brl.format(card.priceCents / 100)}</span>
                <a href={card.href} target="_blank" rel="noopener noreferrer">Abrir anúncio de {card.title}</a>
              </article>)}
            </div>}
          </div>
        </div>)}
        {busy && <div className={`${styles.bubble} ${styles.buyer}`}><span className={styles.who}>Você</span>{draft.trim()}</div>}
        {busy && <div className={`${styles.bubble} ${styles.assistant}`}><span className={styles.who}>Assistente Liberato</span>{notice}</div>}
        <div ref={endRef} />
      </div>
      <form className={styles.composer} onSubmit={(event) => void send(event)}>
        <label htmlFor="demo-message">O que você procura?</label>
        <textarea id="demo-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown}
          maxLength={1000} disabled={!enabled || busy || finished} aria-describedby="demo-hint" />
        {error && <p className={styles.error} role="alert">{error} <a href={`https://wa.me/${STORE.whatsappNumber}`} target="_blank" rel="noopener noreferrer">Falar com a loja</a></p>}
        <div className={styles.controls}>
          <span id="demo-hint" className={styles.hint}>{!enabled ? 'A IA aguarda liberação do provedor.' : finished ? 'Inicie outra conversa para continuar.' : 'Ctrl+Enter para enviar · até 8 mensagens'}</span>
          <button className={styles.action} type="submit" disabled={!enabled || busy || finished}>{busy ? 'Consultando…' : 'Enviar mensagem'}</button>
        </div>
      </form>
      <p className={styles.notice}>Demonstração restrita. Não informe dados pessoais. Preço e disponibilidade devem ser confirmados com a loja. <a href={`https://wa.me/${STORE.whatsappNumber}`} target="_blank" rel="noopener noreferrer">Atendimento humano</a></p>
      <div className="sr-only" role="status" aria-live="polite">{notice}</div>
    </section>
    {latest && <section className={styles.summary} aria-labelledby="lead-summary-title">
      <span className={styles.eyebrow}>Resumo para a equipe</span>
      <h2 id="lead-summary-title">Próximo passo da conversa</h2>
      <p><strong>{stageLabels[latest.lead.stage]}</strong> · {latest.lead.nextAction}</p>
      {latest.lead.facts.length > 0 ? <ul>{latest.lead.facts.map((fact, index) => <li key={`${fact.field}-${index}`}><strong>{factLabels[fact.field]}:</strong> “{fact.quote}”</li>)}</ul>
        : <p>O comprador ainda não informou preferências detalhadas.</p>}
      <div className={styles.summaryActions}>
        <button className={`${styles.action} ${styles.secondary}`} type="button" onClick={() => void copySummary()}>Copiar resumo</button>
        {latest.handoffUrl && <a className={styles.action} href={latest.handoffUrl} target="_blank" rel="noopener noreferrer">Abrir WhatsApp com resumo</a>}
      </div>
    </section>}
  </div>;
}
