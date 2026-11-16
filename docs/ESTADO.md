# Estado do projeto — Liberato Motos Car
_Atualizado em 2026-11-16 · branch `fix/whatsapp-p0-confiabilidade-20261111` **enviada** ·
PR #1 aberto e pronto para revisão_

## Agora
As cinco fases passaram por **revisão independente do diff** e estão no PR #1: fora de draft, base
`main`, 38 commits, 109 arquivos, `mergeable_state: clean` (fast-forward). A revisão **não achou
bloqueador** — os sete pontos de risco levantados foram conferidos e estavam certos (silêncio só
nos três casos legítimos; `InboundPersistenceError` como único erro que sobe; cron de retenção
403/503 e sem caminho por sessão; alerta sem dado de cliente; incidente `ON DELETE SET NULL`;
exclusão de conversa exigindo `confirm === id` no servidor; estoque todo atrás de `requireAdmin()`).
Ficaram dois pontos de robustez, registrados nas pendências. Detalhe completo na descrição do PR.

Verificação em `a848d95`: `typecheck` exit 0 · `lint` exit 0 · `test` **1102 passaram, 46 pulados**
· `build` exit 0. Os pulados são `describe.skipIf(!TEST_DATABASE_URL)`, não teste desligado.

**Nada disto está em produção:** o Railway serve o commit `020a9a6` da `main`, de 10/11/2026.
`AGENTS.md`, este arquivo e `docs/planos/2026-11-host-unico.md` seguem **sem commit**.

## Próximo passo
**O merge do PR #1 é o deploy** — o Railway publica a `main` sozinho. Aguarda autorização
explícita do dono. Ao autorizar: fast-forward na `main`, acompanhar o deploy até `SUCCESS`, e
conferir sem tocar na Meta — vitrine, login Google, `/admin/metricas`, `/admin/atendimento`, e
`curl -i .../api/cron/retencao` devolvendo **403** (403 em vez de 404 prova que a rota subiu).
Rollback: `canRollback` no deploy anterior.

## Pendências
- [ ] P0 — **Merge do PR #1** (= deploy). Só com a palavra do dono.
- [ ] P0 — **Variáveis no Railway**: criar `CRON_SECRET`, `WHATSAPP_WABA_ID`,
      `OPS_ALERT_WEBHOOK_URL`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`;
      apagar o lixo `WHATSAPP_WEBHOOK_CALLBACK_UR` (sem o `L`). `DATABASE_URL_DIRECT` **não** vai
      para lá: só migração e scripts o leem. Sem elas: retenção em 503, WABA sem conferência,
      alerta sem destino, Pixel/GA sem destino.
- [ ] P0 — **Agendador da retenção** (§6 do plano): segundo serviço Railway, `alpine/curl`,
      `17 6 * * *`, com `curl -fsS` — sem o `-f` um 500 passa por sucesso. O cron de `vercel.json`
      não dispara no Railway.
- [ ] P0 — **Conferir o webhook na Meta** (só leitura): `GET /<WABA_ID>/subscribed_apps`; o
      `override_callback_uri` diz se a Meta já chama o Railway.
- [ ] P0 — **`WHATSAPP_TOKEN_ENCRYPTION_KEY` ausente no Railway**
      (`docs/planos/2026-11-migracao-chave-whatsapp.md`): hoje a chave vem derivada do
      `META_APP_SECRET`. Aguarda aprovação.
- [ ] P0 — **Ensaio real** no número de teste: anúncio → mensagem → Dayse → handoff → vendedor.
      Critério: `falhasOperacionais = 0`, nenhum cenário sem resposta e sem vendedor, e um alerta
      de teste chegando ao destino.
- [ ] P1 — Apagar a branch Neon `restauracao-pre-migracao-20261116` a partir de 23/11/2026.
- [ ] P1 — Vercel e Railway seguem apontando para `production`, como deve ser. Só o `.env` local
      mudou — conferir antes de qualquer `db:migrate` futuro.
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
2026-11-16 — Fase 6: revisão independente das cinco fases, push e PR. Sem bloqueador; dois pontos
de robustez viraram pendência P2. PR #1 fora de draft, descrição reescrita com o que muda para o
cliente, as decisões arriscadas e o que **não** foi verificado. **Sem merge, sem deploy, sem
segredo tocado, sem migração.**
