import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setWhatsappMode: vi.fn(),
  assumeInboxConversation: vi.fn(),
  releaseInboxConversation: vi.fn(),
  closeInboxConversation: vi.fn(),
  deleteInboxConversation: vi.fn(),
  replyToInboxConversation: vi.fn(),
  revalidatePath: vi.fn(),
  requireAdmin: vi.fn(async () => ({ userId: 'admin' })),
  registerMetaTestNumber: vi.fn(),
}));
vi.mock('@/server/attendance/settings', () => ({ setWhatsappMode: mocks.setWhatsappMode }));
vi.mock('@/server/attendance/inbox', () => ({
  assumeInboxConversation: mocks.assumeInboxConversation,
  releaseInboxConversation: mocks.releaseInboxConversation,
  closeInboxConversation: mocks.closeInboxConversation,
  deleteInboxConversation: mocks.deleteInboxConversation,
  replyToInboxConversation: mocks.replyToInboxConversation,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/server/authz', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/server/whatsapp/test-number', () => ({ registerMetaTestNumber: mocks.registerMetaTestNumber }));

import { changeWhatsappMode, connectMetaTestNumber, operateInboxConversation, type ModeFormState } from './actions';

const current: ModeFormState = { mode: 'disabled', version: 1, message: null, error: false };
// A confirmação legítima repete o modo escolhido; `confirm` sozinho é o que a tela antiga fixava.
const form = (mode: string, confirm: string | null = mode) => {
  const data = new FormData();
  data.set('mode', mode);
  data.set('version', '1');
  if (confirm !== null) data.set('confirm', confirm);
  return data;
};

beforeEach(() => vi.clearAllMocks());

it('não altera o modo sem confirmação explícita', async () => {
  const result = await changeWhatsappMode(current, form('ai', null));
  expect(result.error).toBe(true);
  expect(mocks.setWhatsappMode).not.toHaveBeenCalled();
});

it('recusa o confirm fixo em "yes", que não confirma modo nenhum', async () => {
  const result = await changeWhatsappMode(current, form('disabled', 'yes'));
  expect(result).toMatchObject({ error: true, message: 'Confirme a mudança antes de salvar.' });
  expect(mocks.setWhatsappMode).not.toHaveBeenCalled();
});

it('recusa confirmação de um modo diferente do escolhido', async () => {
  const result = await changeWhatsappMode(current, form('disabled', 'ai'));
  expect(result.error).toBe(true);
  expect(mocks.setWhatsappMode).not.toHaveBeenCalled();
});

it('exige administrador antes de registrar o número de teste', async () => {
  mocks.requireAdmin.mockRejectedValueOnce(new Error('Acesso negado'));
  const data = new FormData();
  data.set('phoneNumberId', '1234567890123');
  data.set('wabaId', '9876543210987');
  data.set('accessToken', 'token-sensivel');
  const result = await connectMetaTestNumber({ message: null, error: false }, data);
  expect(result.error).toBe(true);
  expect(mocks.registerMetaTestNumber).not.toHaveBeenCalled();
  expect(result.message).not.toContain('token-sensivel');
});

it('não diz que enviou quando a Meta recusou a resposta', async () => {
  const data = new FormData();
  data.set('conversationId', '11111111-1111-4111-8111-111111111111');
  data.set('intent', 'reply');
  data.set('body', 'Oi.');
  mocks.replyToInboxConversation.mockResolvedValueOnce({ delivered: false, reason: 'A Meta não confirmou o envio.', message: null });
  expect(await operateInboxConversation({ message: null, error: false }, data))
    .toEqual({ message: 'A Meta não confirmou o envio.', error: true });
});

it('devolve a versão nova e não pede repetição se a invalidação falhar depois de gravar', async () => {
  mocks.setWhatsappMode.mockResolvedValue({ mode: 'deterministic', version: 2 });
  mocks.revalidatePath.mockImplementation(() => { throw new Error('cache'); });
  const result = await changeWhatsappMode(current, form('deterministic'));
  expect(mocks.setWhatsappMode).toHaveBeenCalledWith('deterministic', 1);
  expect(result).toEqual({ mode: 'deterministic', version: 2,
    message: 'Modo da Dayse atualizado.', error: false });
});

it('pede atualização quando outra pessoa mudou o modo antes', async () => {
  mocks.setWhatsappMode.mockRejectedValue(Object.assign(new Error('Atualize a página.'),
    { name: 'StaleAttendanceSettingError' }));
  const result = await changeWhatsappMode(current, form('ai'));
  expect(result.error).toBe(true);
  expect(result.message).toContain('Atualize a página');
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it('executa ações do operador na conversa (assumir, responder, devolver e encerrar)', async () => {
  const convId = '89f8cf37-e8cf-4f11-93f6-c92ecae72c71';

  const assumeForm = new FormData();
  assumeForm.set('conversationId', convId);
  assumeForm.set('intent', 'assume');
  const assumed = await operateInboxConversation({ message: null, error: false }, assumeForm);
  expect(mocks.assumeInboxConversation).toHaveBeenCalledWith(convId);
  expect(assumed.error).toBe(false);

  const replyForm = new FormData();
  replyForm.set('conversationId', convId);
  replyForm.set('intent', 'reply');
  replyForm.set('body', 'Olá, posso ajudar com a Titan.');
  mocks.replyToInboxConversation.mockResolvedValueOnce({ delivered: true, reason: null, message: { id: 'm1' } });
  const replied = await operateInboxConversation({ message: null, error: false }, replyForm);
  expect(mocks.replyToInboxConversation).toHaveBeenCalledWith(convId, 'Olá, posso ajudar com a Titan.');
  expect(replied.error).toBe(false);

  const releaseForm = new FormData();
  releaseForm.set('conversationId', convId);
  releaseForm.set('intent', 'release');
  const released = await operateInboxConversation({ message: null, error: false }, releaseForm);
  expect(mocks.releaseInboxConversation).toHaveBeenCalledWith(convId);
  expect(released.error).toBe(false);

  const closeForm = new FormData();
  closeForm.set('conversationId', convId);
  closeForm.set('intent', 'close');
  const closed = await operateInboxConversation({ message: null, error: false }, closeForm);
  expect(mocks.closeInboxConversation).toHaveBeenCalledWith(convId);
  expect(closed.error).toBe(false);

  const deleteForm = new FormData();
  deleteForm.set('conversationId', convId);
  deleteForm.set('intent', 'delete');
  const deleted = await operateInboxConversation({ message: null, error: false }, deleteForm);
  expect(mocks.deleteInboxConversation).toHaveBeenCalledWith(convId);
  expect(deleted.error).toBe(false);
});

it('define todas as classes referenciadas por attendanceStyles em attendance.module.css', () => {
  const dir = import.meta.dirname;
  const css = readFileSync(join(dir, 'attendance.module.css'), 'utf8');
  const defined = new Set<string>();
  for (const block of css.split('{').slice(0, -1)) {
    const selector = block.split('}').at(-1) ?? '';
    for (const match of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) defined.add(match[1]);
  }
  const missing: string[] = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.tsx'))) {
    const source = readFileSync(join(dir, name), 'utf8');
    for (const match of source.matchAll(/\battendanceStyles\.([A-Za-z_][\w]*)/g)) {
      if (!defined.has(match[1])) missing.push(`${match[1]} (${name})`);
    }
  }
  expect(missing).toEqual([]);
});

it('assumir conversa revalida o layout, onde mora o contador da aba Conversas', async () => {
  const data = new FormData();
  data.set('conversationId', '89f8cf37-e8cf-4f11-93f6-c92ecae72c71');
  data.set('intent', 'assume');
  await operateInboxConversation({ message: null, error: false }, data);
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin', 'layout');
});

it('versao velha volta marcada como stale, para a tela nao oferecer repetir', async () => {
  mocks.setWhatsappMode.mockRejectedValue(Object.assign(new Error('Atualize.'), { name: 'StaleAttendanceSettingError' }));
  expect(await changeWhatsappMode(current, form('disabled'))).toMatchObject({ error: true, stale: true });
});
