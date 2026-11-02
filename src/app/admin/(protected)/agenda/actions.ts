'use server';

import { revalidatePath } from 'next/cache';
import {
  AppointmentInputError, createManualAppointment, deleteAppointment, updateAppointment,
} from '@/server/attendance/appointments';
import type { FormState } from '../veiculos/actions';

// `ok` separa gravou de não gravou: o `FormState` só carrega o texto, e a tela precisa saber se
// limpa o formulário (gravou) ou deixa o que foi digitado e mostra o motivo (não gravou).
export type AgendaFormState = FormState & { ok: boolean };

const GENERIC = 'Não foi possível salvar agora. Tente de novo.';
const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
// Campo ausente é "não mexi nisso" (undefined); só o campo presente e vazio é "sem veículo" (null).
// Um formulário que não perguntou pelo veículo não pode, por omissão, apagar o vínculo.
const vehicleOf = (data: FormData) => data.has('vehicleId') ? (text(data, 'vehicleId') || null) : undefined;

async function run(success: string, apply: () => Promise<unknown>): Promise<AgendaFormState> {
  try {
    await apply();
  } catch (error) {
    // Só o erro de domínio tem texto feito para a pessoa; o resto (banco, rede, acesso) vira o genérico.
    return { message: error instanceof AppointmentInputError ? error.message : GENERIC, ok: false };
  }
  // Já gravou. Falha de invalidação não pode virar "não salvou": a próxima leitura traz o dado.
  try { revalidatePath('/admin/agenda'); } catch { /* rota dinâmica lê o banco no próximo pedido */ }
  return { message: success, ok: true };
}

export async function marcarVisita(_state: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  return run('Visita marcada.', () => createManualAppointment({
    customerName: text(formData, 'customerName'), customerPhone: text(formData, 'customerPhone'),
    vehicleId: vehicleOf(formData) ?? null, data: text(formData, 'data'), hora: text(formData, 'hora'),
  }));
}

export async function corrigirVisita(_state: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  return run('Visita corrigida.', () => updateAppointment(text(formData, 'id'), {
    data: text(formData, 'data'), hora: text(formData, 'hora'), vehicleId: vehicleOf(formData),
  }));
}

export async function cancelarVisita(_state: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  return run('Visita cancelada.', () => deleteAppointment(text(formData, 'id')));
}
