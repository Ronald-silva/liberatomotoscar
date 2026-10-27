'use client';

import { useActionState, useState } from 'react';
import { operateInboxConversation, type InboxActionState } from './actions';
import attendanceStyles from './attendance.module.css';

type Props = {
  conversationId: string;
  status: 'open' | 'closed';
  owner: 'automation' | 'human';
  assignedTo: string | null;
  viewerUserId: string;
};

const initialState: InboxActionState = { message: null, error: false };

export function InboxOperatorControls({ conversationId, status, owner, assignedTo, viewerUserId }: Props) {
  const [state, action, pending] = useActionState(operateInboxConversation, initialState);
  const [body, setBody] = useState('');
  const isMine = status === 'open' && owner === 'human' && assignedTo === viewerUserId;
  const takenByOther = status === 'open' && owner === 'human' && Boolean(assignedTo) && assignedTo !== viewerUserId;

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
          </form>

          {takenByOther ? (
            <p className={attendanceStyles.current}>Outro vendedor assumiu esta conversa.</p>
          ) : null}

          {isMine ? (
            <form
              action={async (formData) => {
                await action(formData);
                setBody('');
              }}
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
                disabled={pending}
                className={attendanceStyles.replyTextarea}
                placeholder="Digite a orientação para o comprador…"
              />
              <button type="submit" className={attendanceStyles.submit} disabled={pending || !body.trim()}>
                {pending ? 'Enviando…' : 'Enviar resposta ao visitante'}
              </button>
            </form>
          ) : (
            <p className={attendanceStyles.current}>
              Assuma a conversa para suspender respostas automáticas e enviar mensagens como vendedor.
            </p>
          )}
        </>
      ) : (
        <p className={attendanceStyles.current}>Esta conversa foi encerrada e permanece apenas para consulta.</p>
      )}
      {state.message ? (
        <p role="status" aria-live="polite" className={state.error ? attendanceStyles.error : attendanceStyles.success}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

