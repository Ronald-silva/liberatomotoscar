# Estado do projeto — Liberato Motos Car
_Atualizado em 2026-11-15 · branch `fix/whatsapp-p0-confiabilidade-20261111`, 15 commits à
frente do remoto, **sem push**_

## Agora
A Fase 4 pôs na tela o que só existia em log, e rodou os 37 testes que nunca tinham rodado.
**5 commits novos**, nada publicado, nada mergeado, nenhum segredo tocado:

- `6ba3395` `visitaAgendadaPct` → `visitaIntencaoPct` (fato anotado) **+** `visitaMarcadaPct`
  (lido de `visit_appointments`) · `39d60b7` tabela `attendance_incidents`, migração 0012 aditiva,
  e o webhook gravando cada incidente · `071d9a6` `/admin/metricas` (rota, tela, janela 7/30 dias,
  canal, painel de incidentes) · `7d71e78` migração 0008 idempotente — ela travava a cadeia inteira
  · `54d359d` os 37 testes rodaram; dois estavam desatualizados.

Verificação sem banco: `typecheck` ✅ · `lint` ✅ · `test` **1040 passaram, 39 pulados** ·
`build` ✅ (`/admin/metricas` na lista de rotas).
Verificação com banco, em branch efêmera do Neon criada a partir de produção e **apagada no fim**:
**1079 passaram, 0 falharam, 0 pulados**, tanto no esquema atual de produção quanto no esquema já
migrado. Produção não recebeu escrita nenhuma (`written_data_bytes: 0`).
**Não rodado:** ensaio real com a Meta.

## Próximo passo
Decidir o **host único** (o plano recomenda Vercel) e aprovar a **migração da chave**. Agora há uma
terceira decisão de produção na fila: rodar `npm run db:migrate` para registrar 0008–0012, hoje
nunca aplicadas. Só depois: push da branch, variáveis nas produções (`CRON_SECRET`,
`OPS_ALERT_WEBHOOK_URL`, `WHATSAPP_WABA_ID`) e o ensaio real autorizado no número de teste.

## Pendências
- [ ] P0 — **Decisão de host** (`docs/planos/2026-11-host-unico.md`). O Railway recebeu 5
      requisições em 7 dias, todas de robô, e **nenhuma** chamada de webhook; a Vercel não tem
      `WHATSAPP_WEBHOOK_CALLBACK_URL`. Conferir na Meta qual `override_callback_uri` está
      registrado antes de decidir.
- [ ] P0 — **`WHATSAPP_TOKEN_ENCRYPTION_KEY` ausente nas duas produções**
      (`docs/planos/2026-11-migracao-chave-whatsapp.md`), aguardando aprovação.
- [ ] P0 — **Migrações 0008–0012 nunca aplicadas em produção**: o banco tem 9 registradas e o
      esquema só se mantém pelo `ensure-schema`. Com 0008 corrigida a cadeia vai até o fim
      (provado em branch efêmera: 9 → 14, sem violar dado existente, repetível). Rodar
      `npm run db:migrate` em produção é decisão sua.
- [ ] P0 — **Retenção pronta e não ligada**: falta `CRON_SECRET` e, se o Railway ficar, um
      agendador próprio — o cron do `vercel.json` não dispara lá.
- [ ] P0 — **Push e PR**: PR #1 segue DRAFT; os commits não foram enviados.
- [ ] P1 — `OPS_ALERT_WEBHOOK_URL` sem valor: incidente contado, gravado e visível na tela, mas
      ninguém avisado na hora.
- [ ] P1 — `WHATSAPP_WABA_ID` ausente: conferência vacuosa, visível no log.
- [ ] P1 — **Incidentes só no canal WhatsApp**: a tela de métricas diz isso com todas as letras,
      mas o canal site segue sem instrumentação de falha.
- [ ] P1 — **Retenção não expurga `attendance_incidents`**: a tabela só guarda id de conversa e
      motivo (nada do cliente), e cresce devagar — mas cresce para sempre.
- [ ] P1 — Pixel/GA sem destino nas duas produções. A categoria enviada já é a real.
- [ ] P1 — Variável `WHATSAPP_WEBHOOK_CALLBACK_UR` (sem o `L`) sobrando no Railway.
- [ ] Decidir se excluir anúncio **publicado** deve mesmo apagar as fotos (regra de `79b74f7`,
      hoje medida em teste). Foi pensada para veículo de teste; vale para anúncio real?
- [ ] Loja confirmar dados, fotos e preços dos 5 anúncios publicados.

## Decisões
- 2026-11-15 — Intenção de visita e visita marcada são **duas métricas com dois nomes**. _Um nome
  que promete agendamento medindo frase de cliente erra sempre para o lado que agrada quem lê._
- 2026-11-15 — Incidente vira **linha em tabela**, não contador, e o alerta (`notifyOps`)
  continua ao lado. _A tela precisa dizer qual conversa ficou sem vendedor; e a gravação morre com
  o Postgres, que é quem causa boa parte dos incidentes._
- 2026-11-15 — `semRegistro` conta o evento dedicado, não `registro = 'nenhum'`. _Um
  encaminhamento sem registro gera duas linhas; somar registro contaria a conversa duas vezes._
- 2026-11-15 — Migração que o `ensure-schema` também cria é **aditiva e repetível**. _Sem isso a
  cadeia para na primeira colisão e nenhuma migração seguinte se registra._
- 2026-11-15 — Teste de integração que só vale em banco virgem é teste errado. _Rodou contra cópia
  de produção e reprovou por a loja ter publicado anúncio — o objetivo do produto._
- 2026-11-15 — Histórico por assunto, não por fase; os planos de chave e de host **não executam
  nada**; retenção atrás de segredo compartilhado, não de sessão; WABA não conferida registra e
  segue; reserva do turno antes do teto por conversa.
- 2026-11-11 — Cota/limite com falha **segura**: erro de banco bloqueia a IA em vez de liberar.
- 2026-10-31 — `noindex` mantido até existir domínio próprio.

## Última sessão
2026-11-15 — Fase 4: métricas com tela (`/admin/metricas`), a métrica que mentia separada em duas,
incidentes persistidos e visíveis, migração 0008 destravada e os 37 testes rodados em branch
efêmera do Neon (apagada). Sem push, sem merge, sem deploy, sem segredo alterado.
