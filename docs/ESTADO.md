# Estado do projeto — Liberato Motos Car
_Atualizado em 2026-11-16 · **as cinco fases estão em produção** · `main` = `8b2bb35`_

## Agora
**Publicado em produção em 16/11/2026, com autorização explícita.** Merge fast-forward da
`fix/whatsapp-p0-confiabilidade-20261111` na `main` (`020a9a6` → `8b2bb35`, 39 commits) e deploy
Railway `5492cbb5` em **SUCCESS**. Antes disso: revisão independente do diff, **sem bloqueador**
(os sete pontos de risco foram conferidos e estavam certos), e verificação em `a848d95` —
`typecheck` exit 0 · `lint` exit 0 · `test` **1102 passaram, 46 pulados** · `build` exit 0.

Conferência pós-deploy, sem tocar na Meta: vitrine **200** (88 KB, 0,77 s) · `/admin/login` **200**
· `/admin/metricas` **307 → /admin/login** (rota nova no ar e protegida; antes do merge era 404) ·
`/admin/atendimento` **307 → /admin/login** · `GET /api/webhooks/whatsapp` sem token **403** ·
`/api/cron/retencao` **503 "Rotina de retenção não configurada"**, com `no-store` e
`noindex, nofollow`.

**`WHATSAPP_TOKEN_ENCRYPTION_KEY` definida em 18/11, com autorização, ANTES de conectar o
WhatsApp da loja** — se fosse depois, o token que o Liberato gravar no sábado ficaria ilegível e ele
teria de refazer a conexão pelo Facebook. Definida pelo CLI com `--set-from-stdin`, então o valor
nunca passou por log nem por transcrição: **copie do painel do Railway para um gerenciador de
senhas**. Conferido: 64 hex minúsculo (usada direta, não como semente), deploy **novo** `cff9d238`
(snapshot `fd0162c4`, não redeploy) em SUCCESS, container às 04:30, vitrine 200.
Backup do estado anterior: tabela `whatsapp_tenants_backup_20261118` (1 linha, a do número de
teste, 664 caracteres cifrados).
**Estado intermediário esperado:** o token salvo está agora **ilegível** — foi cifrado com a chave
derivada e é lido com a explícita. Não há risco: esse token já estava expirado, nenhum número real
está conectado, e falha de envio não deixa cliente mudo. Fecha quando o token for renovado e
regravado em `/admin/ajustes`. **Não provado:** que o processo lê a chave — só um caminho de
decifragem prova, e nenhuma rota pública expõe isso.

**`CRON_SECRET` e `OPS_ALERT_WEBHOOK_URL` criados em 16/11, com autorização:** a rota de retenção
saiu de 503 para **403**. Ainda faltam `WHATSAPP_WABA_ID`, `NEXT_PUBLIC_META_PIXEL_ID` e
`NEXT_PUBLIC_GA_MEASUREMENT_ID`; e sobram **as duas**
`WHATSAPP_WEBHOOK_CALLBACK_UR` (lixo, sem o `L`) e `WHATSAPP_WEBHOOK_CALLBACK_URL`.
`DATABASE_URL_DIRECT` corretamente ausente.

**A retenção está ligada e comprovada em produção.** Serviço `retencao-agendador`
(`alpine:3.21`, cron `17 6 * * *` = 03:17 de Brasília, `restartPolicy NEVER`) com `CRON_SECRET`
por referência a `${{liberatomotoscar.CRON_SECRET}}` e `ALVO_RETENCAO`. Execução real em 16/11
às 12:50:57 UTC: `conversations: 0`, `rateLimitWindows: 16`, arquivos `checked: 0`, **`falhas: 0`**
— e, do lado do app, `200` em 53 ms vindo de `152.55.181.118` com `curl/8.14.1`, IP e versão
distintos da máquina local, que é a prova de que quem chamou foi o agendador.

