// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { MetricsReport } from '@/server/attendance/metrics-report';
import { MetricsView } from './MetricsView';

afterEach(cleanup);

const vazio: MetricsReport = {
  channel: 'whatsapp',
  dias: 30,
  desde: new Date('2026-10-16T00:00:00.000Z'),
  metrics: {
    conversas: 0, resolvidasNoCanalPct: null, visitaIntencaoPct: null, visitaMarcadaPct: null,
    mensagensPorConversa: null, segundosAtePrimeiraResposta: null, guardaReprovadaPct: null,
    tokensPorConversa: null,
  },
  incidentes: {
    encaminhamentos: 0, encaminhamentosPorMotivo: [], falhasOperacionais: 0,
    falhasPorEvento: [], semRegistro: 0,
  },
  semAtendimento: [],
};

const cheio: MetricsReport = {
  channel: 'whatsapp',
  dias: 7,
  desde: new Date('2026-11-08T00:00:00.000Z'),
  metrics: {
    conversas: 120, resolvidasNoCanalPct: 72.5, visitaIntencaoPct: 18, visitaMarcadaPct: 6,
    mensagensPorConversa: 5.4, segundosAtePrimeiraResposta: 240, guardaReprovadaPct: 1.5,
    tokensPorConversa: 1300,
  },
  incidentes: {
    encaminhamentos: 9,
    encaminhamentosPorMotivo: [
      { motivo: 'teto_conversa', rotulo: 'teto de mensagens da conversa', total: 6 },
      { motivo: 'infraestrutura', rotulo: 'falha de infraestrutura', total: 3 },
    ],
    falhasOperacionais: 2,
    falhasPorEvento: [
      { evento: 'cliente_sem_atendimento', motivo: 'envio_falhou', rotulo: 'a Meta recusou o envio', total: 1 },
      { evento: 'encaminhamento_nao_registrado', motivo: 'infraestrutura', rotulo: 'falha de infraestrutura', total: 1 },
    ],
    semRegistro: 1,
  },
  semAtendimento: [
    {
      conversationId: '11111111-1111-4111-8111-111111111111',
      evento: 'encaminhamento_nao_registrado', motivo: 'infraestrutura',
      occurredAt: new Date('2026-11-13T18:30:00.000Z'),
    },
  ],
};

