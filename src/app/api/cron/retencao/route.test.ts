import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runRetention: vi.fn() }));
vi.mock('@/server/retention/run', () => ({ runRetention: mocks.runRetention }));

import { GET } from './route';

const pedido = (authorization?: string) => new Request('https://exemplo.com/api/cron/retencao', {
  headers: authorization ? { authorization } : undefined,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runRetention.mockResolvedValue({ conversas: { status: 'ok', detalhe: {} },
    arquivos: { status: 'ok', detalhe: {} }, falhas: 0, em: '2026-11-15T06:17:00.000Z' });
});
afterEach(() => { vi.unstubAllEnvs(); });

it('executa a retenção quando o agendador envia o segredo', async () => {
  vi.stubEnv('CRON_SECRET', 'segredo-do-agendamento');
  const response = await GET(pedido('Bearer segredo-do-agendamento'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ falhas: 0 });
  expect(mocks.runRetention).toHaveBeenCalledTimes(1);
});

it('recusa sem cabeçalho, com segredo errado e com segredo de outro tamanho', async () => {
  vi.stubEnv('CRON_SECRET', 'segredo-do-agendamento');
  for (const header of [undefined, 'Bearer errado', 'Bearer segredo-do-agendamentoX', 'segredo-do-agendamento']) {
    const response = await GET(pedido(header));
    expect(response.status).toBe(403);
  }
  expect(mocks.runRetention).not.toHaveBeenCalled();
});

it('sem CRON_SECRET a rota não apaga nada, mesmo com cabeçalho vazio casando', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('CRON_SECRET', '');
  const response = await GET(pedido('Bearer '));
  expect(response.status).toBe(503);
  expect(mocks.runRetention).not.toHaveBeenCalled();
  log.mockRestore();
});

it('etapa falhada responde 500 para o agendador marcar a execução como erro', async () => {
  vi.stubEnv('CRON_SECRET', 'segredo-do-agendamento');
  mocks.runRetention.mockResolvedValue({ conversas: { status: 'falhou', erro: 'Error' },
    arquivos: { status: 'ok', detalhe: {} }, falhas: 1, em: '2026-11-15T06:17:00.000Z' });
  const response = await GET(pedido('Bearer segredo-do-agendamento'));
  expect(response.status).toBe(500);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
