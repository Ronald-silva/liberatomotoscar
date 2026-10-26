# Fase 1.2 — modelo PostgreSQL

O código do site público continua usando `src/data/inventory-vehicles.ts`. Este modelo prepara a administração, mas nenhuma migração foi aplicada no Neon nesta etapa. O catálogo legado contém sete anúncios; sua importação continua separada e cria somente rascunhos.

## Modelo e integridade

| Tabela | Finalidade e regras principais |
| --- | --- |
| `vehicles` | UUID, slug público único e imutável pelo serviço, tipo `motorcycle`/`car`, dados comerciais opcionais no rascunho, preço em centavos como `integer` (nulo ou de 0 a 2.147.483.647), estado, confirmação de disponibilidade, datas, versão de edição, origem e referência legada. Ano entre 1900 e 2100; quilometragem não negativa. Estados públicos exigem marca, modelo, preço positivo, confirmação e data de publicação. Índices para estado/data e origem/referência única. |
| `vehicle_images` | FK restritiva para veículo, chave permanente única, origem `r2`/`legacy_public`, posição não negativa, no máximo uma capa por veículo (índice único parcial), MIME JPEG/PNG/WebP, tamanho positivo e dimensões ambas ausentes ou ambas positivas. Chave vazia é recusada. Índice de veículo/posição. URL assinada temporária não é persistida. |
| `vehicle_audit` | FK restritiva para veículo e operador. Eventos com instante, operação, resultado e snapshots comerciais anterior/posterior. Operações comuns exigem `actor_user_id`; apenas `legacy_imported` usa ator nulo. Gatilho bloqueia `UPDATE` e `DELETE`, inclusive para o papel que executa o teste. Índices por veículo/tempo e operador/tempo. A escrita do evento e a alteração do veículo acontecem na mesma transação. |
| `user`, `account`, `session`, `verificationToken`, `authenticator` | Estrutura compatível com `@auth/drizzle-adapter` 1.11.3. Não define provedor nem credencial de login. |
| `admin_grants` | Concessão explícita vinculada a `user`, com datas de concessão/revogação. Estar autenticado não concede administração automaticamente. Nenhum administrador inicial foi criado. |

`NULL` significa dado comercial ainda não informado. Preço zero só serve a rascunho ou arquivado; publicação exige preço maior que zero. A validação Zod aplica os mesmos limites antes da escrita. `version_number` é conferido sob bloqueio de linha e incrementado em cada mudança administrativa para evitar sobrescrita silenciosa.

## Transições de estado

| Atual | Próximos estados permitidos |
| --- | --- |
| `draft` | `published`, `archived` |
| `published` | `reserved`, `sold`, `archived` |
| `reserved` | `published`, `sold`, `archived` |
| `sold` | `published`, `archived` |
| `archived` | `draft` |

A camada de serviço verifica a matriz, a versão esperada e a autorização antes da transação. Para entrar em `published`, exige confirmação explícita da disponibilidade e ao menos uma foto, além dos campos comerciais mínimos. O banco restringe valores de estado e campos obrigatórios dos estados públicos; a matriz de transição e a exigência de foto são regras da camada de serviço. O papel de aplicação não deve oferecer escrita SQL direta a clientes.

## Migrações versionadas

`drizzle/0000_burly_power_pack.sql` cria as tabelas, FKs, índices e constraints iniciais. `0001_nebulous_shape.sql` adiciona a cópia da fonte legada. `0002_damp_wolfpack.sql` corrige a semântica de `NULL` em duas constraints. `0003_audit_append_only.sql` instala o gatilho da auditoria. `0004_motionless_martin_li.sql` exige operador nas auditorias comuns e valida MIME e chave de fotos. O histórico e os snapshots ficam em `drizzle/meta/`.

O `drizzle-kit migrate` registra as migrações aplicadas em `drizzle.__drizzle_migrations`; repetir o comando não reaplica o SQL. Os arquivos SQL individuais não devem ser executados manualmente como se fossem idempotentes. Não usar `drizzle-kit push`.

## Validação local de 25/10/2026

As cinco migrações foram aplicadas em um PostgreSQL 16 descartável em `127.0.0.1:55433` e o comando de migração foi repetido com sucesso. A tabela de histórico manteve cinco entradas; foram encontrados dez constraints em `vehicles`, nove em `vehicle_images` e um gatilho próprio em `vehicle_audit`. `npm test` com `DATABASE_URL` e `TEST_DATABASE_URL` apontando para esse banco passou 11 testes, incluindo importação repetida de sete slugs distintos, todos em `draft`, e rejeição de alteração/exclusão da auditoria. `admin_grants` permaneceu vazio. Os testes do serviço simulam apenas o limite de sessão; não comprovam o login real. Nenhum desses testes escreveu no Neon.

## Implantação futura e rollback

1. Obter autorização para migração remota, verificar backup/restauração e revisar os arquivos SQL. Criar ou confirmar um papel de migração separado do papel de runtime. O papel de runtime deve ter os privilégios mínimos descritos em `FUNDACAO_TECNICA_FASE1.md`; ele não deve ter `UPDATE`, `DELETE` ou `TRUNCATE` em `vehicle_audit`.
2. Conferir novamente a branch antes de qualquer escrita: `NEON_DEVELOPMENT_BRANCH_ID=br-quiet-tooth-b83ew3t8 npm run db:check`. Esse verificador executa apenas `SELECT 1` e associa endpoint à branch. Não divulgar a saída de variáveis de ambiente.
3. Com `DATABASE_URL_DIRECT` configurada para a branch autorizada, aplicar **somente após autorização**: `npm run db:migrate`. `npm run db:generate` apenas gera SQL local quando o schema muda. Nunca apontar os testes de integração para o Neon: use um PostgreSQL isolado e defina `DATABASE_URL` e `TEST_DATABASE_URL` com a mesma URL local.
4. Conferir histórico, tabelas, constraints e índices após a migração. A importação legada é uma operação separada e não deve publicar anúncios automaticamente.

Para rollback de código, a vitrine continua independente do banco e pode usar a versão anterior sem alterar os anúncios públicos. Não há migração `down` automática: antes de qualquer remoção de objetos, restaurar uma cópia em banco separado, comparar histórico e dados, e planejar uma migração corretiva revisada. Alterações destrutivas no Neon exigem autorização específica.
