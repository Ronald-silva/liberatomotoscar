import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { notifyOps } from './alert';

const ok = () => new Response('', { status: 200 });

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

it('entrega o alerta no webhook configurado em formato que Slack e Discord mostram', async () => {
  vi.stubEnv('OPS_ALERT_WEBHOOK_URL', 'https://hooks.exemplo.com/liberato');
  const send = vi.fn(async () => ok());
  expect(await notifyOps({ evento: 'cliente_sem_atendimento', resumo: 'cliente sem resposta',
    conversationId: 'c1' }, send as unknown as typeof fetch)).toBe('enviado');

  const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://hooks.exemplo.com/liberato');
  expect(init.method).toBe('POST');
  const corpo = JSON.parse(String(init.body));
  expect(corpo).toMatchObject({ origem: 'liberato-motos-car', evento: 'cliente_sem_atendimento',
    conversationId: 'c1' });
  expect(corpo.text).toContain('cliente sem resposta');
  expect(corpo.content).toBe(corpo.text);
});

it('não envia telefone, nome nem texto da mensagem do cliente', async () => {
  vi.stubEnv('OPS_ALERT_WEBHOOK_URL', 'https://hooks.exemplo.com/liberato');
  const send = vi.fn(async () => ok());
  await notifyOps({ evento: 'cliente_sem_atendimento', resumo: 'cliente sem resposta',
    conversationId: 'c1', detalhe: 'Error: timeout' }, send as unknown as typeof fetch);
  const corpo = String((send.mock.calls[0] as unknown as [string, RequestInit])[1].body);
  expect(corpo).not.toMatch(/5585\d+/);
  expect(Object.keys(JSON.parse(corpo)).sort()).toEqual(
    ['content', 'conversationId', 'detalhe', 'em', 'evento', 'motivo', 'origem', 'severidade', 'text']);
});

it('sem destino configurado avisa no log e devolve sem_destino, sem lançar', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('OPS_ALERT_WEBHOOK_URL', '');
  const send = vi.fn(async () => ok());
  expect(await notifyOps({ evento: 'encaminhamento_nao_registrado', resumo: 'x' },
    send as unknown as typeof fetch)).toBe('sem_destino');
  expect(send).not.toHaveBeenCalled();
  expect(log.mock.calls[0]?.[1]).toContain('alerta_sem_destino');
  log.mockRestore();
});

it('recusa destino sem https e destino inválido, em vez de mandar id de conversa em claro', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const send = vi.fn(async () => ok());
  for (const destino of ['http://hooks.exemplo.com/liberato', 'nao-e-url']) {
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', destino);
    expect(await notifyOps({ evento: 'cliente_sem_atendimento', resumo: 'x', conversationId: 'c1' },
      send as unknown as typeof fetch)).toBe('sem_destino');
  }
  expect(send).not.toHaveBeenCalled();
  log.mockRestore();
});

it('destino fora do ar ou recusando não lança: devolve falhou', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('OPS_ALERT_WEBHOOK_URL', 'https://hooks.exemplo.com/liberato');
  const quebrado = vi.fn(async () => { throw new Error('rede fora'); });
  expect(await notifyOps({ evento: 'cliente_sem_atendimento', resumo: 'x' },
    quebrado as unknown as typeof fetch)).toBe('falhou');
  const recusando = vi.fn(async () => new Response('', { status: 500 }));
  expect(await notifyOps({ evento: 'cliente_sem_atendimento', resumo: 'x' },
    recusando as unknown as typeof fetch)).toBe('falhou');
  log.mockRestore();
});
