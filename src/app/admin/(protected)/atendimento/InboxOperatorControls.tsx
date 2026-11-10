'use client';

import { useActionState, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { replyWindowState } from '@/server/attendance/reply-window';
import { operateInboxConversation, type InboxActionState } from './actions';
import attendanceStyles from './attendance.module.css';

type Props = {
  conversationId: string;
  status: 'open' | 'closed';
  owner: 'automation' | 'human';
  assignedTo: string | null;
  viewerUserId: string;
  customerPhone?: string | null;
  tenantId?: string | null;
  lastVisitorMessageAt?: string | null;
};

const initialState: InboxActionState = { message: null, error: false };

export function InboxOperatorControls({ conversationId, status, owner, assignedTo, viewerUserId,
  customerPhone, tenantId, lastVisitorMessageAt }: Props) {
  const [state, action, pending] = useActionState(operateInboxConversation, initialState);
  const router = useRouter();
  const [body, setBody] = useState('');
  const [replyPending, setReplyPending] = useState(false);
  const [replyState, setReplyState] = useState<InboxActionState>(initialState);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isMine = status === 'open' && owner === 'human' && assignedTo === viewerUserId;
  const takenByOther = status === 'open' && owner === 'human' && Boolean(assignedTo) && assignedTo !== viewerUserId;
  const hasContact = Boolean(customerPhone && tenantId);
  const windowState = replyWindowState(lastVisitorMessageAt ? new Date(lastVisitorMessageAt) : null, new Date());
  const digits = customerPhone?.replace(/\D/g, '') ?? '';
  const whatsappHref = digits.length >= 10 ? `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}` : null;

  useEffect(() => {
    const scrollStream = () => {
      const stream = document.querySelector<HTMLElement>('[aria-label="Histórico de mensagens"]');
      if (stream) stream.scrollTop = stream.scrollHeight;
    };
    scrollStream();
    const frame = requestAnimationFrame(scrollStream);
    return () => cancelAnimationFrame(frame);
  }, [conversationId, lastVisitorMessageAt, body]);

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReplyPending(true);
    setReplyState(initialState);
    try {
      const result = await operateInboxConversation(initialState, new FormData(event.currentTarget));
      setReplyState(result);
      if (!result.error) { setBody(''); router.refresh(); }
    } catch {
      setReplyState({ message: 'Não foi possível enviar agora. Seu texto foi mantido; tente novamente.', error: true });
    } finally {
      setReplyPending(false);
    }
  }

  return (
    <div className={attendanceStyles.operatorBox}>
      {status === 'open' ? (
        <>
          <form action={action} className={attendanceStyles.operatorButtons}>
            <input type="hidden" name="conversationId" value={conversationId} />
            {!isMine && !takenByOther ? (
              <button type="submit" name="intent" value="assume" className={attendanceStyles.submit} disabled={pending}>
                Assumir conversa
              </button>
            ) : null}
            {owner === 'human' ? (
              <button type="submit" name="intent" value="release" className={attendanceStyles.secondaryButton} disabled={pending}>
                Devolver para automação
              </button>
            ) : null}
            <button type="submit" name="intent" value="close" className={attendanceStyles.secondaryButton} disabled={pending}>
              Encerrar conversa
            </button>
            {!confirmingDelete ? (
              <button
                type="button"
                className={attendanceStyles.destructiveButton}
                disabled={pending}
                onClick={() => setConfirmingDelete(true)}
              >
                Excluir conversa
              </button>
            ) : null}
            {confirmingDelete ? (
              <div className={attendanceStyles.deleteConfirm} role="group" aria-label="Confirmar exclusão da conversa">
                <p className={attendanceStyles.current} role="alert">
                  Excluir esta conversa? O histórico de mensagens será apagado permanentemente.
                </p>
                <button type="submit" name="intent" value="delete" className={attendanceStyles.destructiveButton} disabled={pending}>
                  Sim, excluir conversa
                </button>
                <button
                  type="button"
                  className={attendanceStyles.secondaryButton}
                  disabled={pending}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Manter conversa
                </button>
              </div>
            ) : null}
          </form>

          {takenByOther ? (
            <p className={attendanceStyles.current}>Outro vendedor assumiu esta conversa.</p>
          ) : null}

          {isMine && !hasContact ? (
            <p className={attendanceStyles.current}>Esta conversa é anterior ao registro do contato. Responda pelo celular da loja.</p>
          ) : null}
          {isMine && hasContact && windowState !== 'open' ? (
            <p className={attendanceStyles.current}>
              {windowState === 'closed' ? 'A janela de 24 horas para responder pelo painel terminou.' : 'Não há mensagem recente do cliente para abrir a janela de resposta.'}{' '}
              {whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer">Responder pelo WhatsApp da loja</a> : null}
            </p>
          ) : null}

          {isMine && hasContact && windowState === 'open' ? (
            <form
              onSubmit={sendReply}
              className={attendanceStyles.replyForm}
            >
              <input type="hidden" name="conversationId" value={conversationId} />
              <input type="hidden" name="intent" value="reply" />
              <label htmlFor="operator-reply-body" className={attendanceStyles.replyLabel}>
                Responder como vendedor
              </label>
              <textarea
                id="operator-reply-body"
                name="body"
                rows={3}
                maxLength={2000}
                required
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={replyPending}
                className={attendanceStyles.replyTextarea}
                placeholder="Digite a orientação para o comprador…"
              />
              <button type="submit" className={attendanceStyles.submit} disabled={replyPending || !body.trim()} aria-busy={replyPending}>
                {replyPending ? 'Enviando…' : 'Enviar resposta ao visitante'}
              </button>
            </form>
          ) : !isMine ? (
            <p className={attendanceStyles.current}>
              Assuma a conversa para suspender respostas automáticas e enviar mensagens como vendedor.
            </p>
          ) : null}
        </>
      ) : (
        <form action={action} className={attendanceStyles.operatorButtons}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <p className={attendanceStyles.current}>Esta conversa foi encerrada.</p>
          {!confirmingDelete ? (
            <button
              type="button"
              className={attendanceStyles.destructiveButton}
              disabled={pending}
              onClick={() => setConfirmingDelete(true)}
            >
              Excluir conversa
            </button>
          ) : (
            <div className={attendanceStyles.deleteConfirm} role="group" aria-label="Confirmar exclusão da conversa">
              <p className={attendanceStyles.current} role="alert">
                Excluir esta conversa? O histórico de mensagens será apagado permanentemente.
              </p>
              <button type="submit" name="intent" value="delete" className={attendanceStyles.destructiveButton} disabled={pending}>
                Sim, excluir conversa
              </button>
              <button
                type="button"
                className={attendanceStyles.secondaryButton}
                disabled={pending}
                onClick={() => setConfirmingDelete(false)}
              >
                Manter conversa
              </button>
            </div>
          )}
        </form>
      )}
      {state.message ? (
        <p role="status" aria-live="polite" className={state.error ? attendanceStyles.error : attendanceStyles.success}>
          {state.message}
        </p>
      ) : null}
      {replyState.message ? (
        <p role="status" aria-live="polite" className={replyState.error ? attendanceStyles.error : attendanceStyles.success}>
          {replyState.message}
        </p>
      ) : null}
    </div>
  );
}