describe('os números aparecem na tela', () => {
  it('mostra conversas, resolução, mensagens e tempo até a primeira resposta', () => {
    render(<MetricsView report={cheio} />);
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText('72,5%')).toBeTruthy();
    expect(screen.getByText('5,4')).toBeTruthy();
    // 240 s lidos como "4 min": o lojista não converte segundos de cabeça.
    expect(screen.getByText('4 min')).toBeTruthy();
    expect(screen.getByText('1.300')).toBeTruthy();
    expect(screen.getByText('1,5%')).toBeTruthy();
  });

  /** Missão 2 na tela: dois rótulos distintos, e o nome antigo não volta. */
  it('separa intenção de visita de visita marcada, com números diferentes', () => {
    const { container } = render(<MetricsView report={cheio} />);
    expect(screen.getByText('Intenção de visita anotada')).toBeTruthy();
    expect(screen.getByText('Visita marcada na agenda')).toBeTruthy();
    expect(screen.getByText('18%')).toBeTruthy();
    expect(screen.getByText('6%')).toBeTruthy();
    expect(container.textContent).not.toMatch(/visita agendada/i);
  });

  /**
   * "sem dados" e "0%" dizem coisas opostas ao lojista. Janela sem conversa nenhuma não pode
   * imprimir zero por cento de resolução — isso seria um relatório ruim de um agente que
   * simplesmente não foi usado.
   */
  it('janela sem base diz "sem dados" em vez de zero por cento', () => {
    const { container } = render(<MetricsView report={vazio} />);
    expect(screen.getAllByText('sem dados').length).toBeGreaterThanOrEqual(6);
    expect(container.textContent).not.toMatch(/0%/);
  });

  it('a janela e o canal escolhidos ficam marcados como página atual', () => {
    render(<MetricsView report={cheio} />);
    expect(screen.getByRole('link', { name: 'Últimos 7 dias' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Últimos 30 dias' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('/admin/metricas?dias=7&canal=whatsapp');
    expect(screen.getByRole('link', { name: 'Site' }).getAttribute('href')).toBe('/admin/metricas?dias=7&canal=site');
  });
});

describe('o incidente é visível sem abrir log', () => {
  it('mostra as falhas operacionais por motivo e alerta sobre registro nenhum', () => {
    render(<MetricsView report={cheio} />);
    expect(screen.getByText(/Falhas operacionais na janela/)).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toMatch(/1 encaminhamento\(s\) com registro\s+nenhum/);
    expect(alerta.textContent).toMatch(/não entrou na\s+fila de ninguém/);
    const falhas = screen.getByRole('list', { name: 'Falhas operacionais por motivo' });
    expect(falhas.textContent).toMatch(/Cliente sem resposta e sem vendedor · a Meta recusou o envio/);
    expect(falhas.textContent).toMatch(/Encaminhamento sem registro · falha de infraestrutura/);
  });

  it('dá o caminho para abrir a conversa que ninguém garantiu que chegou ao vendedor', () => {
    render(<MetricsView report={cheio} />);
    const lista = screen.getByRole('list', { name: 'Conversas sem atendimento confirmado' });
    expect(lista.textContent).toMatch(/infraestrutura/);
    expect(screen.getByRole('link', { name: 'Abrir conversa' }).getAttribute('href'))
      .toBe('/admin/atendimento?conversa=11111111-1111-4111-8111-111111111111');
  });

  it('conta os encaminhamentos por motivo', () => {
    render(<MetricsView report={cheio} />);
    const lista = screen.getByRole('list', { name: 'Encaminhamentos por motivo' });
    expect(lista.textContent).toMatch(/teto de mensagens da conversa6/);
    expect(lista.textContent).toMatch(/falha de infraestrutura3/);
  });

  it('zero falha é dito com todas as letras, sem alarme', () => {
    const { container } = render(<MetricsView report={vazio} />);
    expect(screen.getByText('Nenhuma falha operacional registrada nesta janela.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Conversas sem atendimento confirmado' })).toBeNull();
    // O painel não pode se pintar de incidente quando não há nenhum.
    expect(container.querySelector('[class*="Alarm"]')).toBeNull();
  });

  /** O painel conta o que o banco gravou; quando o banco cai, nem o incidente é gravado. */
  it('diz na tela que o número depende do banco ter aceitado a gravação', () => {
    const { container } = render(<MetricsView report={cheio} />);
    expect(container.textContent).toMatch(/conta o que o banco conseguiu gravar/);
    expect(container.textContent).toMatch(/OPS_ALERT_WEBHOOK_URL/);
  });

  it('no canal site avisa que o painel fica em zero por falta de instrumentação', () => {
    const { container } = render(<MetricsView report={{ ...vazio, channel: 'site' }} />);
    expect(container.textContent).toMatch(/só o canal WhatsApp grava incidentes/);
  });
});

describe('leitura que falhou', () => {
  /** Sem relatório, nenhum número é verdadeiro: a tela não pode mostrar zeros no lugar. */
  it('não inventa zero quando a consulta falha', () => {
    const { container } = render(<MetricsView report={null} erro="timeout" />);
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toMatch(/Não foi possível ler as métricas agora \(timeout\)/);
    expect(container.textContent).not.toMatch(/Falhas operacionais/);
    expect(container.textContent).not.toMatch(/sem dados/);
    // A troca de janela continua funcionando: é o primeiro reflexo de quem vê a tela quebrada.
    expect(screen.getByRole('link', { name: 'Últimos 30 dias' })).toBeTruthy();
  });
});