O caminho até isso rendeu uma armadilha que vale lembrar: no Railway a configuração só chega ao
container num **deploy novo**. `redeploy` reaproveita o snapshot antigo, mudança de variável não
cria deploy em serviço com cron, e o disparo do cron re-executa o deploy corrente — então o
serviço ficava **verde** sem rodar comando nenhum. O que destravou foi trocar a tag da imagem
(`3.22` → `3.21`), que re-resolve a fonte. Só `cronSchedule` vale na hora.

**O alerta de incidente tem destino.** `OPS_ALERT_WEBHOOK_URL` aponta para um webhook do Discord
no servidor **do operador da plataforma** (`RonalDigital Ops`, canal `alertas-liberato`) — não é
canal da loja. Mensagem de teste entregue no formato real (`HTTP 204`, visível no canal). Deploy
`669b1aab` em SUCCESS, com vitrine 200, cron 403 e `/admin/metricas` 307 depois dele.
A variável existe **nos dois hosts** desde 16/11 (ver pendências), e a forma canônica
`discord.com/api/webhooks/...` foi confirmada entregando (`HTTP 204`).

**Não verificado:** login Google de ponta a ponta (a tela serve 200 e as rotas protegidas
redirecionam, mas nenhuma sessão foi concluída) e o ensaio real na Meta.

Rollback disponível: deploy `62cafdca` (10/11, commit `020a9a6`), `canRollback: true`.

## Próximo passo
**Apresentação e entrega marcadas para sábado, 21/11, no endereço do Railway** (sem domínio próprio:
decisão de 18/11). Nesta ordem, até sexta: (1) renovar o token do número de teste em WhatsApp → API
Setup, de preferência o de **usuário do sistema**, que não expira, e criar `WHATSAPP_WABA_ID` da
mesma página; (2) regravar o token em `/admin/ajustes` → "Ativar número de teste neste serviço",
que também aponta o `override_callback_uri` da WABA para o Railway e fecha a dúvida de qual host a
Meta chama; (3) o **ensaio real**, único elo nunca provado; (4) conferir o estúdio de artes num
celular de verdade. No sábado, com o Liberato presente: "Conectar com WhatsApp".

## Pendências
- [x] P0 — ~~Merge do PR #1~~ **feito em 16/11/2026**: `main` = `8b2bb35`, deploy `5492cbb5` SUCCESS.
- [x] P0 — ~~Agendador da retenção~~ **ligado e comprovado em 16/11** (execução real, `falhas: 0`).
- [x] P0 — ~~`OPS_ALERT_WEBHOOK_URL`~~ **criado em 16/11**: Discord do operador, teste entregue.
- [ ] P0 — **Variáveis no Railway**: criar `WHATSAPP_WABA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`,
      `NEXT_PUBLIC_GA_MEASUREMENT_ID`; apagar o lixo `WHATSAPP_WEBHOOK_CALLBACK_UR` (sem o `L`).
      `DATABASE_URL_DIRECT` **não** vai para lá: só migração e scripts o leem. Sem elas: WABA sem
      conferência e Pixel/GA sem destino.
- [ ] P0 — **Conferir o webhook na Meta** (só leitura): `GET /<WABA_ID>/subscribed_apps`; o
      `override_callback_uri` diz se a Meta chama o Railway ou a Vercel. Comprovado em 16/11 que
      **os dois hosts servem o código novo**: a Vercel republicou a `main` às 08:52 e
      `/api/cron/retencao` — rota que não existe em `020a9a6` — responde **503** lá e **403** no
      Railway. Então a confiabilidade vale nos dois — menos urgente do que parecia.
      `OPS_ALERT_WEBHOOK_URL` **também foi criada na Vercel** em 16/11, com autorização, e a
      produção foi republicada para a variável valer (`q2a6d4brh`, Ready em 56 s, aliased): o aviso
      no Discord funciona nos dois hosts. `CRON_SECRET` segue **fora** da Vercel de propósito — a
      retenção falha fechada lá (503), não apaga nada e não duplica o agendador do Railway.
      Não verificado: que o alerta realmente saia da Vercel. Nenhuma rota expõe isso, e provar
      exigiria causar uma falha real.
