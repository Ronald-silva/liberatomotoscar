import { sql, type SQL } from 'drizzle-orm';
import { vehicles } from '@/server/db/schema';

/**
 * Busca por texto no estoque do painel.
 *
 * Duas decisões moram aqui, e as duas existem para o mesmo fim: quem digita no celular não devia
 * precisar acertar a grafia do cadastro.
 *
 * **Acento se ignora sem extensão.** `unaccent` resolveria em uma linha, mas é `CREATE EXTENSION`
 * — DDL numa cadeia de migrações que ainda não rodou em produção. `translate()` faz o mesmo
 * trabalho com a tabela de caracteres abaixo, é determinístico e não pede migração nenhuma.
 * Quem digita "citroen" acha "Citroën"; quem digita "tenere" acha "Ténéré".
 *
 * **Cada palavra é um filtro.** "honda 2015" não procura a sequência "honda 2015" em lugar nenhum:
 * procura linhas que tenham "honda" **e** "2015", em qualquer ordem e em qualquer um dos campos.
 * É o que a pessoa quer dizer ao digitar duas palavras, e é o que faz "fan honda" achar o mesmo
 * que "honda fan".
 */

// Pares na mesma ordem: `translate` troca o enésimo caractere de um pelo enésimo do outro.
// Só minúsculas, porque a dobra acontece depois de `lower()`.
const ACENTUADOS = 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ';
const SEM_ACENTO = 'aaaaaaeeeeiiiiooooouuuucnyy';

/** O que a busca varre. Placa não entra porque não existe no modelo (nem no cadastro). */
const CAMPOS = [vehicles.brand, vehicles.model, vehicles.version] as const;

/**
 * Tetos de sanidade. Não são segurança — a consulta é parametrizada e passa por `requireAdmin()` —
 * são para um colar acidental de mil palavras não virar mil `LIKE` encadeados.
 */
const MAX_TERMOS = 6;
const MAX_CARACTERES = 40;

/** Acento fora, caixa baixa, espaços colapsados. A mesma dobra que o SQL aplica na coluna. */
export function dobrar(valor: string): string {
  return valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * O texto digitado virando a lista de termos que a consulta exige. Vazio significa "sem busca" —
 * nunca "nada encontrado".
 */
export function searchTerms(bruto: string | null | undefined): string[] {
  if (typeof bruto !== 'string') return [];
  return dobrar(bruto).split(/\s+/).filter(Boolean).map((termo) => termo.slice(0, MAX_CARACTERES)).slice(0, MAX_TERMOS);
}

/**
 * `%`, `_` e `\` são curingas do `LIKE`. Sem escapar, digitar "%" listaria o estoque inteiro e
 * pareceria busca quebrada.
 */
export function escaparLike(termo: string): string {
  return termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

/**
 * A condição `WHERE` da busca, ou `undefined` quando não há o que buscar.
 *
 * O ano entra como texto no mesmo caldeirão dos campos de texto: "2015" acha o ano 2015 e também
 * um modelo que tenha 2015 no nome, que é o resultado que não surpreende ninguém.
 */
export function vehicleSearchCondition(bruto: string | null | undefined): SQL | undefined {
  const termos = searchTerms(bruto);
  if (termos.length === 0) return undefined;
  const partes = CAMPOS.map((campo) => sql`coalesce(${campo}, '')`);
  const texto = sql.join([...partes, sql`coalesce(${vehicles.year}::text, '')`], sql` || ' ' || `);
  const dobrado = sql`translate(lower(${texto}), ${ACENTUADOS}, ${SEM_ACENTO})`;
  return sql.join(termos.map((termo) => sql`${dobrado} like ${`%${escaparLike(termo)}%`} escape '\\'`), sql` and `);
}
