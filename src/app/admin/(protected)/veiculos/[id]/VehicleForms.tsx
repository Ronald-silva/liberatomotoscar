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
  const isMotorcycle = type === 'motorcycle';

  return <div className={styles.form} onBlurCapture={() => draft.flush()}>
    {/* As listas do catálogo já estão na ordem do que a loja vende, então as seis primeiras
        resolvem quase todo cadastro e o resto fica a um toque. Antes, marca e cor somavam 25
        fichas abertas ao mesmo tempo — meia tela de celular de decisões antes do primeiro campo
        de texto. Nada foi removido do catálogo. */}
    <ChipPicker legend="Marca" hint={isMotorcycle ? 'Toque na marca da moto.' : 'Toque na marca do carro.'}
      options={brands} value={fields.brand} onChange={(value) => { draft.set('brand', value); draft.set('model', ''); }}
      otherLabel="Outra marca" otherPlaceholder="Digite a marca"
      visibleCount={CHIPS_VISIVEIS} allLabel="Ver todas as marcas" />

    <Combobox label="Modelo" value={fields.model} onChange={(value) => draft.set('model', value)}
      options={models} suggest={suggest} placeholder="Comece a digitar"
      hint="Digite as primeiras letras e toque na sugestão."
      disabledHint="Escolha a marca primeiro e as sugestões aparecem aqui." />

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
      <span id="vehicle-mileage-hint" className={styles.chipHint}>Só números. O ponto é colocado sozinho.</span>
    </div>

    <ChipPicker legend="Cor" options={COMMON_COLORS} value={fields.color}
      onChange={(value) => draft.set('color', value)} otherLabel="Outra cor" otherPlaceholder="Digite a cor"
      visibleCount={CHIPS_VISIVEIS} allLabel="Ver todas as cores" />

    <div className={styles.field}>
      <label htmlFor="vehicle-price">Preço</label>
      <input {...bind('price')} id="vehicle-price" aria-describedby="vehicle-price-hint" inputMode="numeric" placeholder="18.500"
        onChange={(event) => draft.set('price', maskPrice(event.target.value))} />
      <span id="vehicle-price-hint" className={styles.chipHint}>Em reais, sem centavos. Digite 18500 e aparece 18.500.</span>
    </div>

    <details className={styles.optional}>
      <summary className={styles.optionalSummary}>Detalhes opcionais</summary>
      <label className={styles.field}>Versão
        <input {...bind('versionName')} maxLength={160} placeholder="Flex, ESDi, Sahara..." />
      </label>
      <label className={styles.field}>Descrição
        <textarea {...bind('description')} maxLength={5000} rows={5}
          placeholder="Único dono, revisões em dia, pneus novos..." />
      </label>
    </details>

    <SaveIndicator state={draft.saveState} message={draft.message} onRetry={draft.retry} />
  </div>;
}
