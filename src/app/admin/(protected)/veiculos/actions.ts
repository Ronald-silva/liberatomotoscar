'use server';

import { revalidatePath } from 'next/cache';
import { addPhoto, changeVehicleStatus, removePhoto, updateDetails, updatePrice } from '@/server/vehicles/service';
import { toFormMessage } from './feedback';

export type FormState = { message: string | null };

const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const orNull = (value: string) => value === '' ? null : value;

const MAX_INT = 2_147_483_647;
const fail = (message: string): never => { throw new Error(message); };

// Aceita 15000 e 15.000 (ponto de milhar); recusa o resto antes de chegar ao serviço.
function wholeNumber(value: string): number | null {
  if (value === '') return null;
  const digits = /^\d{1,3}(\.\d{3})+$/.test(value) ? value.replaceAll('.', '') : value;
  if (!/^\d{1,10}$/.test(digits)) return fail('Ano e quilometragem devem ser números inteiros.');
  return Number(digits);
}

function limitedText(value: string, max: number, message: string): string | null {
  return value.length > max ? fail(message) : orNull(value);
}

// Aceita 18500, 18.500, 18500,00 e 18.500,00 (com ou sem "R$"); nunca usa ponto flutuante.
function parsePriceCents(typed: string): number | null {
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(typed.replace(/^R\$\s*/, '').trim());
  if (!match) return null;
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const total = Number(match[1].replaceAll('.', '')) * 100 + cents;
  return total > MAX_INT ? fail('O preço máximo é R$ 21.474.836,47.') : total;
}

async function run(data: FormData, success: string, apply: (id: string, version: number) => Promise<unknown>): Promise<FormState> {
  const id = text(data, 'id');
  try {
    await apply(id, Number(text(data, 'version'))); // apply pode lançar antes de chamar o serviço
    revalidatePath('/admin');
    revalidatePath(`/admin/veiculos/${id}`);
    return { message: success };
  } catch (error) {
    return { message: toFormMessage(error) };
  }
}

export async function saveDetails(_state: FormState, formData: FormData): Promise<FormState> {
  return run(formData, 'Dados salvos.', (id, version) => {
    // Limites iguais aos do serviço, validados aqui para dar a mensagem certa em vez da genérica.
    const short = (key: string) => limitedText(text(formData, key), 160, 'Marca, modelo, versão e cor aceitam até 160 caracteres.');
    const year = wholeNumber(text(formData, 'year'));
    const mileageKm = wholeNumber(text(formData, 'mileageKm'));
    if (year !== null && (year < 1900 || year > 2100)) fail('O ano deve estar entre 1900 e 2100.');
    if (mileageKm !== null && mileageKm > MAX_INT) fail('A quilometragem informada é grande demais.');
    return updateDetails(id, version, {
      brand: short('brand'), model: short('model'), version: short('versionName'), year, mileageKm, color: short('color'),
      description: limitedText(text(formData, 'description'), 5000, 'A descrição aceita até 5000 caracteres.'),
    });
  });
}

export async function savePrice(_state: FormState, formData: FormData): Promise<FormState> {
  let cents: number | null;
  try { cents = parsePriceCents(text(formData, 'price')); } catch (error) { return { message: toFormMessage(error) }; }
  if (cents === null) return { message: toFormMessage(new Error('Informe o preço em reais, por exemplo 18.500,00.')) };
  const price = cents;
  return run(formData, 'Preço salvo.', (id, version) => updatePrice(id, version, price));
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

export async function changeStatus(_state: FormState, formData: FormData): Promise<FormState> {
  // O serviço valida a transição e exige confirmAvailability === true para publicar.
  const confirmAvailability = text(formData, 'confirmAvailability') === 'true';
  return run(formData, 'Estado atualizado.', (id, version) => changeVehicleStatus(id, version, text(formData, 'status'), { confirmAvailability }));
}
