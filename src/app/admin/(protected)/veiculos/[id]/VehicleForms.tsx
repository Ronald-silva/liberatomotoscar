'use client';

import type { ChangeEvent } from 'react';
import { brandsFor, COMMON_COLORS, modelsFor, suggest, type VehicleType } from '@/data/catalogo-marcas-modelos';
import styles from '../../../admin.module.css';
import { ChipPicker } from '../ChipPicker';
import { Combobox } from '../Combobox';
import { maskMileage, maskPrice, yearOptions } from '../masks';
import { SaveIndicator } from './SaveIndicator';
import type { DraftFieldName, VehicleDraft } from './useVehicleDraft';

/**
 * Quantas fichas de marca e de cor abrem de cara.
 *
 * Seis cabem em duas fileiras num celular de 390px; doze ocupavam quatro. O número é o mesmo nos
 * dois campos de propósito: ritmo igual ao descer a tela.
 */
const CHIPS_VISIVEIS = 6;

export function VehicleForms({ draft, type, currentYear }: { draft: VehicleDraft; type: VehicleType; currentYear: number }) {
  const { fields } = draft;
  const bind = (name: DraftFieldName) => ({
    name, value: fields[name], autoComplete: 'off', className: styles.input,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => draft.set(name, event.target.value),
  });
  const brands = brandsFor(type);
  const models = modelsFor(type, fields.brand);

  return <div className={styles.form} onBlurCapture={() => draft.flush()}>
    <ChipPicker legend="Marca"
      options={brands} value={fields.brand} onChange={(value) => { draft.set('brand', value); draft.set('model', ''); }}
      otherLabel="Outra marca" otherPlaceholder="Digite a marca"
      visibleCount={CHIPS_VISIVEIS} allLabel="Ver todas as marcas" />

    <Combobox label="Modelo" value={fields.model} onChange={(value) => draft.set('model', value)}
      options={models} suggest={suggest} placeholder="Ex: CG 160 Fan, Gol, Onix..."
      disabledHint="Escolha a marca primeiro para ver sugestões." />

    <div className={styles.formGrid2}>
      <label className={styles.field}>Ano
        <select className={styles.input} name="year" value={fields.year} onChange={(event) => draft.set('year', event.target.value)}>
          <option value="">Não informado</option>
          {yearOptions(currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>

      <div className={styles.field}>
        <label htmlFor="vehicle-mileage">Quilometragem</label>
        <input {...bind('mileageKm')} id="vehicle-mileage" aria-describedby="vehicle-mileage-hint" inputMode="numeric" placeholder="25.000"
          onChange={(event) => draft.set('mileageKm', maskMileage(event.target.value))} />
        <span id="vehicle-mileage-hint" className={styles.visuallyHidden}>Só números. O ponto é colocado sozinho.</span>
      </div>
    </div>

    <div className={styles.formGrid2}>
      <div className={styles.field}>
        <label htmlFor="vehicle-price">Preço</label>
        <input {...bind('price')} id="vehicle-price" aria-describedby="vehicle-price-hint" inputMode="numeric" placeholder="18.500"
          onChange={(event) => draft.set('price', maskPrice(event.target.value))} />
        <span id="vehicle-price-hint" className={styles.visuallyHidden}>Em reais, sem centavos.</span>
      </div>
      <div>
        <ChipPicker legend="Cor" options={COMMON_COLORS} value={fields.color}
          onChange={(value) => draft.set('color', value)} otherLabel="Outra cor" otherPlaceholder="Digite a cor"
          visibleCount={CHIPS_VISIVEIS} allLabel="Ver todas as cores" />
      </div>
    </div>

    <details className={styles.optional}>
      <summary className={styles.optionalSummary}>+ Informações opcionais (versão e descrição)</summary>
      <label className={styles.field}>Versão / Acabamento
        <input {...bind('versionName')} maxLength={160} placeholder="Ex: Flex, ESDi, Sahara, 1.0 MPI..." />
      </label>
      <label className={styles.field}>Descrição complementar
        <textarea {...bind('description')} maxLength={5000} rows={4}
          placeholder="Destaques do veículo: único dono, revisões em dia, pneus novos, garantia..." />
      </label>
    </details>

    <SaveIndicator state={draft.saveState} message={draft.message} onRetry={draft.retry} />
  </div>;
}
