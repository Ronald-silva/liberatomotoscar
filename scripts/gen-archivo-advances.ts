/**
 * Extrai dos TTFs em disco a tabela de avanço de glifos da Archivo, para que os testes de
 * composição da arte midam com a métrica real da fonte que embarca em vez de uma aproximação.
 *
 * Roda à mão, só quando a fonte mudar:
 *   npx tsx scripts/gen-archivo-advances.ts > src/components/art-studio/__fixtures__/archivo-advances.json
 *
 * Imprime só JSON em stdout — qualquer aviso vai para stderr, para o redirecionamento acima
 * continuar válido.
 */
import { openSync } from 'fontkit';
import { fileURLToPath } from 'node:url';

const FONTS = {
  '400': 'src/app/fonts/Archivo-Regular.ttf',
  '900': 'src/app/fonts/Archivo-Black.ttf',
} as const;

/**
 * Os caracteres que o conteúdo real da arte usa: marca, modelo, ano, km, cor, preço, telefone,
 * hashtags e observação. Fora desta lista o consumidor aproxima pelo avanço do `x`.
 */
function characterSet(): string[] {
  const ranges = [
    ['A', 'Z'],
    ['a', 'z'],
    ['0', '9'],
  ] as const;
  const chars = new Set<string>();
  for (const [from, to] of ranges) {
    for (let code = from.codePointAt(0)!; code <= to.codePointAt(0)!; code += 1) {
      chars.add(String.fromCodePoint(code));
    }
  }
  // A observação da peça é texto livre digitado pelo operador, e é por ali que a pontuação
  // inesperada entra ("Aceito troca!", "Tem interesse?", "Único dono; IPVA pago"). Caractere fora
  // desta lista cai na reserva do consumidor, que mede para cima — seguro, mas mais apertado do
  // que o necessário.
  for (const char of ' ·.,/()%$-+:!?;&@*#°"\'…–—') chars.add(char);
  const accented = 'áàâãéêíóôõúüç';
  for (const char of accented) {
    chars.add(char);
    chars.add(char.toUpperCase());
  }
  return [...chars];
}

function advances(path: string): Record<string, number> {
  const font = openSync(path);
  if ('fonts' in font) throw new Error(`${path} é uma coleção de fontes, não uma fonte`);
  const table: Record<string, number> = {};
  for (const char of characterSet()) {
    const codePoint = char.codePointAt(0)!;
    if (!font.hasGlyphForCodePoint(codePoint)) {
      process.stderr.write(`aviso: ${path} não tem glifo para ${JSON.stringify(char)}\n`);
      continue;
    }
    table[char] = font.glyphForCodePoint(codePoint).advanceWidth;
  }
  return table;
}

function unitsPerEmOf(path: string): number {
  const font = openSync(path);
  if ('fonts' in font) throw new Error(`${path} é uma coleção de fontes, não uma fonte`);
  return font.unitsPerEm;
}

function main(): void {
  const regularUnits = unitsPerEmOf(FONTS['400']);
  const blackUnits = unitsPerEmOf(FONTS['900']);
  if (regularUnits !== blackUnits) {
    throw new Error(`unitsPerEm divergente entre as instâncias: ${regularUnits} vs ${blackUnits}`);
  }
  const fixture = {
    unitsPerEm: regularUnits,
    weights: { '400': advances(FONTS['400']), '900': advances(FONTS['900']) },
  };
  process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
