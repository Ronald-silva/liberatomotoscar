'use client';

import { useId, useRef, useState } from 'react';
import styles from '../../admin.module.css';

type Props = {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  suggest: (options: readonly string[], typed: string) => readonly string[];
  placeholder?: string;
  maxLength?: number;
  disabledHint?: string;
};

/**
 * Campo com sugestões visíveis conforme se digita.
 *
 * Não é `<datalist>` de propósito: o nativo não mostra as sugestões de forma previsível no
 * Android e no iOS, e a sugestão que não aparece não economiza digitação nenhuma. São poucas
 * linhas para ter uma lista que aparece sempre, dá para tocar e navega pelo teclado.
 *
 * A lista é sugestão, nunca restrição: o que estiver digitado é o que vai ser salvo.
 */
export function Combobox({ label, hint, value, onChange, options, suggest, placeholder, maxLength = 160, disabledHint }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const matches = open ? suggest(options, value) : [];
  const empty = options.length === 0;

  function pick(option: string) {
    onChange(option);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); setActive(-1); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + matches.length) % Math.max(matches.length, 1));
      return;
    }
    // Enter escolhe a sugestão em foco; sem nenhuma em foco, deixa o formulário seguir.
    if (event.key === 'Enter' && open && active >= 0 && matches[active]) {
      event.preventDefault();
      pick(matches[active]);
    }
  }

  return <div className={styles.field}>
    <label className={styles.comboLabel} htmlFor={`${listId}-input`}>{label}</label>
    {hint ? <p className={styles.chipHint}>{empty && disabledHint ? disabledHint : hint}</p> : null}
    <div className={styles.comboWrap}>
      <input id={`${listId}-input`} className={styles.input} value={value} maxLength={maxLength}
        placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={matches.length > 0}
        aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={active >= 0 && matches[active] ? `${listId}-${active}` : undefined}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        // O clique na sugestão acontece depois do blur: o atraso deixa o toque chegar primeiro.
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        onKeyDown={onKeyDown} />
      {matches.length > 0 ? <ul className={styles.comboList} id={listId} role="listbox" aria-label={`Sugestões de ${label}`}>
        {matches.map((option, index) => <li key={option} id={`${listId}-${index}`} role="option"
          aria-selected={index === active}
          className={index === active ? `${styles.comboOption} ${styles.comboOptionOn}` : styles.comboOption}>
          <button type="button" className={styles.comboButton}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { clearTimeout(blurTimer.current); pick(option); }}>{option}</button>
        </li>)}
      </ul> : null}
    </div>
  </div>;
}
