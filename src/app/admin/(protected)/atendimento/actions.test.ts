import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setSiteMode: vi.fn(),
  assumeInboxConversation: vi.fn(),
  releaseInboxConversation: vi.fn(),
  closeInboxConversation: vi.fn(),
  replyToInboxConversation: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/server/attendance/settings', () => ({ setSiteMode: mocks.setSiteMode }));
vi.mock('@/server/attendance/inbox', () => ({
  assumeInboxConversation: mocks.assumeInboxConversation,
  releaseInboxConversation: mocks.releaseInboxConversation,
  closeInboxConversation: mocks.closeInboxConversation,
  replyToInboxConversation: mocks.replyToInboxConversation,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { changeSiteMode, operateInboxConversation, type ModeFormState } from './actions';

const current: ModeFormState = { mode: 'disabled', version: 1, message: null, error: false };
const form = (mode: string, confirm = 'yes') => {
  const data = new FormData();
  data.set('mode', mode);
  data.set('version', '1');
  if (confirm) data.set('confirm', confirm);
  return data;
};

beforeEach(() => vi.clearAllMocks());

it('não altera o modo sem confirmação explícita', async () => {
  const result = await changeSiteMode(current, form('ai', ''));
  expect(result.error).toBe(true);
  expect(mocks.setSiteMode).not.toHaveBeenCalled();
});

it('devolve a versão nova e não pede repetição se a invalidação falhar depois de gravar', async () => {
  mocks.setSiteMode.mockResolvedValue({ mode: 'deterministic', version: 2 });
  mocks.revalidatePath.mockImplementation(() => { throw new Error('cache'); });
  const result = await changeSiteMode(current, form('deterministic'));
  expect(mocks.setSiteMode).toHaveBeenCalledWith('deterministic', 1);
  expect(result).toEqual({ mode: 'deterministic', version: 2,
    message: 'Modo do site atualizado.', error: false });
});

it('pede atualização quando outra pessoa mudou o modo antes', async () => {
  mocks.setSiteMode.mockRejectedValue(Object.assign(new Error('Atualize a página.'),
    { name: 'StaleAttendanceSettingError' }));
  const result = await changeSiteMode(current, form('ai'));
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
