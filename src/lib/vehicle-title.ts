/**
 * Monta o título do veículo sem repetir palavra. O cadastro real traz campos redundantes
 * (ex.: marca "Yamaha", modelo "Lander 250" e versão "Yamaha xtz Lander 250"), o que gerava
 * "Yamaha Lander 250 Yamaha xtz Lander 250" na vitrine e na fala da Dayse.
 */
export function buildVehicleTitle(
  brand?: string | null,
  model?: string | null,
  version?: string | null,
): string {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const part of [brand, model, version]) {
    for (const word of (part ?? '').split(/\s+/).filter(Boolean)) {
      const key = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(word);
    }
  }
  return words.join(' ');
}
