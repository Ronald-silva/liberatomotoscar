/**
 * Monta o título do veículo sem repetir palavra. O cadastro real traz campos redundantes
 * (ex.: marca "Yamaha", modelo "Lander 250" e versão "Yamaha xtz Lander 250"), o que gerava
 * "Yamaha Lander 250 Yamaha xtz Lander 250" na vitrine e na fala da Dayse.
 */

/**
 * Siglas de modelo chegam do cadastro em minúscula ("xtz", "cg", "xre") e saíam assim na
 * vitrine, ao lado de palavras capitalizadas.
 *
 * Duas regras, nessa ordem. Português não tem palavra sem vogal, então "nenhuma vogal e no
 * máximo quatro letras" identifica a sigla sem risco de acertar um nome comum ("250" e
 * "Lander" não se encaixam e passam intactos). As siglas que têm vogal precisam de lista,
 * porque nenhuma regra as separa de uma palavra de verdade — "pop" e "bros" ficam de fora
 * de propósito: já chegam capitalizadas e são legíveis como nome.
 */
const SIGLAS_COM_VOGAL = new Set([
  'xre', 'cbr', 'crf', 'nxr', 'ybr', 'xj6', 'fz25', 'mt03', 'nc750', 'xadv',
]);

function normalizarPalavra(palavra: string): string {
  if (SIGLAS_COM_VOGAL.has(palavra.toLocaleLowerCase('pt-BR'))) {
    return palavra.toLocaleUpperCase('pt-BR');
  }
  const soLetras = /^\p{L}+$/u.test(palavra);
  if (soLetras && palavra.length <= 4 && !/[aeiouáàâãéêíóôõúü]/i.test(palavra)) {
    return palavra.toLocaleUpperCase('pt-BR');
  }
  // Resto do cadastro em caixa baixa ("pop", "robust"): vira nome próprio. Palavra que já
  // chega capitalizada ou com sigla no meio ("Lander", "CG") não se encaixa e passa intacta.
  if (palavra === palavra.toLocaleLowerCase('pt-BR')) {
    return palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1);
  }
  return palavra;
}

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
      words.push(normalizarPalavra(word));
    }
  }
  return words.join(' ');
}
