# Fundação técnica do catálogo — Fase 1

> Atualização posterior: as conexões pooled e direta do Neon foram testadas com `SELECT 1`, sem migrações remotas. Consulte [INTEGRACAO_NEON_INICIAL.md](./INTEGRACAO_NEON_INICIAL.md). O restante deste documento descreve a fundação e as pendências de autenticação, R2 e modelo público.

## Estado e limite

A fundação de dados foi adicionada sem trocar a fonte do site público. A vitrine e as páginas continuam lendo `src/data/inventory-vehicles.ts`; os sete registros no banco são **rascunhos**. Não houve migração remota, deploy ou publicação. O acesso Auth.js está **fechado por padrão**: não existe provedor de login até confirmar qual canal o proprietário usa com segurança. Nenhuma pessoa consegue entrar no painel somente por constar na tabela de usuários.

## Arquitetura

```text
Site público atual ──> catálogo estático (inalterado)

Futuro painel ──> Auth.js (sessão em PostgreSQL)
                 └─> requireAdmin (concessão ativa em admin_grants)
                      └─> serviços de veículos ──> Drizzle ──> Neon PostgreSQL
                                              └─> adaptador R2 privado
```

O backend é o runtime Node do Next.js. O driver `postgres` usa conexão TCP com a URL pooled do Neon, `max: 5`, sem prepared statements, para permitir transações reais entre dados e auditoria. HTTP do driver Neon é adequado a consultas simples, mas esta fase exige transações de escrita; WebSocket acrescentaria uma dependência operacional sem necessidade aqui. Migrações usam URL direta separada em `DATABASE_URL_DIRECT`. O Drizzle Kit carrega `.env` via `@next/env`. Não há conexão criada durante build: a validação da URL ocorre quando o serviço é chamado. Falha de URL ou conexão aborta a operação, sem registrar segredo em log.

Os serviços de escrita chamam `requireAdmin()` antes da operação. A função lê a sessão Auth.js no servidor e exige concessão ativa por ID do usuário em `admin_grants`. O ID não vem do navegador. Os serviços públicos devolvem apenas campos explicitamente públicos e filtram estados. A futura interface ou Server Action deverá chamar esses serviços; checagem em middleware ou botão oculto nunca será suficiente.

### Modelo

- `vehicles`: UUID interno, slug público único e estável, tipo, dados comerciais opcionais em rascunho, preço em centavos (`integer`), estado, confirmação de disponibilidade, datas, versão para concorrência, origem e cópia integral da fonte legada em `source_data`.
- `vehicle_images`: chave persistente, provedor (`r2` ou `legacy_public`), posição, capa, tipo, dimensões e tamanho. FK impede associação a veículo inexistente; índice parcial garante uma capa no máximo.
- `vehicle_audit`: eventos de sucesso para criação, dados, preço, foto e estado. A alteração e o evento ocorrem na mesma transação. Tentativas falhas são revertidas e não geram evento de sucesso. Um gatilho PostgreSQL bloqueia `UPDATE` e `DELETE` nessa tabela. Os snapshots contêm somente os dados comerciais do veículo, sem token, sessão ou credencial.
- Tabelas Auth.js: `user`, `account`, `session`, `verificationToken`, `authenticator`. `admin_grants` concede acesso separadamente; autenticação sozinha não concede privilégio.

O banco limita tipo e estado aos valores conhecidos, slug, ano, quilometragem, preço, versão e campos mínimos de um anúncio público. Preço `NULL` ou zero só é permitido em rascunho/arquivado; anúncio publicado, reservado ou vendido exige preço maior que zero. O serviço exige também pelo menos uma foto para publicar, porque essa regra envolve duas tabelas. Nada cria preço ou ano ausente automaticamente. A importação preserva os dados originais em `source_data`; informações de fábrica e pendências de verificação não entram como fatos confirmados nos campos comerciais.

### Fotos

