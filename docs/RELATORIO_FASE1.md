# Relatório da Fase 1 — 25/10/2026

> Este relatório registra o estado **antes** da integração inicial com o Neon. As conexões remotas de leitura foram testadas depois; consulte [INTEGRACAO_NEON_INICIAL.md](./INTEGRACAO_NEON_INICIAL.md) para o estado atual. Nenhuma migração remota foi executada.

## A. Diagnóstico inicial

Confirmados no repositório: Next.js 16.4.2/React 19, sete veículos em `src/data/inventory-vehicles.ts`, imagens locais, páginas e OG gerados estaticamente, `dynamicParams = false`, `noindex` global, nenhuma camada de banco/auth/storage e nenhum teste automatizado. Não há configuração de hospedagem verificável no repositório. A auditoria de produto está em [AUDITORIA_PLANO_PAINEL_VEICULOS.md](./AUDITORIA_PLANO_PAINEL_VEICULOS.md).

## B. Implementação

- Adicionados `src/server/db/` (schema e cliente), `src/server/vehicles/` (validação, serviços e importador), `src/server/storage/r2.ts`, `src/server/auth.ts`, `src/server/authz.ts` e duas rotas técnicas em `src/app/api/`.
- Adicionados `drizzle.config.ts`, migrações versionadas em `drizzle/`, scripts locais de importação e concessão administrativa, configuração Vitest e dez testes.
- Atualizados `package.json`, `package-lock.json`, `.env.example` e README. Dependências de produção: `drizzle-orm`, `postgres`, `next-auth` 5 beta, `@auth/drizzle-adapter`, `zod`, cliente/presigner S3 da AWS para R2. Desenvolvimento: `drizzle-kit`, `vitest`, `tsx`; `@types/node` foi atualizado para 22 para atender o Vitest.
- Nenhum componente ou estilo público foi alterado. O catálogo estático permanece a fonte do site.

## C. Banco de dados

Nove tabelas: cinco do Auth.js, `admin_grants`, `vehicles`, `vehicle_images`, `vehicle_audit`. Quatro migrações SQL (`0000` a `0003`) foram aplicadas em PostgreSQL 16 temporário local. Há unicidade de slug, origem/referência legada e capa por veículo; FK de fotos/auditoria; checks de tipo, estado, ano, km, preço, campos mínimos públicos e dimensões; índices de estado/atualização, ordem das fotos e consulta da auditoria. Um gatilho bloqueia `UPDATE` e `DELETE` da auditoria.

O runtime usa Drizzle com `postgres.js` em Node/TCP, conexão pooled configurável, `max: 5`, `prepare: false` e transações. Drizzle Kit usa `MIGRATION_DATABASE_URL` separada. Nenhuma conexão Neon foi configurada nem testada. A [documentação da arquitetura](./FUNDACAO_TECNICA_FASE1.md) cobre limites e operação.

## D. Segurança

Auth.js usa sessões em banco e não tem provedor habilitado: **não existe login funcional nesta fase**. Não há cadastro público. `requireAdmin()` lê o ID da sessão no servidor e exige concessão ativa em `admin_grants`; todos os serviços administrativos chamam essa função. O endpoint técnico `/api/admin/health` tem `no-store` e `noindex` e não aparece na navegação. `AUTH_SECRET` é validado com mínimo de 32 caracteres em runtime. Dados de identidade enviados pelo cliente não são aceitos pelos serviços.

Teste HTTP no build de produção local, com sessão fictícia no PostgreSQL temporário: anônimo **403**; sessão com concessão **200**; mesma sessão após revogação **403**. A primeira tentativa com sessão inserida no fuso local expirou; corrigida para UTC, o teste acima passou. Testes de serviço com Vitest simulam apenas o limite da sessão; a prova de autorização é o teste HTTP local, não esses mocks. O login do proprietário e papéis mínimos em Neon permanecem pendentes. RLS não foi ativado: a identidade não é repassada ao banco, então uma política por usuário seria simbólica.

## E. Storage

O adaptador R2 é tipado e fica somente no servidor. Valida limite de 10 MB e assinatura básica de JPEG/PNG/WebP, gera chave aleatória, usa bucket privado e pode gerar URL de leitura assinada por 60 segundos após checagem administrativa. Foto nova não pode usar chave escolhida pelo navegador. Falhas de associação tentam apagar o objeto enviado; limpeza de órfãos está documentada. Não houve upload real: bucket e credenciais não foram configurados. Antes de expor upload ao proprietário, faltam decodificação/normalização da imagem, miniaturas e entrega pública controlada.

## F. Migração

Importação local inicial: **7 criados, 0 ignorados**. Repetição e teste automatizado: **0 criados, 7 ignorados**. Todos os sete slugs foram preservados, todos ficaram `draft`, com `published_at = NULL`, foto legada associada e cópia integral do objeto original em `source_data`. Em outro banco temporário, foi criado um conflito para o último slug; o importador falhou e a consulta confirmou **0 registros parciais** da origem legada. Nenhuma importação foi executada em Neon.

