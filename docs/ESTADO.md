# Estado do projeto — Liberato Motos Car
_Atualizado em 2026-11-15 · branch `fix/whatsapp-p0-confiabilidade-20261111`, 10 commits à
frente do remoto, **sem push**_

## Agora
Fases 0 e 1 saíram da árvore de trabalho e viraram **9 commits por assunto** — nada publicado,
nada mergeado, nenhum segredo tocado:

- `c06e975` guarda de WABA deixa de se conferir a si mesma · `114fa50` `notifyOps`, incidente com
  destino humano · `0344f7b` nenhum limite ou falha deixa o cliente sem resposta
  (`WhatsappTurnResult`, encaminhamento em dois níveis, `falhasOperacionais`) · `f50f5a0`
  `/api/cron/retencao` com `CRON_SECRET` · `f07fbc8` resposta do vendedor com envio fora da
  transação · `b229533` `publishRequirements` como regra única da arte · `9705c12` Pixel com
  categoria real · `d3f9e18` nome acessível do Hero (WCAG 2.5.3) · `c45f4df` auditoria de 11/11
  versionada + os dois planos P0 · mais este registro de estado.

Verificação: `typecheck` ✅ · `lint` ✅ · `test` **995 passaram, 37 pulados** · `build` ✅. Cada
commit foi conferido isolado: typecheck e suíte ✅ nos 8 (935 → 995 testes). **Não rodado:** ensaio
real com a Meta e teste de integração com banco de verdade (os 37 pulados).

## Próximo passo
Decidir o **host único** (o plano recomenda Vercel) e aprovar a **migração da chave**. Só depois:
push da branch, variáveis nas produções (`CRON_SECRET`, `OPS_ALERT_WEBHOOK_URL`,
`WHATSAPP_WABA_ID`) e o ensaio real autorizado no número de teste: anúncio → mensagem → resposta →
handoff → visita, com `falhasOperacionais` = 0 e um alerta de teste chegando ao destino.

## Pendências
- [ ] P0 — **Decisão de host** (`docs/planos/2026-11-host-unico.md`). Dado novo: o Railway recebeu
      5 requisições em 7 dias, todas de robô, e **nenhuma** chamada de webhook; a Vercel não tem
      `WHATSAPP_WEBHOOK_CALLBACK_URL`. Conferir na Meta qual `override_callback_uri` está
      registrado antes de decidir.
- [ ] P0 — **`WHATSAPP_TOKEN_ENCRYPTION_KEY` ausente nas duas produções**
      (`docs/planos/2026-11-migracao-chave-whatsapp.md`), aguardando aprovação.
- [ ] P0 — **Retenção pronta e não ligada**: falta `CRON_SECRET` e, se o Railway ficar, um
      agendador próprio — o cron do `vercel.json` não dispara lá.
- [ ] P0 — **Push e PR**: PR #1 segue DRAFT com a descrição nova, mas os commits não foram
      enviados; no GitHub ele mostra o conteúdo antigo até o push.
- [ ] P1 — `OPS_ALERT_WEBHOOK_URL` sem valor: incidente contado e registrado, ninguém avisado.
- [ ] P1 — `WHATSAPP_WABA_ID` ausente: conferência vacuosa, agora visível no log.
- [ ] P1 — Métricas (`deriveAgentMetrics`) só em teste, sem tela nem rota; `visitaAgendadaPct` lê
      `conversations.facts`, não `visit_appointments`.
- [ ] P1 — Pixel/GA sem destino nas duas produções. A categoria enviada já é a real.
- [ ] P1 — Variável `WHATSAPP_WEBHOOK_CALLBACK_UR` (sem o `L`) sobrando no Railway.
- [ ] Loja confirmar dados, fotos e preços dos 5 anúncios publicados.

## Decisões
- 2026-11-15 — Histórico dividido por assunto, não por fase. _Fase é cronologia; quem lê o log
  depois procura o assunto._
- 2026-11-15 — Os planos de chave e de host descrevem ensaio, janela e rollback e **não executam
  nada**. _Os dois mudam produção; a decisão é do dono._
- 2026-11-15 — Retenção protegida por segredo compartilhado, não por sessão de admin. _O agendador
  não tem sessão, e um GET que apaga dado atrás de cookie vira gatilho por `<img>`._
- 2026-11-15 — WABA não conferida **registra e segue**. _Bloquear por variável ausente deixaria o
  cliente sem resposta e sem vendedor._
- 2026-11-15 — Envio fora da transação, e a gravação pós-envio não reprova por troca de dono. _O
  lock nunca impediu duplicata, e o cliente já recebeu._
- 2026-11-15 — Reserva do turno vem **antes** do teto por conversa. _O teto passou a responder;
  fora da reserva, duas mensagens simultâneas gerariam duas frases iguais._
- 2026-11-15 — Falha ao gravar a mensagem de ENTRADA sobe (`InboundPersistenceError`). _Sem
  gravação não há deduplicação; a reentrega da Meta é a recuperação._
- 2026-11-11 — Cota/limite com falha **segura**: erro de banco bloqueia a IA em vez de liberar.
- 2026-10-31 — `noindex` mantido até existir domínio próprio.

## Última sessão
2026-11-15 — Fases 0 e 1 commitadas por assunto, descrição do PR #1 reescrita e os dois planos P0
escritos. Sem push, sem merge, sem deploy, sem segredo alterado.