O bucket R2 deve ser **privado**. O adaptador recebe bytes no servidor, limita a 10 MB, compara o MIME declarado com a assinatura de JPEG/PNG/WebP e cria chave aleatória em `drafts/<vehicle-id>/<uuid>.<ext>`. Não aceita chave escolhida pelo navegador. A associação acontece depois do upload e exige administrador. Se a gravação no banco falhar, tenta excluir o objeto recém-enviado. Se a exclusão também falhar, um processo operacional deverá localizar e remover o órfão. Ao remover uma foto, o banco é atualizado antes da exclusão no R2; falha desta última também deixa um órfão para limpeza. A leitura administrativa usa URL assinada curta, gerada após a checagem de permissão; a URL não é gravada no banco.

Não há rota pública de upload, entrega de fotos R2, geração de miniaturas ou análise completa dos pixels nesta fase. Antes de expor o envio na interface, completar verificação/normalização da imagem e proteção contra arquivo malformado. As imagens legadas continuam servidas pelos caminhos públicos atuais; sua origem fica marcada como `legacy_public`.

O catálogo estático público **ainda mostra** os sete anúncios da prévia, como antes desta fase. O estado `draft` protege apenas a nova fonte PostgreSQL e seus serviços; ocultar aqueles anúncios no site existente seria uma mudança pública separada, fora do escopo pedido.

### RLS e papéis PostgreSQL

RLS não foi habilitado. A aplicação usa conexão exclusiva pelo backend, sem token de usuário repassado ao PostgreSQL; uma política baseada em identidade do usuário não teria identidade confiável para avaliar. O limite de confiança é o serviço Next.js e `requireAdmin()`. O papel de runtime deve ter apenas `SELECT/INSERT/UPDATE` nas tabelas necessárias; `vehicle_audit` deve permitir somente `SELECT/INSERT`; não conceder `DELETE`/`TRUNCATE` nem DDL ao papel de runtime. O papel de migração deve ser distinto e usado apenas em operação controlada. Esses privilégios dependem do banco provisionado e **não foram aplicados em Neon**. RLS só deve ser adotado se a identidade e os papéis de banco forem definidos e testados com usuários sem bypass.

Matriz de concessões proposta para o papel de runtime, a ser ajustada e aplicada **após** provisionar os papéis no Neon:

| Tabelas | Privilégios necessários |
| --- | --- |
| `user`, `account`, `session`, `verificationToken`, `authenticator` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` exigidos pelo adaptador Auth.js para ciclo de vida de conta/sessão. |
| `admin_grants` | `SELECT` somente; concessão/revogação usa papel operacional separado. |
| `vehicles` | `SELECT`, `INSERT`, `UPDATE`; sem exclusão definitiva. |
| `vehicle_images` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` para remoção de foto. |
| `vehicle_audit` | `SELECT`, `INSERT` somente, além do gatilho que rejeita alterações e exclusões. |

## Configuração local e produção

1. O banco Neon da branch de desenvolvimento foi provisionado pelo proprietário. Manter a URL pooled em `DATABASE_URL` do servidor e a URL direta em `DATABASE_URL_DIRECT` para o Drizzle Kit. Não colocar qualquer URL no frontend. O repositório não contém credenciais. O teste de conexão de leitura é `npm run db:check`; ele exige as duas URLs, executa `SELECT 1` e compara o ID da branch por consulta somente de leitura, sem imprimir valores. O vínculo desse ID ao nome `development` ainda requer conferência no Console Neon.
2. Gerar `AUTH_SECRET` forte por um gerenciador de segredos. Configurar `AUTH_TRUST_HOST=true` apenas após confirmar o domínio/proxy de implantação. Escolher e configurar o provedor Auth.js conforme o acesso real do proprietário; até lá, `providers: []` bloqueia login.
3. Provisionar R2 privado e credenciais com escopo mínimo para o bucket. Definir `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` no servidor. Nenhuma configuração R2 foi executada remotamente.
4. Revisar o SQL em `drizzle/` e fazer backup antes de `npm run db:migrate`. `npm run db:generate` gera SQL sem conexão. `db:migrate` exige `DATABASE_URL_DIRECT`; sem ela a configuração não fornece credencial de banco e deve falhar. Não usar `drizzle-kit push` em produção.
5. Para testar a migração legada em um banco **local** já migrado: definir `DATABASE_URL` local e rodar `npm run db:import-legacy`. O script recusa host remoto. A execução é idempotente e transacional; colisão de slug ou imagem interrompe o lote inteiro.
6. Quando o provedor de login estiver configurado e um usuário real existir, conceder acesso somente após validar a identidade. O script `npm run db:grant-admin -- <id>` aceita apenas banco local; em produção, a concessão deve ocorrer por procedimento operacional autorizado no banco, com registro de quem autorizou. Nunca criar senha padrão nem promover todos os usuários autenticados.

