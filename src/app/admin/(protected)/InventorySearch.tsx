import styles from '../admin.module.css';
import { statusSlugs } from './inventoryQuery';
import type { VehicleStatus } from './veiculos/status';

/**
 * A busca do estoque: um formulário `GET`, sem JavaScript.
 *
 * Enviar pela URL é o que faz o resultado ser compartilhável, recarregável e voltável pelo botão
 * do navegador — e é o que permite a consulta rodar no servidor, com `requireAdmin()`, em vez de
 * a tela receber o estoque inteiro para filtrar no aparelho.
 *
 * A ficha de estado vai junto num campo escondido para a busca não jogar a pessoa de volta ao
 * estoque inteiro. A página **não** vai: a lista é outra depois de buscar.
 */
export function InventorySearch({ search, status, total }: {
  search: string; status?: VehicleStatus; total: number | null;
}) {
  return <form className={styles.searchForm} role="search" action="/admin" method="get">
    {status ? <input type="hidden" name="estado" value={statusSlugs[status]} /> : null}
    <label className={styles.visuallyHidden} htmlFor="busca-estoque">Buscar no estoque por marca, modelo, versão ou ano</label>
    <input className={`${styles.input} ${styles.searchInput}`} id="busca-estoque" type="search" name="busca"
      defaultValue={search} enterKeyHint="search" autoComplete="off"
      placeholder="Buscar por marca, modelo ou ano" />
    <button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} type="submit">Buscar</button>
    {search ? <p className={styles.searchSummary} role="status">
      {total === null ? <>Resultados para <strong>{search}</strong>.</>
        : total === 0 ? <>Nenhum veículo para <strong>{search}</strong>.</>
          : <>{total} {total === 1 ? 'veículo' : 'veículos'} para <strong>{search}</strong>.</>}
      {' '}<a className={styles.searchClear} href="/admin">Limpar busca</a>
    </p> : null}
  </form>;
}
