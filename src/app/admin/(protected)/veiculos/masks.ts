/**
 * Máscaras aplicadas enquanto a pessoa digita.
 *
 * Elas devolvem exatamente os formatos que as actions já aceitam — ponto de milhar, vírgula de
 * centavos opcional —, então o servidor continua sendo a autoridade e nada muda lá. O ganho é
 * que o valor mal formatado deixa de existir: não há como digitar letra num campo de número nem
 * perder o separador.
 */

const onlyDigits = (value: string) => value.replace(/\D/g, '');

// 1234567 -> "1.234.567"
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function maskInteger(typed: string, maxDigits: number): string {
  const digits = onlyDigits(typed).replace(/^0+(?=\d)/, '').slice(0, maxDigits);
  return digits === '' ? '' : groupThousands(digits);
}

// Quilometragem: só dígitos. 9.999.999 km cobre qualquer veículo que entre na loja.
export function maskMileage(typed: string): string {
  return maskInteger(typed, 7);
}

// Preço em reais. Anúncio de veículo não tem centavos, e cada dígito a menos é um erro a menos:
// digitar "18500" mostra "18.500", que o servidor lê como R$ 18.500,00. Mas a vírgula é
// preservada quando já existe (preço importado do catálogo antigo pode ter centavos), senão
// editar "18.500,50" viraria R$ 1.850.050 — erro de cem vezes.
// O teto é o do servidor: R$ 21.474.836,47.
export function maskPrice(typed: string): string {
  const [whole = '', ...rest] = typed.replace(/[^\d,]/g, '').split(',');
  const head = maskInteger(whole, 8);
  if (rest.length === 0) return head;
  return `${head === '' ? '0' : head},${onlyDigits(rest.join('')).slice(0, 2)}`;
}

// Valor inicial do campo de preço: sem centavos quando não há, para a pessoa ver "18.500".
export function priceToText(cents: number | null): string {
  if (cents === null) return '';
  const reais = Math.trunc(cents / 100);
  const remainder = cents % 100;
  const head = groupThousands(String(reais));
  return remainder === 0 ? head : `${head},${String(remainder).padStart(2, '0')}`;
}

// Lista de anos do mais novo para o mais velho. O ano seguinte entra porque ano-modelo adiantado
// é comum em veículo novo. Campo de lista em vez de digitado elimina o "2.024" virando 2024.
export function yearOptions(currentYear: number, span = 45): readonly number[] {
  return Array.from({ length: span + 2 }, (_, index) => currentYear + 1 - index);
}
