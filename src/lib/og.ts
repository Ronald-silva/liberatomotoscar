import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Formato recomendado para pré-visualização em WhatsApp, Meta e X. */
export const OG_SIZE = { width: 1200, height: 630 };

export const OG_CONTENT_TYPE = 'image/png';

const FONT_DIR = path.join(process.cwd(), 'src', 'app', 'fonts');

/**
 * As mesmas fontes da interface, para o card repetir a tipografia do site.
 *
 * A interface carrega Archivo variável por `next/font`, mas o satori precisa de
 * arquivos estáticos em disco: estes dois são instâncias wght=400 e wght=900 da
 * variável, reduzidas ao conjunto latino.
 */
export async function loadOgFonts() {
  const [display, body] = await Promise.all([
    readFile(path.join(FONT_DIR, 'Archivo-Black.ttf')),
    readFile(path.join(FONT_DIR, 'Archivo-Regular.ttf')),
  ]);

  return [
    { name: 'Display', data: display, weight: 900 as const, style: 'normal' as const },
    { name: 'Body', data: body, weight: 400 as const, style: 'normal' as const },
  ];
}

/** Lê uma imagem de `public/` como data URI, já que o satori não busca caminhos locais. */
export async function loadPublicImage(publicPath: string): Promise<string> {
  const file = path.join(process.cwd(), 'public', decodeURI(publicPath).replace(/^\//, ''));
  const data = await readFile(file);
  const type = file.endsWith('.jpeg') || file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
  return `data:${type};base64,${data.toString('base64')}`;
}
