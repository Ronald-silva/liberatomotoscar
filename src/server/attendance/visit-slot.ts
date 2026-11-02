import { STORE_POLICY } from '@/data/store-policy';

/**
 * Fuso da loja. Nome IANA em vez de `-03:00` fixo: o deslocamento é consequência da regra do
 * fuso, não do código. Fortaleza hoje não tem horário de verão, mas a conta não depende disso.
 */
export const STORE_TIME_ZONE = 'America/Fortaleza';

export type VisitSlotReason = 'ok' | 'sem-data' | 'sem-hora' | 'fechado' | 'passado' | 'invalido';
export type VisitSlot = { scheduledFor: Date | null; reason: VisitSlotReason };

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: STORE_TIME_ZONE, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
});

/** Ano, mês (1-12), dia e hora de um instante, lidos no relógio da loja. */
export function storeClock(instant: Date) {
  const p: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** Número do dia do calendário da loja (dias desde 1970), para subtrair datas sem mexer em horas. */
export function storeDayNumber(instant: Date): number {
  const c = storeClock(instant);
  return Date.UTC(c.year, c.month - 1, c.day) / 86_400_000;
}

/** Dia da semana no calendário da loja, domingo = 0. */
export function storeWeekday(instant: Date): number {
  return new Date(storeDayNumber(instant) * 86_400_000).getUTCDay();
}

/** Quanto o relógio da loja está à frente do UTC naquele instante, em ms. */
function offsetMs(instant: Date): number {
  const c = storeClock(instant);
  // Descarta os ms do instante: o formatador só enxerga segundos.
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instante em que o relógio da loja marca essa data e hora. */
function storeInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Dois passos cobrem a hora em que o deslocamento muda entre o palpite e o instante real.
  const first = naive - offsetMs(new Date(naive));
  return new Date(naive - offsetMs(new Date(first)));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Transforma o que a Dayse entendeu ("sábado", "14h") em um instante, ou recusa. Ela erra data e
 * hora com frequência; o que não cabe no horário da loja NÃO vira um palpite: devolve `null` e o
 * motivo, e quem chama guarda a frase do cliente num agendamento sem hora.
 * `data` é `AAAA-MM-DD` e `hora` é `HH:MM`, ambas no relógio da loja.
 */
export function resolveVisitSlot(input: { data?: string; hora?: string; now: Date }): VisitSlot {
  const refuse = (reason: VisitSlotReason): VisitSlot => ({ scheduledFor: null, reason });
  const data = input.data?.trim();
  const hora = input.hora?.trim();
  if (!data) return refuse('sem-data');

  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!d) return refuse('invalido');
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  // 31 de fevereiro viraria 3 de março: confere que a data sobreviveu à ida e volta.
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    return refuse('invalido');
  }

  if (!hora) return refuse('sem-hora');
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!h || Number(h[1]) > 23 || Number(h[2]) > 59) return refuse('invalido');
  const minutes = Number(h[1]) * 60 + Number(h[2]);

  const { abre, fecha, dias } = STORE_POLICY.horarioEstruturado;
  const opensThatDay = (dias as readonly string[]).includes(WEEKDAYS[calendar.getUTCDay()]);
  // Fechar às 18h é o fim do expediente, não um horário de visita: o intervalo é [abre, fecha).
  if (!opensThatDay || minutes < toMinutes(abre) || minutes >= toMinutes(fecha)) return refuse('fechado');

  const scheduledFor = storeInstant(year, month, day, Number(h[1]), Number(h[2]));
  if (scheduledFor.getTime() <= input.now.getTime()) return refuse('passado');
  return { scheduledFor, reason: 'ok' };
}
