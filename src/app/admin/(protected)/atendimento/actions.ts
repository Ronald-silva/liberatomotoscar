'use server';

import { revalidatePath } from 'next/cache';
import {
  assumeInboxConversation,
  closeInboxConversation,
  releaseInboxConversation,
  replyToInboxConversation,
} from '@/server/attendance/inbox';
import { setSiteMode, type AttendanceMode } from '@/server/attendance/settings';

export type ModeFormState = { mode: AttendanceMode; version: number; message: string | null; error: boolean };
export type InboxActionState = { message: string | null; error: boolean };

function revalidateAttendance() {
  try { revalidatePath('/admin/atendimento'); } catch { /* próxima navegação lê o banco */ }
}

export async function changeSiteMode(previous: ModeFormState, formData: FormData): Promise<ModeFormState> {
  let setting: Awaited<ReturnType<typeof setSiteMode>>;
  try {
    if (formData.get('confirm') !== 'yes') {
      return { ...previous, message: 'Confirme a mudança antes de salvar.', error: true };
    }
    setting = await setSiteMode(formData.get('mode'), Number(formData.get('version')));
  } catch (error) {
    const message = error instanceof Error && error.name === 'StaleAttendanceSettingError'
      ? error.message : 'Não foi possível alterar o modo. Confira os dados e tente novamente.';
    return { ...previous, message, error: true };
  }
  // A mudança já foi gravada. Uma falha de invalidação não deve mandar repetir a ação.
  revalidateAttendance();
  return { mode: setting.mode, version: setting.version,
    message: setting.mode === previous.mode ? 'O modo já estava selecionado.' : 'Modo do site atualizado.', error: false };
}

export async function operateInboxConversation(_previous: InboxActionState, formData: FormData): Promise<InboxActionState> {
  const id = String(formData.get('conversationId') ?? '');
  const intent = String(formData.get('intent') ?? '');
  try {
    if (intent === 'assume') {
      await assumeInboxConversation(id);
      revalidateAttendance();
      return { message: 'Conversa assumida. As respostas automáticas foram suspensas.', error: false };
    }
    if (intent === 'release') {
      await releaseInboxConversation(id);
      revalidateAttendance();
      return { message: 'Conversa devolvida para o modo automático.', error: false };
    }
    if (intent === 'close') {
      await closeInboxConversation(id);
      revalidateAttendance();
      return { message: 'Conversa encerrada.', error: false };
    }
    if (intent === 'reply') {
      await replyToInboxConversation(id, formData.get('body'));
      revalidateAttendance();
      return { message: 'Resposta enviada.', error: false };
    }
    return { message: 'Ação inválida.', error: true };
  } catch (error) {
    const message = error instanceof Error && error.name === 'ConversationStateError'
      ? error.message
      : 'Não foi possível concluir a ação na conversa. Confira os dados e tente novamente.';
    return { message, error: true };
  }
}