Slugs preservados: `volkswagen-saveiro-robust-2024`, `fiat-strada-2016`, `honda-fan-2015`, `honda-titan-2013`, `yamaha-fazer-2014`, `honda-pop`, `yamaha-crosser`.

## G. Testes

| Comando ou verificação | Resultado |
| --- | --- |
| `npm run db:generate` | PASSOU; SQL versionado gerado sem conexão remota. |
| `npm run db:migrate` em PostgreSQL 16 temporário local | PASSOU nos dois bancos de teste. |
| `npm test` com `TEST_DATABASE_URL` local | PASSOU: 4 arquivos, 10 testes. Inclui validação, persistência, versão concorrente, FK, capa única, checks com `NULL`, rollback, auditoria append-only, fotos e importação idempotente. |
| HTTP `/api/admin/health` em `next start` local | PASSOU: 403 anônimo, 200 com sessão+grant, 403 após revogação. |
| `npm run lint` | PASSOU. |
| `npm run typecheck` | PASSOU. |
| `npm run build` | PASSOU com acesso às fontes existentes do Google; 25 páginas estáticas geradas e as duas rotas técnicas dinâmicas. O primeiro build sem rede falhou somente ao buscar as fontes já usadas pelo projeto. |
| `npm audit --omit=dev` | PASSOU: zero avisos em dependências de produção. `npm audit` total: quatro avisos moderados em dependências transitivas de desenvolvimento de `drizzle-kit`/`esbuild`. |

Não foi executado teste contra Neon ou R2 real. Não há teste visual automatizado preexistente.

## H. Regressões públicas

`git diff --name-only` para `src/components`, `src/app/page.tsx`, `src/app/veiculos`, `src/app/globals.css` e `public` não listou alterações. O build continuou gerando `/` como estática e as dez rotas legadas de veículo por `generateStaticParams`. Não há troca de catálogo ou mudança de design. A varredura de nomes `DATABASE_URL`, `R2_SECRET_ACCESS_KEY` e `AUTH_SECRET` em `.next/static` não retornou arquivo; como o build não tinha segredos reais, isso não substitui inspeção do deploy final.

## I. Critérios de aceite

| Critério | Estado | Evidência ou limite |
| --- | --- | --- |
| Modelo PostgreSQL | **PASSOU** | Schema e constraints em `src/server/db/schema.ts`. |
| Migrações versionadas e validadas | **PASSOU** | Quatro SQL aplicados em PostgreSQL local. |
| Drizzle integrado ao backend | **PASSOU** | Cliente e serviços tipados; testes reais locais. |
| Conexão Neon configurável e protegida | **PENDENTE DE VALIDAÇÃO** | Código e variáveis prontos; Neon não provisionado/testado. |
| Autenticação Auth.js preparada | **PASSOU** | Adapter, tabelas, sessões, rota e fechamento por padrão. Login real pendente. |
| Autorização administrativa | **PASSOU** | Serviço e teste HTTP local 403/200/403. Papéis Neon pendentes. |
| Nenhum cadastro público de administrador | **PASSOU** | Nenhum provedor ou rota de cadastro habilitados; grant separado. |
| Storage R2 preparado com controles | **PASSOU** | Adaptador privado, validação básica, chave única, leitura assinada. Integração real pendente. |
| Serviços tipados e validações comerciais | **PASSOU** | Serviços com Zod, versão concorrente e constraints testados. |
| Auditoria sensível | **PASSOU** | Mesma transação e gatilho append-only testados localmente. |
| Importador idempotente | **PASSOU** | 7/0, 0/7 e rollback 0 em conflito. |
| Sete rascunhos preservados nos testes | **PASSOU** | Slugs, estado e foto verificados. |
| Segurança e persistência testadas | **PASSOU** | PostgreSQL real local e HTTP local; não equivale a teste de infraestrutura final. |
| Site público preservado | **PASSOU** | Nenhuma alteração visual/pública no diff; build estático. |
| Build sem regressões | **PASSOU** | `npm run build` concluído. |
| Documentação | **PASSOU** | Arquitetura, configuração, operação e este relatório. |
| Nenhum deploy ou migração remota | **PASSOU** | Somente bancos temporários locais foram usados. |

Não há critério final classificado como **FALHOU**; as validações externas foram mantidas como **PENDENTE DE VALIDAÇÃO**.

## J. Pré-requisitos da próxima fase

Confirmar com o proprietário o canal de login e o aparelho usado; escolher o provedor Auth.js e testar sessões reais; provisionar Neon e R2 com credenciais de escopo mínimo, backup/restauração e papéis separados; validar custo e upload real; completar processamento de imagens. Depois disso, construir o painel mobile-first sem trocar o catálogo público até revisão do estoque e autorização de publicação oficial.
