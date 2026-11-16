import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AccessDeniedError extends Error {}
  return { AccessDeniedError, loadMetricsReport: vi.fn() };
});
vi.mock('@/server/authz', () => ({ AccessDeniedError: mocks.AccessDeniedError, requireAdmin: vi.fn() }));
vi.mock('@/server/attendance/metrics-report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/attendance/metrics-report')>()),
  loadMetricsReport: mocks.loadMetricsReport,
}));

import MetricsPage from './page';

const report = {
  channel: 'whatsapp' as const, dias: 30 as const, desde: new Date('2026-10-16T00:00:00.000Z'),
  metrics: {
    conversas: 1, resolvidasNoCanalPct: 100, visitaIntencaoPct: 0, visitaMarcadaPct: 0,
    mensagensPorConversa: 2, segundosAtePrimeiraResposta: 10, guardaReprovadaPct: null,
    tokensPorConversa: 500,
  },
  incidentes: {
    encaminhamentos: 0, encaminhamentosPorMotivo: [], falhasOperacionais: 0,
    falhasPorEvento: [], semRegistro: 0,
  },
  semAtendimento: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.loadMetricsReport.mockResolvedValue(report);
});

it('acesso negado sobe em vez de virar aviso com métricas pela metade', async () => {
  mocks.loadMetricsReport.mockRejectedValue(new mocks.AccessDeniedError());
  await expect(MetricsPage({ searchParams: Promise.resolve({}) }))
    .rejects.toBeInstanceOf(mocks.AccessDeniedError);
});

it('falha comum de leitura vira aviso, sem derrubar a tela', async () => {
  mocks.loadMetricsReport.mockRejectedValue(new Error('timeout no Neon'));
  await expect(MetricsPage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
});

it('janela e canal da URL chegam ao serviço', async () => {
  await MetricsPage({ searchParams: Promise.resolve({ dias: '7', canal: 'site' }) });
  expect(mocks.loadMetricsReport).toHaveBeenCalledWith({ channel: 'site', dias: 7 });
});

/** URL adulterada não pode virar 500 nem janela arbitrária (ex.: 3650 dias varrendo o banco). */
it('janela e canal inválidos caem no padrão em vez de estourar', async () => {
  await MetricsPage({ searchParams: Promise.resolve({ dias: '3650', canal: 'telegram' }) });
  expect(mocks.loadMetricsReport).toHaveBeenCalledWith({ channel: 'whatsapp', dias: 30 });
});

it('sem parâmetro nenhum usa 30 dias no WhatsApp', async () => {
  await MetricsPage({});
  expect(mocks.loadMetricsReport).toHaveBeenCalledWith({ channel: 'whatsapp', dias: 30 });
});
