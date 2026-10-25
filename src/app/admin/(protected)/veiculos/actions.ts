'use server';

import { revalidatePath } from 'next/cache';
import { addPhoto, removePhoto, updateDetails, updatePrice } from '@/server/vehicles/service';
import { toFormMessage } from './feedback';

export type FormState = { message: string | null };

const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const orNull = (value: string) => value === '' ? null : value;

function wholeNumber(value: string): number | null {
  if (value === '') return null;
  if (!/^\d{1,10}$/.test(value)) throw new Error('Ano e quilometragem devem ser números inteiros.');
  return Number(value);
}

// Aceita 18500, 18.500, 18500,00 e 18.500,00 (com ou sem "R$"); nunca usa ponto flutuante.
function parsePriceCents(typed: string): number | null {
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(typed.replace(/^R\$\s*/, '').trim());
  if (!match) return null;
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  return Number(match[1].replaceAll('.', '')) * 100 + cents;
}

async function run(data: FormData, success: string, apply: (id: string, version: number) => Promise<unknown>): Promise<FormState> {
  const id = text(data, 'id');
  try {
    await apply(id, Number(text(data, 'version')));
    revalidatePath('/admin');
    revalidatePath(`/admin/veiculos/${id}`);
    return { message: success };
  } catch (error) {
    return { message: toFormMessage(error) };
  }
}

export async function saveDetails(_state: FormState, formData: FormData): Promise<FormState> {
  return run(formData, 'Dados salvos.', (id, version) => updateDetails(id, version, {
    brand: orNull(text(formData, 'brand')),
    model: orNull(text(formData, 'model')),
    version: orNull(text(formData, 'versionName')),
    year: wholeNumber(text(formData, 'year')),
    mileageKm: wholeNumber(text(formData, 'mileageKm')),
    color: orNull(text(formData, 'color')),
    description: orNull(text(formData, 'description')),
  }));
}

export async function savePrice(_state: FormState, formData: FormData): Promise<FormState> {
  const cents = parsePriceCents(text(formData, 'price'));
  if (cents === null) return { message: toFormMessage(new Error('Informe o preço em reais, por exemplo 18.500,00.')) };
  return run(formData, 'Preço salvo.', (id, version) => updatePrice(id, version, cents));
}

export async function addVehiclePhoto(_state: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) return { message: toFormMessage(new Error('Escolha uma foto para enviar.')) };
  // O serviço confere a assinatura real dos bytes; o tipo aqui só diz qual assinatura esperar.
  return run(formData, 'Foto adicionada.', async (id, version) => addPhoto(id, version, new Uint8Array(await file.arrayBuffer()), file.type));
}

export async function removeVehiclePhoto(_state: FormState, formData: FormData): Promise<FormState> {
  return run(formData, 'Foto removida.', (id, version) => removePhoto(id, text(formData, 'imageId'), version));
}
