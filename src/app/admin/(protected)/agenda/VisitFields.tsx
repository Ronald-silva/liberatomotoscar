import { STORE_POLICY } from '@/data/store-policy';
import styles from '../../admin.module.css';
import type { VehicleOption } from './VisitCard';

export type VisitValues = { data: string; hora: string; vehicleId: string };

/**
 * Dia, hora e veículo, iguais ao marcar e ao corrigir. `type="date"` e `type="time"` abrem o
 * seletor nativo do celular e entregam `AAAA-MM-DD` e `HH:MM`, exatamente o que a regra de horário lê.
 * O horário de funcionamento vem da política da loja: o texto muda junto com ela.
 */
export function VisitFields({ values, onChange, vehicles, minDate, idPrefix }: {
  values: VisitValues; onChange: (next: VisitValues) => void; vehicles: VehicleOption[]; minDate?: string; idPrefix: string;
}) {
  return <>
    <label className={styles.field} htmlFor={`${idPrefix}-dia`}>Dia
      <input id={`${idPrefix}-dia`} className={styles.input} type="date" name="data" required min={minDate}
        value={values.data} onChange={(event) => onChange({ ...values, data: event.target.value })} />
    </label>
    <label className={styles.field} htmlFor={`${idPrefix}-hora`}>Hora
      <input id={`${idPrefix}-hora`} className={styles.input} type="time" name="hora" required
        value={values.hora} onChange={(event) => onChange({ ...values, hora: event.target.value })} />
    </label>
    <p className={styles.description}>A loja atende {STORE_POLICY.horarioEstruturado.rotulo}.</p>
    <label className={styles.field} htmlFor={`${idPrefix}-veiculo`}>Veículo
      <select id={`${idPrefix}-veiculo`} className={styles.input} name="vehicleId" value={values.vehicleId}
        onChange={(event) => onChange({ ...values, vehicleId: event.target.value })}>
        <option value="">Sem veículo definido</option>
        {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}
      </select>
    </label>
  </>;
}
