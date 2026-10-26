'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addPhoto, createDraft, changeVehicleStatus, discardDraft, removePhoto, setCoverPhoto, updateVehicle } from '@/server/vehicles/service';
import { publishRequirements } from '@/server/vehicles/validation';
import { toFormMessage } from './feedback';

// `version` só vem preenchido quando a operação incrementou a versão do veículo e a tela precisa
// dela em seguida — é o caso do envio de várias fotos, uma após a outra, sem recarregar.
// `missing` só vem do salvamento: o que ainda falta para publicar, já recalculado, para a tela
// não precisar perguntar de novo ao servidor a cada pausa na digitação.
export type FormState = { message: string | null; version?: number; missing?: readonly string[] };

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

// A versão nova, quando o serviço a devolve, volta para a tela no FormState.
function newVersionOf(result: unknown): number | undefined {
  if (typeof result !== 'object' || result === null || !('vehicleVersion' in result)) return undefined;
  const version = (result as { vehicleVersion: unknown }).vehicleVersion;
  return typeof version === 'number' ? version : undefined;
}

async function run(data: FormData, success: string, apply: (id: string, version: number) => Promise<unknown>): Promise<FormState> {
  const id = text(data, 'id');
  try {
    const result = await apply(id, Number(text(data, 'version'))); // apply pode lançar antes de chamar o serviço
    revalidatePath('/admin');
    revalidatePath(`/admin/veiculos/${id}`);
    return { message: success, version: newVersionOf(result) };
  } catch (error) {
    return { message: toFormMessage(error) };
  }
}

// Campo de preço vazio significa "preço ainda não definido": não mexe no que está salvo.
// Texto que não é preço é erro, não silêncio.
function readPriceCents(typed: string): number | undefined {
  if (typed === '') return undefined;
  const cents = parsePriceCents(typed);
  return cents === null ? fail('Informe o preço em reais, por exemplo 18.500,00.') : cents;
}

// Um único salvamento para a tela inteira: dados e preço na mesma transação do serviço.
// Não usa `run`: devolve também as pendências e, de propósito, não revalida a rota de detalhe —
// a tela é dona da versão e das pendências, e revalidar a cada pausa na digitação refaria a
// assinatura das fotos e baixaria a galeria inteira de novo.
export async function saveVehicle(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    // Limites iguais aos do serviço, validados aqui para dar a mensagem certa em vez da genérica.
    const short = (key: string) => limitedText(text(formData, key), 160, 'Marca, modelo, versão e cor aceitam até 160 caracteres.');
    const year = wholeNumber(text(formData, 'year'));
    const mileageKm = wholeNumber(text(formData, 'mileageKm'));
    if (year !== null && (year < 1900 || year > 2100)) fail('O ano deve estar entre 1900 e 2100.');
    if (mileageKm !== null && mileageKm > MAX_INT) fail('A quilometragem informada é grande demais.');
    const priceCents = readPriceCents(text(formData, 'price'));
    const { imageCount, ...saved } = await updateVehicle(text(formData, 'id'), Number(text(formData, 'version')), {
      details: {
        brand: short('brand'), model: short('model'), version: short('versionName'), year, mileageKm, color: short('color'),
        description: limitedText(text(formData, 'description'), 5000, 'A descrição aceita até 5000 caracteres.'),
      },
      priceCents,
    });
    revalidatePath('/admin');
    const missing = publishRequirements(saved, imageCount).filter((item) => !item.done).map((item) => item.label);
    return { message: 'Veículo salvo.', version: saved.versionNumber, missing };
  } catch (error) {
    return { message: toFormMessage(error) };
  }
}

export async function setVehicleCover(_state: FormState, formData: FormData): Promise<FormState> {
  return run(formData, 'Capa atualizada.', (id, version) => setCoverPhoto(id, text(formData, 'imageId'), version));
}

export async function discardVehicleDraft(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    await discardDraft(text(formData, 'id'), Number(text(formData, 'version')));
  } catch (error) {
    return { message: toFormMessage(error) };
  }
  // O rascunho já foi excluído aqui: falha ao revalidar não pode virar mensagem de erro, ou a
  // pessoa ficaria numa tela de um anúncio que não existe mais. A lista se corrige na próxima navegação.
  try { revalidatePath('/admin'); } catch { /* ver acima */ }
  redirect('/admin'); // redirect lança: um catch o engoliria
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

const VEHICLE_TYPES = ['motorcycle', 'car'] as const;

export async function createVehicle(_state: FormState, formData: FormData): Promise<FormState> {
  const type = VEHICLE_TYPES.find((known) => known === text(formData, 'type'));
  if (!type) return { message: toFormMessage(new Error('Escolha moto ou carro.')) };
  let id: string;
  try {
    id = (await createDraft({ type })).id;
  } catch (error) {
    return { message: toFormMessage(error) };
  }
  // O rascunho já existe neste ponto, então nada pode impedir a ida até ele. Dentro do try acima,
  // uma falha ao revalidar virava mensagem de erro com o veículo JÁ criado — a pessoa tocava de
  // novo e nascia um órfão por toque. Fora do try sem proteção, a falha derrubava o
  // redirecionamento e dava no mesmo. O preço de engolir o erro é a lista do estoque ficar uma
  // navegação desatualizada; o preço de não redirecionar é rascunho duplicado.
  try { revalidatePath('/admin'); } catch { /* lista se corrige na próxima navegação */ }
  redirect(`/admin/veiculos/${id}`); // redirect lança: um catch o engoliria
}
