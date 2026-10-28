'use client';

import { startTransition, useActionState, useOptimistic } from 'react';
import { changeSiteMode, type ModeFormState } from './actions';
import attendanceStyles from './attendance.module.css';

const modes = [
  {
    value: 'ai',
    label: '🤖 Agente IA Dayse (Consultora Completa)',
    description:
      'Especialista automotiva: responde sobre qualquer veículo, ficha técnica, km, preços, comparações, endereço e qualifica o cliente.',
  },
  {
    value: 'deterministic',
    label: '⚡ Chatbot Guiado (Menu Rápido)',
    description:
      'Triagem simples por botões (Ver motos, Ver carros, Financiamento, Troca e Vendedor), sem conversa consultiva aberta.',
  },
  {
    value: 'disabled',
    label: '⏸️ Desativado (Só WhatsApp Direto)',
    description:
      'Desliga o atendimento automático no site e mantém apenas o redirecionamento direto para o WhatsApp da loja.',
  },
] as const;

export function SiteModeForm({ mode, version }: { mode: ModeFormState['mode']; version: number }) {
  const [state, action, pending] = useActionState(changeSiteMode, {
    mode,
    version,
    message: null,
    error: false,
  });
  const [optimisticMode, setOptimisticMode] = useOptimistic(state.mode);

  function handleSelectMode(nextMode: ModeFormState['mode']) {
    if (pending || nextMode === optimisticMode) return;
    const formData = new FormData();
    formData.set('mode', nextMode);
    formData.set('version', String(state.version));
    formData.set('confirm', 'yes');
    startTransition(() => {
      setOptimisticMode(nextMode);
      action(formData);
    });
  }

  return (
    <form action={action} className={attendanceStyles.form}>
      <input type="hidden" name="version" value={state.version} />
      <input type="hidden" name="confirm" value="yes" />
      <fieldset className={attendanceStyles.choices} disabled={pending}>
        <legend>Modo de Atendimento Automático (1 clique para alternar)</legend>
        {modes.map((item) => (
          <label key={item.value} className={attendanceStyles.choice}>
            <input
              type="radio"
              name="mode"
              value={item.value}
              checked={optimisticMode === item.value}
              onChange={() => handleSelectMode(item.value)}
            />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {pending ? (
        <p className={attendanceStyles.current}>Atualizando modo de atendimento…</p>
      ) : state.message ? (
        <p
          role="status"
          aria-live="polite"
          className={state.error ? attendanceStyles.error : attendanceStyles.success}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
