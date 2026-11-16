import Link from 'next/link';
import type { MetricsReport } from '@/server/attendance/metrics-report';
import attendanceStyles from '../atendimento/attendance.module.css';
import styles from './metricas.module.css';

/**
 * A tela das métricas de atendimento. Componente puro, sem banco: a página carrega o relatório e
 * passa aqui, para que o teste de componente possa provar o que aparece em cada caso — inclusive
 * "sem dados", que é o caso mais fácil de mostrar errado.
 */

const horaFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
});
const dataFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Fortaleza' });

/**
 * `null` é ausência de base, não zero. "0% resolvidas no canal" e "ainda não houve conversa" dizem
 * coisas opostas ao lojista, e foi para não confundir as duas que `deriveAgentMetrics` devolve
 * `null`: a tela precisa honrar isso em vez de imprimir 0.
 */
function Card({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return <li className={styles.card}>
    <p className={styles.cardLabel}>{label}</p>
    {value === null
      ? <p className={`${styles.cardValue} ${styles.cardEmpty}`}>sem dados</p>
      : <p className={styles.cardValue}>{value}</p>}
    {hint ? <p className={styles.cardHint}>{hint}</p> : null}
  </li>;
}

const pct = (valor: number | null) => (valor === null ? null : `${valor.toLocaleString('pt-BR')}%`);
const num = (valor: number | null) => (valor === null ? null : valor.toLocaleString('pt-BR'));

/** Segundos viram minutos a partir de 90 s: "312 s" não é número que alguém leia de relance. */
function duracao(segundos: number | null): string | null {
  if (segundos === null) return null;
  if (segundos < 90) return `${Math.round(segundos).toLocaleString('pt-BR')} s`;
  const minutos = Math.round(segundos / 60);
  return `${minutos.toLocaleString('pt-BR')} min`;
}

export function MetricsView({ report, erro }: { report: MetricsReport | null; erro?: string | null }) {
  const canais = [
    { id: 'whatsapp' as const, label: 'WhatsApp' },
    { id: 'site' as const, label: 'Site' },
  ];
  const janelas = [7, 30] as const;
  const canal = report?.channel ?? 'whatsapp';
  const dias = report?.dias ?? 30;

  return <main id="conteudo" className={attendanceStyles.screen}>
    <div className={attendanceStyles.panel}>
      <header className={attendanceStyles.topBar}>
        <div className={attendanceStyles.topBarTitle}>
          <h1>Métricas do atendimento</h1>
          <p className={attendanceStyles.intro}>
            Como a Dayse se comportou na janela escolhida. Cada número sai do banco no momento em
            que esta página carrega; nenhum vem de estimativa.
          </p>
        </div>
        <Link href="/admin/atendimento" className={attendanceStyles.secondaryButton}>
          ← Voltar para Conversas
        </Link>
      </header>

      <nav aria-label="Janela e canal das métricas" className={styles.windowNav}>
        {janelas.map((opcao) => (
          <Link key={opcao} href={`/admin/metricas?dias=${opcao}&canal=${canal}`}
            className={`${attendanceStyles.filterTab} ${dias === opcao ? attendanceStyles.filterTabActive : ''}`}
            aria-current={dias === opcao ? 'page' : undefined}>
            Últimos {opcao} dias
          </Link>
        ))}
        {canais.map((opcao) => (
          <Link key={opcao.id} href={`/admin/metricas?dias=${dias}&canal=${opcao.id}`}
            className={`${attendanceStyles.filterTab} ${canal === opcao.id ? attendanceStyles.filterTabActive : ''}`}
            aria-current={canal === opcao.id ? 'page' : undefined}>
            {opcao.label}
          </Link>
        ))}
      </nav>

      {report === null
        ? <p className={attendanceStyles.error} role="alert">
            Não foi possível ler as métricas agora{erro ? ` (${erro})` : ''}. Recarregue a página.
            Enquanto esta leitura falha, o número que aparece na tela não existe — nenhum valor
            abaixo seria verdadeiro.
          </p>
        : <Report report={report} />}
    </div>
  </main>;
}

function Report({ report }: { report: MetricsReport }) {
  const { metrics, incidentes, semAtendimento } = report;
  const comIncidente = incidentes.falhasOperacionais > 0;

  return <>
    <p className={styles.note}>
      Janela de {report.dias} dias, a partir de {dataFormatter.format(report.desde)} · canal{' '}
      {report.channel === 'whatsapp' ? 'WhatsApp' : 'Site'}.
    </p>

    <section className={styles.section} aria-labelledby="titulo-volume">
      <h2 id="titulo-volume">Atendimento</h2>
      <ul className={styles.grid}>
        <Card label="Conversas" value={num(metrics.conversas)}
          hint="Conversas abertas na janela, no canal escolhido." />
        <Card label="Resolvidas no canal" value={pct(metrics.resolvidasNoCanalPct)}
          hint="Conversas que nunca precisaram de vendedor." />
        <Card label="Mensagens por conversa" value={num(metrics.mensagensPorConversa)}
          hint="Cliente e Dayse somados." />
        <Card label="Tempo até a primeira resposta" value={duracao(metrics.segundosAtePrimeiraResposta)}
          hint="Média entre a primeira mensagem do cliente e a primeira resposta." />
      </ul>
    </section>

    {/*
      Missão 2 na tela: dois cartões, dois nomes, dois dados. O nome antigo ("visita agendada")
      somava as duas coisas num número só e mostrava o maior deles — o que agrada quem lê e não
      corresponde à agenda que o vendedor abre.
    */}
    <section className={styles.section} aria-labelledby="titulo-visitas">
      <h2 id="titulo-visitas">Visitas</h2>
      <ul className={styles.grid}>
        <Card label="Intenção de visita anotada" value={pct(metrics.visitaIntencaoPct)}
          hint="O cliente falou de visitar a loja e a Dayse anotou a frase. Não é visita marcada." />
        <Card label="Visita marcada na agenda" value={pct(metrics.visitaMarcadaPct)}
          hint="Existe linha em Agenda para a conversa. É esta que vira cliente na loja." />
      </ul>
      <p className={styles.note}>
        A diferença entre os dois é intenção que não virou visita: cliente que falou em passar na
        loja e saiu sem hora marcada.
      </p>
    </section>

    <section className={styles.section} aria-labelledby="titulo-custo">
      <h2 id="titulo-custo">Custo e contenção</h2>
      <ul className={styles.grid}>
        <Card label="Tokens por conversa" value={num(metrics.tokensPorConversa)}
          hint="Entrada e saída somadas, dividido pelas conversas da janela." />
        <Card label="Guarda reprovada" value={pct(metrics.guardaReprovadaPct)}
          hint="Respostas que uma guarda de saída barrou e não foram ao cliente." />
      </ul>
      <p className={styles.note}>
        Tokens e guarda vêm do contador diário por canal (`attendance_usage`), que começa no dia
        UTC da janela — por isso podem cobrir algumas horas a mais que as conversas.
      </p>
    </section>

    {/*
      Missão 3 na tela. Até aqui `falhasOperacionais` existia só em `console.error` de função
      serverless: ninguém lê, e a Vercel descarta. Este painel é o que faz o lojista perceber, sem
      abrir log nenhum, que um cliente ficou esperando.
    */}
    <section className={styles.section} aria-labelledby="titulo-incidentes">
      <h2 id="titulo-incidentes">Encaminhamentos e incidentes</h2>
      <div className={`${styles.incidentPanel} ${comIncidente ? styles.incidentPanelAlarm : ''}`}>
        <p className={styles.cardLabel}>Falhas operacionais na janela</p>
        <p className={`${styles.cardValue} ${comIncidente ? styles.alarmCount : ''}`}
          aria-describedby="explicacao-falhas">
          {incidentes.falhasOperacionais.toLocaleString('pt-BR')}
        </p>
        <p id="explicacao-falhas" className={styles.cardHint}>
          Atendimentos em que o cliente ficou esperando e <strong>não há confirmação de que algum
          vendedor foi avisado</strong>. O número aceitável é zero.
        </p>
        {incidentes.semRegistro > 0
          ? <p className={attendanceStyles.error} role="alert">
              {incidentes.semRegistro.toLocaleString('pt-BR')} encaminhamento(s) com registro
              nenhum: o cliente recebeu a frase “já chamei um vendedor”, e a conversa não entrou na
              fila de ninguém.
            </p>
          : null}

        {incidentes.falhasPorEvento.length > 0
          ? <ul className={styles.incidentList} aria-label="Falhas operacionais por motivo">
              {incidentes.falhasPorEvento.map(({ evento, motivo, rotulo, total }) => (
                <li key={`${evento}:${motivo ?? ''}`}>
                  <span>
                    {evento === 'encaminhamento_nao_registrado'
                      ? 'Encaminhamento sem registro'
                      : 'Cliente sem resposta e sem vendedor'}
                    {rotulo ? ` · ${rotulo}` : ''}
                  </span>
                  <span className={`${styles.incidentCount} ${styles.alarmCount}`}>{total.toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          : <p className={attendanceStyles.success}>Nenhuma falha operacional registrada nesta janela.</p>}
      </div>

      <div className={styles.incidentPanel}>
        <p className={styles.cardLabel}>
          Encaminhamentos ao vendedor: {incidentes.encaminhamentos.toLocaleString('pt-BR')}
        </p>
        {incidentes.encaminhamentosPorMotivo.length > 0
          ? <ul className={styles.incidentList} aria-label="Encaminhamentos por motivo">
              {incidentes.encaminhamentosPorMotivo.map(({ motivo, rotulo, total }) => (
                <li key={motivo}>
                  <span>{rotulo}</span>
                  <span className={styles.incidentCount}>{total.toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          : <p className={styles.cardHint}>
              Nenhum encaminhamento automático nesta janela. Conversas que o cliente pediu ao
              vendedor aparecem em Conversas, não aqui.
            </p>}
      </div>

      {semAtendimento.length > 0
        ? <div className={styles.incidentPanel}>
            <p className={styles.cardLabel}>Conversas a conferir à mão</p>
            <ul className={styles.incidentList} aria-label="Conversas sem atendimento confirmado">
              {semAtendimento.map((item, indice) => (
                <li key={`${item.conversationId ?? 'sem-conversa'}-${indice}`}>
                  <span className={styles.conversationRow}>
                    {item.conversationId
                      ? <Link href={`/admin/atendimento?conversa=${item.conversationId}`}>
                          Abrir conversa
                        </Link>
                      : <span>Conversa já expurgada pela retenção</span>}
                    {item.conversationId ? <code>{item.conversationId.slice(0, 8)}</code> : null}
                    <time dateTime={item.occurredAt.toISOString()}>{horaFormatter.format(item.occurredAt)}</time>
                  </span>
                  <span>{item.motivo ?? item.evento}</span>
                </li>
              ))}
            </ul>
          </div>
        : null}

      <p className={styles.note}>
        Este painel conta o que o banco conseguiu gravar. Quando o Postgres está fora do ar, o
        próprio registro do incidente falha — por isso o aviso a uma pessoa
        (`OPS_ALERT_WEBHOOK_URL`) continua existindo: ele é o caminho que não depende do banco.
        {report.channel === 'site'
          ? ' Hoje só o canal WhatsApp grava incidentes; no site este painel fica em zero por falta de instrumentação, não por ausência de falhas.'
          : ''}
      </p>
    </section>
  </>;
}
