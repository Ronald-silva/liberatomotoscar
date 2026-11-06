import { buildVehicleTitle } from '@/lib/vehicle-title';

/**
 * O título da peça, montado sem repetir o que o cadastro já disse.
 *
 * O dado real é sujo: o "Yamaha Lander 250" tem `version` = "Yamaha xtz Lander 250" (§13 do spec), e
 * `marca + modelo + versão` concatenados saíam como "Yamaha Lander 250 Yamaha xtz Lander 250" no
 * cabeçalho da tela e na legenda publicada.
 *
 * A deduplicação por palavra **não mora aqui**: é a mesma regra que a vitrine pública e o agente já
 * usam, em `src/lib/vehicle-title.ts`. Duas cópias divergiriam na primeira correção, e o mesmo
 * veículo passaria a ter dois nomes — um no site, outro na arte. O que é do estúdio e a vitrine não
 * tem são as duas coisas abaixo: o título de reserva e a recusa de um título degenerado.
 */

/** O que entra no lugar do título quando o cadastro não dá nenhum. */
export const FALLBACK_TITLE = 'Veículo sem título';

export type VehicleTitleParts = {
  brand: string | null;
  model: string | null;
  version: string | null;
};

/**
 * Um título vale se tiver pelo menos dois caracteres e pelo menos uma letra ou dígito.
 *
 * O estoque tem um rascunho cujo título é de **um caractere** (§13 do spec), e a composição reserva
 * o maior corpo da peça para o título: uma linha de um caractere ali é a arte saindo errada em
 * silêncio. 'X1' passa, porque é nome de modelo plausível; 'x' e '---' não.
 */
export function composeVehicleTitle(parts: VehicleTitleParts): string {
  const title = buildVehicleTitle(parts.brand, parts.model, parts.version).trim();
  const legible = title.length >= 2 && /[\p{L}\p{N}]/u.test(title);
  return legible ? title : FALLBACK_TITLE;
}