- [x] P0 — ~~`WHATSAPP_TOKEN_ENCRYPTION_KEY` ausente~~ **definida em 18/11**, antes de conectar a
      loja. Falta só regravar o token depois de renovado (abaixo), e guardar a chave num
      gerenciador de senhas a partir do painel do Railway.
- [ ] P0 — **O WhatsApp da loja nunca foi conectado.** Conferido no banco de produção em 16/11:
      `whatsapp_tenants` tem **uma linha só**, o número de teste da Meta (`+1 555-195-6955`,
      criado em 28/10). Não é defeito — é o passo do botão "Conectar com WhatsApp"
      (embedded signup) em `/admin/ajustes`, que nunca foi dado. Explica de uma vez a ausência de
      chamadas da Meta e de mensagem real no código. **Depende do Liberato**: a autorização é pelo
      Facebook da loja, não dá para fazer por ele.
- [ ] P0 — **Token do número de teste expirou** (botão "Verificar token", 16/11: código Meta 190).
      Renovar em WhatsApp → API Setup antes de qualquer ensaio; o temporário dura ~24 h, então
      para a apresentação vale gerar o de usuário do sistema.
- [ ] P0 — **Ensaio real** no número de teste: anúncio → mensagem → Dayse → handoff → vendedor.
      Critério: `falhasOperacionais = 0`, nenhum cenário sem resposta e sem vendedor, e um alerta
      de teste chegando ao destino.
- [ ] P1 — Apagar a branch Neon `restauracao-pre-migracao-20261116` a partir de 23/11/2026.
- [ ] P1 — Vercel e Railway seguem apontando para `production`, como deve ser. Só o `.env` local
      mudou — conferir antes de qualquer `db:migrate` futuro.
- [ ] P1 — **O alerta não diz de qual loja é.** `OpsAlert` (`src/server/ops/alert.ts`) carrega
      `evento`, `motivo` e `conversationId`, mas não `tenantId`. No piloto de uma loja um canal por
      loja resolve; quando entrar a segunda, alarme sem identificar o tenant é inútil — não dá para
      saber onde olhar. São poucas linhas no tipo e nos três pontos que o chamam em
      `webhook-handler.ts`.
- [ ] P1 — **Incidentes só no canal WhatsApp**: o canal site segue sem instrumentação de falha.
- [ ] P1 — **Retenção não expurga `attendance_incidents`**: cresce para sempre, mas aceitável no
      piloto (uma linha por encaminhamento; nem 100/dia pesariam).
- [ ] P1 — **Conferência do estúdio no aparelho**: a prévia fixa foi medida em emulação de
      390×844, não em vidro (`docs/liberato-inteligente/05-CONFERENCIA-ESTUDIO-ARTES.md`).
- [ ] P2 — `operator-reply.ts` conferir `messageId` como o webhook já faz: 200 sem
      `messages[0].id` hoje conta como entregue.
- [ ] P2 — `findTenant` e `pauseAutomationOnSellerEcho` fora do `try` por mensagem no webhook.
- [ ] Decidir se o cadastro precisa de **campo placa** (a busca varre marca, modelo, versão, ano).
- [ ] Decidir se excluir anúncio **publicado** deve mesmo apagar as fotos (regra de `79b74f7`).
- [ ] Loja confirmar dados, fotos e preços dos 5 anúncios publicados.

## Decisões
- 2026-11-18 — A chave de criptografia é definida **antes** de a loja conectar, não depois. _Token
  gravado com chave derivada vira ilegível quando a explícita entra, e quem refaz a conexão pelo
  Facebook é o dono da loja._
- 2026-11-18 — Apresentar e entregar **no endereço do Railway**, sem domínio próprio. _Escolha do
  dono: zero risco novo a três dias da entrega._ O `noindex` continua, por consequência.
- 2026-11-18 — Segredo novo entra por `railway variables --set-from-stdin`, nunca por argumento.
  _O valor não aparece em log, histórico de shell nem transcrição; o único lugar onde ele existe é
  o painel._
- 2026-11-16 — O destino do alerta é um **webhook do Discord** no servidor do operador. _Aceita o
  payload sem adaptação (`content`), é gratuito, não depende de aprovação e avisa no celular._