### Testes

`npm test` executa testes sem banco. Com `TEST_DATABASE_URL` e `DATABASE_URL` iguais, apontando para um PostgreSQL **isolado e já migrado**, executa também os testes de integração. Esses testes escrevem somente dados de teste nesse banco. Os testes de serviços simulam a sessão para isolar regras de domínio; não demonstram por si só a segurança de Auth.js. O endpoint técnico `/api/admin/health` permanece fora da navegação e devolve 403 sem sessão, 200 somente com sessão e concessão, e `noindex`/`no-store`. Validar esse fluxo por HTTP com o provedor real na etapa de configuração do login.

## Operação e rollback

- **Backup:** antes de migração remota, produzir e verificar uma cópia restaurável do banco, incluindo tabelas Auth.js, veículos, fotos e auditoria. A estratégia concreta depende do Neon provisionado. Guardar também a lista de objetos R2 e sua política de retenção.
- **Restauração:** ensaiar em banco separado antes de qualquer incidente. Conferir contagens, slugs, estados, fotos e trilha de auditoria. Não restaurar por cima do banco vivo sem plano de janela e aprovação.
- **Rollback desta fase:** reverter o código mantém o site público atual funcionando, pois ele ainda usa o catálogo estático. As tabelas podem permanecer sem uso; não executar migração `down` destrutiva automaticamente.
- **Falhas:** erro de conexão aborta transações; versão desatualizada exige recarga; falha após upload pode deixar objeto órfão; falha R2 não publica anúncio sem foto. Não registrar URL de banco, token de sessão, URL assinada ou segredo R2 em logs.

## Riscos e decisões pendentes

- O Auth.js compatível com Next.js 16 está em versão `5.0.0-beta.32`; nenhum provedor foi escolhido ou habilitado. A validação de login real, cookies no domínio final e recuperação de acesso depende dessa escolha.
- `npm audit` identificou quatro avisos moderados na cadeia de desenvolvimento de `drizzle-kit` → `@esbuild-kit` → `esbuild`. Não foi executado `npm audit fix --force`; o caminho de atualização deve ser reavaliado quando houver versão compatível sem essa dependência.
- O bucket R2, os papéis PostgreSQL de runtime/migração, backups e testes de restauração ainda dependem de configuração não verificada neste repositório. O Neon responde a consultas de leitura, mas não recebeu migrações nesta integração inicial.
- A assinatura de arquivo e o limite de tamanho são verificados no adaptador R2; decodificação completa, normalização e miniaturas são pré-requisitos para oferecer upload ao proprietário.

## Referências técnicas

- [Auth.js com Drizzle](https://authjs.dev/getting-started/adapters/drizzle)
- [Drizzle: opções de conexão com Neon](https://orm.drizzle.team/docs/connect-neon)
- [Neon: conexões com pool](https://neon.com/docs/manage/endpoints/)
- [URLs assinadas R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- Documentação instalada do Next.js 16.4.2: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` e `02-guides/authentication.md`.

## Próxima fase

Confirmar aparelho e canal de login com o proprietário; habilitar um provedor Auth.js e testar sessão, expiração e concessão com identidade real; configurar Neon e R2 em ambientes separados; completar validação/normalização de fotos; então criar o painel mobile-first. A futura troca do catálogo estático exigirá rotas dinâmicas, cache/revalidação, OG com fotos persistidas, preservação dos slugs, tratamento de reservados/vendidos e revisão do `noindex` apenas quando o site oficial for aprovado.
