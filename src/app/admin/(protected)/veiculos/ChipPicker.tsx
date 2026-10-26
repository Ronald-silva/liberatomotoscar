'use client';

import { useRef, useState } from 'react';
import styles from '../../admin.module.css';

type Props = {
  legend: string;
  hint?: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  otherLabel?: string;
  otherPlaceholder?: string;
  maxLength?: number;
};

/**
 * Escolha por toque, com escape para digitar.
 *
 * Marca e cor são os campos em que a lista cobre quase todo o estoque, então um toque resolve.
 * Quem tem um veículo fora da lista toca em "Outra" e digita — nada fica impossível de cadastrar.
 * Tocar num item já escolhido não apaga nada: para trocar, toca-se em outro.
 */
export function ChipPicker({ legend, hint, options, value, onChange, otherLabel = 'Outra', otherPlaceholder, maxLength = 160 }: Props) {
  const listed = options.some((option) => option === value);
  const [typing, setTyping] = useState(value !== '' && !listed);
  const input = useRef<HTMLInputElement>(null);

  function chooseOther() {
    setTyping(true);
    if (listed) onChange('');
    // O foco entra no campo no mesmo gesto: um toque a menos.
    requestAnimationFrame(() => input.current?.focus());
  }

  return <fieldset className={styles.chipField}>
    <legend className={styles.chipLegend}>{legend}</legend>
    {hint ? <p className={styles.chipHint}>{hint}</p> : null}
    <div className={styles.chipRow}>
      {options.map((option) => <button key={option} type="button"
        className={option === value ? `${styles.chip} ${styles.chipOn}` : styles.chip}
        aria-pressed={option === value}
        onClick={() => { setTyping(false); onChange(option); }}>{option}</button>)}
      <button type="button" className={typing ? `${styles.chip} ${styles.chipOn}` : styles.chip}
        aria-pressed={typing} onClick={chooseOther}>{otherLabel}</button>
    </div>
    {typing ? <input ref={input} className={styles.input} value={listed ? '' : value} maxLength={maxLength}
      placeholder={otherPlaceholder} autoComplete="off" aria-label={`${legend} — digitar`}
      onChange={(event) => onChange(event.target.value)} /> : null}
  </fieldset>;
}
