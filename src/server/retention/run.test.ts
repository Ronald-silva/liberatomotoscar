import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ purge: vi.fn(), retry: vi.fn() }));
vi.mock('@/server/attendance/conversation-repository', () => ({ purgeExpiredConversations: mocks.purge }));
vi.mock('@/server/storage/cleanup', () => ({ retryPendingR2Cleanup: mocks.retry }));

import { runRetention } from './run';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.purge.mockResolvedValue({ conversations: 3, rateLimitWindows: 2 });
  mocks.retry.mockResolvedValue({ checked: 4, deleted: 4, failed: 0, stillReferenced: 0 });
});

it('chama as duas rotinas que antes não tinham chamador e devolve o que cada uma apagou', async () => {
  const resultado = await runRetention();
  expect(mocks.purge).toHaveBeenCalledTimes(1);
  expect(mocks.retry).toHaveBeenCalledTimes(1);
  expect(resultado).toMatchObject({
    conversas: { status: 'ok', detalhe: { conversations: 3, rateLimitWindows: 2 } },
    arquivos: { status: 'ok', detalhe: { checked: 4, deleted: 4 } },
    falhas: 0,
  });
});

it('R2 sem credencial não impede o expurgo das conversas', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.retry.mockRejectedValue(new Error('R2_BUCKET não configurado.'));
  const resultado = await runRetention();
  expect(mocks.purge).toHaveBeenCalledTimes(1);
  expect(resultado.conversas).toMatchObject({ status: 'ok' });
  expect(resultado.arquivos).toMatchObject({ status: 'falhou', erro: 'Error' });
  expect(resultado.falhas).toBe(1);
  log.mockRestore();
});

it('banco indisponível não impede a limpeza do R2 e é contado como falha', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.purge.mockRejectedValue(new Error('conexão recusada'));
  const resultado = await runRetention();
  expect(mocks.retry).toHaveBeenCalledTimes(1);
  expect(resultado.conversas).toMatchObject({ status: 'falhou' });
  expect(resultado.arquivos).toMatchObject({ status: 'ok' });
  expect(resultado.falhas).toBe(1);
  log.mockRestore();
});

it('não expõe a mensagem do erro no resultado, só o nome', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.purge.mockRejectedValue(new Error('postgres://usuario:senha@host/banco recusou conexão'));
  const resultado = await runRetention();
  expect(JSON.stringify(resultado)).not.toContain('senha');
  log.mockRestore();
});
