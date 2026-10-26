'use client';

import { useActionState, useState, type ChangeEvent } from 'react';
import { brandsFor, COMMON_COLORS, modelsFor, suggest, type VehicleType } from '@/data/catalogo-marcas-modelos';
import styles from '../../../admin.module.css';
import { saveVehicle, type FormState } from '../actions';
import { ChipPicker } from '../ChipPicker';
import { Combobox } from '../Combobox';
import { FormNotice } from '../FormNotice';
import { maskMileage, maskPrice, priceToText, yearOptions } from '../masks';
import { SubmitButton } from '../SubmitButton';

type Vehicle = {
  id: string; versionNumber: number; type: VehicleType; brand: string | null; model: string | null; version: string | null;
  year: number | null; mileageKm: number | null; color: string | null; description: string | null; priceCents: number | null;
};

const initial: FormState = { message: null };

// Campos controlados: o React 19 limpa campos não controlados depois de toda action, até com erro.
// Um formulário só, um botão só: o serviço grava dados e preço na mesma transação, então não
// existe mais o estado de ter salvo um e não o outro.
export function VehicleForms({ vehicle, currentYear }: { vehicle: Vehicle; currentYear: number }) {
  const [state, action] = useActionState(saveVehicle, initial);
  const [fields, setFields] = useState({
    brand: vehicle.brand ?? '', model: vehicle.model ?? '', versionName: vehicle.version ?? '',
    year: String(vehicle.year ?? ''), mileageKm: vehicle.mileageKm === null ? '' : maskMileage(String(vehicle.mileageKm)),
    color: vehicle.color ?? '', description: vehicle.description ?? '', price: priceToText(vehicle.priceCents),
  });
  const set = (name: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [name]: value }));
  const bind = (name: keyof typeof fields) => ({
    name, value: fields[name], autoComplete: 'off', className: styles.input,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(name, event.target.value),
  });
  const brands = brandsFor(vehicle.type);
  const models = modelsFor(vehicle.type, fields.brand);
  const isMotorcycle = vehicle.type === 'motorcycle';

  return <form className={`${styles.form} ${styles.formSticky}`} action={action}>
    <input type="hidden" name="id" value={vehicle.id} />
    <input type="hidden" name="version" value={vehicle.versionNumber} />
    {/* Os valores escolhidos por toque viajam em campos ocultos: o que vai para o servidor é o
        mesmo nome de campo de antes, seja escolhido na lista ou digitado. */}
    <input type="hidden" name="brand" value={fields.brand} />
    <input type="hidden" name="model" value={fields.model} />
    <input type="hidden" name="color" value={fields.color} />

    <ChipPicker legend="Marca" hint={isMotorcycle ? 'Toque na marca da moto.' : 'Toque na marca do carro.'}
      options={brands} value={fields.brand} onChange={(value) => { set('brand', value); set('model', ''); }}
      otherLabel="Outra marca" otherPlaceholder="Digite a marca" />

    <Combobox label="Modelo" value={fields.model} onChange={(value) => set('model', value)}
      options={models} suggest={suggest} placeholder="Comece a digitar"
      hint="Digite as primeiras letras e toque na sugestão."
      disabledHint="Escolha a marca primeiro e as sugestões aparecem aqui." />

    <label className={styles.field}>Ano
      <select className={styles.input} name="year" value={fields.year} onChange={(event) => set('year', event.target.value)}>
        <option value="">Não informado</option>
        {yearOptions(currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
      </select>
    </label>

    <label className={styles.field}>Quilometragem
      <input {...bind('mileageKm')} inputMode="numeric" placeholder="25.000"
        onChange={(event) => set('mileageKm', maskMileage(event.target.value))} />
      <span className={styles.chipHint}>Só números. O ponto é colocado sozinho.</span>
    </label>

    <ChipPicker legend="Cor" options={COMMON_COLORS} value={fields.color}
      onChange={(value) => set('color', value)} otherLabel="Outra cor" otherPlaceholder="Digite a cor" />

    <label className={styles.field}>Preço
      <input {...bind('price')} inputMode="numeric" placeholder="18.500"
        onChange={(event) => set('price', maskPrice(event.target.value))} />
      <span className={styles.chipHint}>Em reais, sem centavos. Digite 18500 e aparece 18.500.</span>
    </label>

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

    {/* A mensagem fica acima do botão fixo: embaixo dele ela nasceria fora da tela, logo onde a
        pessoa acabou de tocar. */}
    <FormNotice message={state.message} vehicleId={vehicle.id} />
    <div className={styles.stickyAction}>
      <SubmitButton label="Salvar" />
    </div>
  </form>;
}