- 2026-11-16 — O alerta de `notifyOps` é o **pager do operador da plataforma**, não um canal da
  loja. _Os três eventos que o disparam são falhas técnicas (token recusado, turno estourado, banco
  sem confirmar) que só o operador conserta; a loja age pelo painel._ Consequência: o destino do
  webhook é do dono da plataforma, e a loja não participa dele.
- 2026-11-16 — Agendador com **`alpine` + `sh -c`**, não `alpine/curl`. _O `alpine/curl` tem
  `ENTRYPOINT ["curl"]`, então não há shell para expandir `$CRON_SECRET`._
- 2026-11-16 — A imagem fica em **`alpine:3.21`**, e não volta para `3.22`. _`3.21` é a versão em
  que a execução foi provada; trocar por simetria geraria deploy não verificado._
- 2026-11-16 — **Publicado depois da revisão, não antes.** _A revisão não achou bloqueador, e
  só então o merge foi autorizado._ Os dois achados P2 foram para a fila, não para o caminho
  crítico: nenhum deles deixa cliente sem resposta e sem vendedor.
- 2026-11-16 — **Revisão antes de publicar.** _No Railway o merge é o deploy: revisar depois seria
  revisar em produção._
- 2026-11-16 — **Host único: Railway**, contra a recomendação (era Vercel). _Escolha do dono:
  processo contínuo, mais previsível._ Preço: retenção exige agendador próprio e o `vercel.json`
  vira configuração morta até o corte terminar.
- 2026-11-16 — Migrações `0008`–`0012` em produção **com branch de restauração antes**, não PITR.
  _A retenção de histórico do Neon é de 6 h; uma branch fica fixada no LSN para sempre._
- 2026-11-16 — Trabalho local em branch Neon `development`. _O `.env` apontava para a branch da
  loja, e o nome `NEON_DEVELOPMENT_BRANCH_ID` disfarçava isso._
- 2026-11-16 — Front na Vercel com backend no Railway **não é possível** sem reescrever o app. _É
  um Next.js monolítico: Server Actions, route handlers e Auth.js no mesmo processo das páginas._
- 2026-11-16 — Estoque ordena por `createdAt` com `id` de desempate. _O editor grava a cada pausa,
  então `updatedAt` jogava o veículo aberto para o topo; sem desempate a paginação perde linha._
- 2026-11-16 — Excluir conversa exige o **id da conversa** no servidor. _`confirm=yes` fixo viaja
  em toda requisição e torna a trava decorativa._
- 2026-11-15 — Intenção de visita e visita marcada são **duas métricas com dois nomes**.
- 2026-11-15 — Incidente vira **linha em tabela**, não contador, com `notifyOps` ao lado.
- 2026-11-11 — Cota/limite com falha **segura**: erro de banco bloqueia a IA em vez de liberar.
- 2026-10-31 — `noindex` mantido até existir domínio próprio.

## Última sessão
2026-11-18 — Auditoria e padronização visual completa de UX/UI do painel administrativo:
- Unificação do cabeçalho de todas as páginas (`topBar` com título, subtítulo e ações alinhadas com divisor suave em Estoque, Agenda, Divulgar e Cadastro/Edição de Veículos).
- Unificação dos filtros de situação do estoque (`StatusFilter`) com o padrão de pílulas (`filterTab`, `radius-pill`, contadores `(n)`, transições sutis e contraste WCAG 2.2).
- Ajustes finos no formulário e galeria de fotos de veículos (grid de 2 colunas para campos relacionados, botões de câmera/galeria 50/50 com ícones e remoção do espaço fantasma no rodapé).
- Padronização dos botões do cabeçalho de atendimento ("Ver métricas" e "Configurar WhatsApp"): centralizados, com a mesma dimensão e formato retangular, com "Configurar WhatsApp" recebendo coloração oficial da marca (verde WhatsApp `var(--whatsapp)` com fundo e borda translúcidos e alto contraste).
- 1107 testes unitários passando, 0 erros no typecheck e lint, build de produção Next.js validado com sucesso.
