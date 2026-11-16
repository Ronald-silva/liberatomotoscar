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
  /**
   * Quantas opções aparecem antes de "Ver todas". Sem o número, a lista inteira aparece.
   *
   * As listas de `catalogo-marcas-modelos.ts` já estão na ordem do que a loja vende — Honda e
   * Yamaha primeiro nas motos, Volkswagen e Fiat nos carros —, então o começo da lista é o que
   * resolve quase todo cadastro. O resto continua a um toque de distância: nada foi removido.
   */
  visibleCount?: number;
  /**
   * O texto do botão que abre o resto da lista, sem a contagem — ela é acrescentada aqui.
   *
   * Vem escrito de fora porque plural em português não se monta somando "s": o legend "Cor" viraria
   * "cors". Quem chama sabe se são marcas ou cores.
   */
  allLabel?: string;
};

/**
 * Escolha por toque, com escape para digitar.
 *
 * Marca e cor são os campos em que a lista cobre quase todo o estoque, então um toque resolve.
 * Quem tem um veículo fora da lista toca em "Outra" e digita — nada fica impossível de cadastrar.
 * Tocar num item já escolhido não apaga nada: para trocar, toca-se em outro.
 *
 * `visibleCount` existe porque a tela de edição chegava a 25 fichas simultâneas só de marca e cor,
 * e no celular isso é meia tela de decisões antes do primeiro campo de texto.
 */
export function ChipPicker({ legend, hint, options, value, onChange, otherLabel = 'Outra', otherPlaceholder, maxLength = 160, visibleCount, allLabel = 'Ver todas as opções' }: Props) {
  const listed = options.some((option) => option === value);
  const [typing, setTyping] = useState(value !== '' && !listed);
  const [showAll, setShowAll] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const limited = visibleCount !== undefined && !showAll && options.length > visibleCount;
  // A escolhida entra sempre, **na posição dela**: uma marca escolhida que sumisse da lista faria
  // a tela parecer ter perdido o cadastro, e jogá-la para o fim mudaria a ordem entre visitas.
  const visible = limited
    ? options.filter((option, index) => index < visibleCount || option === value)
    : options;

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
      {visible.map((option) => <button key={option} type="button"
        className={option === value ? `${styles.chip} ${styles.chipOn}` : styles.chip}
        aria-pressed={option === value}
        onClick={() => { setTyping(false); onChange(option); }}>{option}</button>)}
      {/* Desaparece depois de aberto: um "Ver menos" convidaria a arrumar a tela em vez de
          cadastrar o veículo, e quem abriu a lista estava procurando algo que não viu. */}
      {limited ? <button type="button" className={`${styles.chip} ${styles.chipMore}`}
        onClick={() => setShowAll(true)}>{allLabel} ({options.length})</button> : null}
      <button type="button" className={typing ? `${styles.chip} ${styles.chipOn}` : styles.chip}
        aria-pressed={typing} onClick={chooseOther}>{otherLabel}</button>
    </div>
    {typing ? <input ref={input} className={styles.input} value={listed ? '' : value} maxLength={maxLength}
      placeholder={otherPlaceholder} autoComplete="off" aria-label={`${legend} — digitar`}
      onChange={(event) => onChange(event.target.value)} /> : null}
  </fieldset>;
}
