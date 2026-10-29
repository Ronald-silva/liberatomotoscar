'use server';

import { revalidatePath } from 'next/cache';
import {
  assumeInboxConversation,
  closeInboxConversation,
  deleteInboxConversation,
  releaseInboxConversation,
  replyToInboxConversation,
} from '@/server/attendance/inbox';
import { setSiteMode, type AttendanceMode } from '@/server/attendance/settings';
import { requireAdmin } from '@/server/authz';
import { checkMetaTestNumberStatus, registerMetaTestNumber } from '@/server/whatsapp/test-number';

export type ModeFormState = { mode: AttendanceMode; version: number; message: string | null; error: boolean };
export type InboxActionState = { message: string | null; error: boolean };
export type TestNumberState = { message: string | null; error: boolean };

function revalidateAttendance() {
  try { revalidatePath('/admin/atendimento'); } catch { /* próxima navegação lê o banco */ }
}

export async function connectMetaTestNumber(_previous: TestNumberState, formData: FormData): Promise<TestNumberState> {
  try {
    await requireAdmin();
    const saved = await registerMetaTestNumber({
      phoneNumberId: String(formData.get('phoneNumberId') ?? ''),
      wabaId: String(formData.get('wabaId') ?? ''),
      accessToken: String(formData.get('accessToken') ?? ''),
    });
    revalidateAttendance();
    return {
      message: `Token salvo e validado para o número de teste ${saved.displayPhoneNumber ?? saved.whatsappPhoneNumberId}. Envie “Boa tarde” do celular verificado em “To” para testar a Dayse.`,
      error: false,
    };
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Não foi possível conectar o número de teste.', error: true };
  }
}

export async function verifyMetaTestNumber(_previous: TestNumberState): Promise<TestNumberState> {
  void _previous;
  try {
    await requireAdmin();
    const status = await checkMetaTestNumberStatus();
    return { message: status.message, error: !status.ok };
  } catch {
    return { message: 'Não foi possível consultar a Meta agora. Tente novamente.', error: true };
  }
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
    if (intent === 'delete') {
      await deleteInboxConversation(id);
      revalidateAttendance();
      return { message: 'Conversa excluída.', error: false };
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
