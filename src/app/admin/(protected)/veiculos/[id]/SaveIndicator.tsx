'use client';

import styles from '../../../admin.module.css';
import type { SaveState } from './useVehicleDraft';

export function SaveIndicator({ state, message, onRetry }: { state: SaveState; message: string | null; onRetry: () => void }) {
  return <div className={styles.saveIndicator} role="status" aria-live="polite" aria-atomic="true">
    {state === 'saving' ? 'Salvando...' : null}
    {state === 'saved' ? '✓ salvo' : null}
    {state === 'error' ? <>
      <span>{message ?? 'Não foi possível salvar agora. Tente de novo.'}</span>
      <button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} type="button" onClick={onRetry}>Tentar de novo</button>
    </> : null}
  </div>;
}
