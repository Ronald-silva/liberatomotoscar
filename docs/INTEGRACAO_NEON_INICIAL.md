# Integração inicial Neon + Drizzle — 25/10/2026

## Resultado

O projeto já tinha `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11 e `postgres` 3.4.9 da Fase 1. Não foram reinstalados. `@next/env` 16.4.2 foi declarado como dependência direta para o Drizzle Kit ler `.env` do mesmo modo que o Next.js. O backend permanece no Next.js local, com o driver `postgres.js` em Node e a URL pooled. A URL direta é exclusiva da configuração de migrações e do teste de conexão.

`git check-ignore -v .env` confirmou a regra `.env*` em `.gitignore`; `git ls-files --error-unmatch .env` confirmou que o arquivo não está rastreado. Somente os nomes `DATABASE_URL` e `DATABASE_URL_DIRECT` foram identificados no arquivo; nenhum valor foi exibido. O Git local estava em `main` durante esta inspeção. `development` é o nome informado para a **branch do Neon**, não uma mudança de branch Git feita nesta etapa.

## Configuração

| Arquivo | Mudança |
| --- | --- |
| `drizzle.config.ts` | `loadEnvConfig(process.cwd())` carrega `.env`; `DATABASE_URL_DIRECT` validada é usada apenas como credencial do Drizzle Kit. `generate` continua possível sem URL; `migrate` exige URL direta. |
| `src/server/env.ts` | Valida URLs PostgreSQL e exige SSL em conexão remota, com erros que não incluem credenciais. |
| `src/server/db/client.ts` | Já usa `DATABASE_URL` pooled, com `postgres.js`, conexão lazy e transações; não precisou ser alterado. |
| `scripts/check-neon-connection.ts` | Confere formato do par pooled/direto, executa `SELECT 1 AS ok` e compara o ID da branch por consultas somente de leitura, fechando ambas. Não cria tabelas nem registra dados. |
| `.env.example`, `package.json`, `package-lock.json` | Documentam `DATABASE_URL_DIRECT`, o ID opcional do endpoint e o comando `npm run db:check`. |

O esquema de nove tabelas e as quatro migrações SQL da Fase 1 já estavam preparados em `src/server/db/schema.ts` e `drizzle/`. `npm run db:generate` informou **“No schema changes, nothing to migrate”**. Nenhuma migração remota, `push`, `neon deploy`, commit ou deploy foi executado.

## Verificação da conexão e da branch

`npm run db:check` com a configuração local respondeu:

| Verificação sem expor o endpoint | Resultado |
| --- | --- |
| `SELECT 1` usando `DATABASE_URL` pooled pelo cliente Drizzle da aplicação | **PASSOU** |
| `SELECT 1` usando `DATABASE_URL_DIRECT` pelo driver PostgreSQL | **PASSOU** |
| Mesmo endpoint, banco e papel após retirar apenas o sufixo `-pooler` | **PASSOU** |
| Mesmo ID de branch retornado pelas duas conexões | **PASSOU** |
| Runtime com pooling e URL direta sem pooling | **PASSOU** |
| Região São Paulo (`sa-east-1`) e SSL exigido nas URLs | **PASSOU** |
| Nome da branch `development` ligado ao ID do compute | **PENDENTE DE VALIDAÇÃO** |

A string de conexão identifica o compute, não traz o nome da branch. Uma consulta somente de leitura ao PostgreSQL retornou um ID `br-...` igual nas duas conexões, mas não o nome. Para confirmar `development` sem expor credenciais, copie do Console Neon o ID da branch para `NEON_DEVELOPMENT_BRANCH_ID` ou o ID do compute para `NEON_DEVELOPMENT_ENDPOINT_ID` e repita `npm run db:check`. O comando compara os IDs sem imprimi-los e marca `branchDevelopmentVerified: true` somente se coincidirem. Até essa comparação, está comprovado que as duas URLs alcançam **a mesma branch Neon**, não o nome dado a ela.

## Validação do projeto

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | **PASSOU**. |
| `npm run lint` | **PASSOU**. |
| `npm test` sem `TEST_DATABASE_URL` | **PASSOU**: 6 testes; 4 testes de integração com escrita foram ignorados de propósito. |
| `npm run build` | **PASSOU**: página inicial e rotas de veículos continuaram estáticas; nenhum deploy. |
| Varredura do bundle `.next/static` | **PASSOU**: as duas strings de conexão não apareceram nos arquivos enviados ao navegador. |

Os testes de integração PostgreSQL existentes exigem `TEST_DATABASE_URL` de um banco isolado **já migrado** e alteram dados de teste. Como a branch remota não deve receber tabelas ou escrita nesta etapa, esses testes ficam ignorados quando `TEST_DATABASE_URL` não está configurada. O teste `db:check` é a evidência de conectividade remota somente de leitura.

O `npm install @next/env@16.4.2` manteve quatro avisos moderados em dependências de desenvolvimento já identificadas na Fase 1. Nenhuma correção automática de dependências foi aplicada.

## Pendências

- Confirmar no Console Neon o ID `br-...` da branch `development` ou o ID do seu compute `ep-...` e repetir `db:check` com a variável correspondente.
- Revisar as migrações e decidir quando será autorizado aplicá-las na branch correta, com backup e papel de migração apropriado.
- Provisionar o método de login e o R2 em etapa separada; nenhuma mudança visual ou de catálogo foi feita aqui.

Referências: [variáveis de ambiente no Next.js](https://nextjs.org/docs/app/guides/environment-variables), [computes e branches no Neon](https://neon.com/docs/manage/endpoints/), [conexões pooled no Neon](https://neon.com/docs/connect/connection-pooling).
