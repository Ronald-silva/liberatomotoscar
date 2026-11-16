import type { Metadata } from 'next';
import { AccessDeniedError } from '@/server/authz';
import {
  loadMetricsReport, metricsChannelSchema, metricsDaysSchema,
  type MetricsReport,
} from '@/server/attendance/metrics-report';
import { MetricsView } from './MetricsView';

export const metadata: Metadata = { title: 'Métricas do atendimento', robots: { index: false, follow: false } };

const primeiro = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);

export default async function MetricsPage({
  searchParams,
}: {
  searchParams?: Promise<{ dias?: string | string[]; canal?: string | string[] }>;
}) {
  const resolved = (await searchParams) ?? {};
  // `.catch()` nos esquemas: janela ou canal inválidos na URL caem no padrão em vez de 500.
  const dias = metricsDaysSchema.parse(primeiro(resolved.dias)) as 7 | 30;
  const channel = metricsChannelSchema.parse(primeiro(resolved.canal));

  let report: MetricsReport | null = null;
  try {
    report = await loadMetricsReport({ channel, dias });
  } catch (error) {
    // Negação de acesso sobe: não se mostra meia tela de métricas a quem não é admin. Qualquer
    // outra falha vira aviso, porque uma leitura quebrada não deve derrubar o painel inteiro.
    if (error instanceof AccessDeniedError) throw error;
    console.error('Falha ao ler as métricas do atendimento', error);
  }

  return <MetricsView report={report} />;
}
