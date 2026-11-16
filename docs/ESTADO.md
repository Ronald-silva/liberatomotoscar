# Estado do projeto — Liberato Motos Car
_Atualizado em 2026-11-16 · branch `fix/whatsapp-p0-confiabilidade-20261111`, 21 commits à
frente do remoto, **sem push**_

## Agora
A Fase 5 atacou a jornada no celular — fotografar → cadastrar → publicar → arte → compartilhar.
**5 commits novos**, nada publicado, nada mergeado, nenhum segredo tocado:

- `317abf0` a caixa de "marcar vendido" fica aberta com o motivo dentro quando a gravação falha
  (fechá-la fazia a ação parecer concluída) · `0597a45` excluir conversa passa a ser **barrado no
  servidor**, exigindo o id da conversa · `6d3233f` busca, ordem estável e paginação no estoque ·
  `f7a18ae` a prévia da arte fica fixa no topo do celular · `038b906` marca e cor abrem com seis
  fichas em vez da lista inteira.

Medido em 390×844, nas mesmas telas (`docs/capturas/fase5-jornada-celular/`):
prévia visível ao escolher a foto **0 px → 338 px (0% → 100%)** · controles na tela de edição
**46 → 37** · fichas de toque **25 → 16** · altura da página **3063 → 2907 px** · busca no
estoque: não existia → um campo, no servidor, com `requireAdmin()`.

Verificação: `typecheck` ✅ · `lint` ✅ · `test` **1102 passaram, 46 pulados** · `build` ✅.
Integração contra PostgreSQL real em branch efêmera: **39 passaram** (7 novos de busca, ordem e
paginação). Jornada inteira exercitada no navegador em 390×844, com captura de cada passo.
Produção não recebeu escrita (`written_data_bytes: 0`); as duas branches efêmeras foram apagadas.
**Não rodado:** ensaio real com a Meta.

## Próximo passo
Decidir o **host único** (o plano recomenda Vercel) e aprovar a **migração da chave**. Terceira
decisão na fila: rodar `npm run db:migrate` para registrar 0008–0012, hoje nunca aplicadas. Só
depois: push da branch, variáveis nas produções (`CRON_SECRET`, `OPS_ALERT_WEBHOOK_URL`,
`WHATSAPP_WABA_ID`) e o ensaio real autorizado no número de teste.

## Pendências
- [ ] P0 — **Decisão de host** (`docs/planos/2026-11-host-unico.md`). O Railway recebeu 5
      requisições em 7 dias, todas de robô, e **nenhuma** chamada de webhook; a Vercel não tem
      `WHATSAPP_WEBHOOK_CALLBACK_URL`. Conferir na Meta qual `override_callback_uri` está
      registrado antes de decidir.
- [ ] P0 — **`WHATSAPP_TOKEN_ENCRYPTION_KEY` ausente nas duas produções**
      (`docs/planos/2026-11-migracao-chave-whatsapp.md`), aguardando aprovação.
- [ ] P0 — **Migrações 0008–0012 nunca aplicadas em produção**: o banco tem 9 registradas e o
      esquema só se mantém pelo `ensure-schema`. Rodar `npm run db:migrate` é decisão sua.
- [ ] P0 — **Retenção pronta e não ligada**: falta `CRON_SECRET` e, se o Railway ficar, um
      agendador próprio — o cron do `vercel.json` não dispara lá.
- [ ] P0 — **Push e PR**: PR #1 segue DRAFT; os commits não foram enviados.
- [ ] P1 — `OPS_ALERT_WEBHOOK_URL` sem valor: incidente contado, gravado e visível, ninguém avisado.
- [ ] P1 — `WHATSAPP_WABA_ID` ausente: conferência vacuosa, visível no log.
- [ ] P1 — **Incidentes só no canal WhatsApp**: o canal site segue sem instrumentação de falha.
- [ ] P1 — **Retenção não expurga `attendance_incidents`**: cresce devagar, mas para sempre.
- [ ] P1 — Pixel/GA sem destino nas duas produções. A categoria enviada já é a real.
- [ ] P1 — Variável `WHATSAPP_WEBHOOK_CALLBACK_UR` (sem o `L`) sobrando no Railway.
- [ ] P1 — **Conferência do estúdio no aparelho** (`docs/liberato-inteligente/05-CONFERENCIA-ESTUDIO-ARTES.md`):
      os quatro itens seguem sem rodar em Android/iPhone reais. A prévia fixa foi medida em
      emulação de 390×844, não em vidro.
- [ ] Decidir se o cadastro precisa de **campo placa**. A busca do estoque varre marca, modelo,
      versão e ano; placa ficou de fora por não existir no modelo nem na tela.
- [ ] Decidir se excluir anúncio **publicado** deve mesmo apagar as fotos (regra de `79b74f7`).
- [ ] Loja confirmar dados, fotos e preços dos 5 anúncios publicados.

## Decisões
- 2026-11-16 — A prévia da arte fica **fixa no topo** no celular, em 40% da janela. _Botão-âncora
  leva a pessoa até a prévia depois de ela já ter decidido no escuro; o problema era enquadramento._
- 2026-11-16 — O estoque ordena por `createdAt`, não `updatedAt`. _O editor grava sozinho a cada
  pausa, então abrir um veículo o jogava para o topo e movia todos os outros._
- 2026-11-16 — A busca dobra acento com `translate()`, não com `unaccent`. _A extensão é DDL numa
  cadeia de migrações que ainda não rodou em produção._
- 2026-11-16 — Excluir conversa exige o **id da conversa** no servidor. _`confirm=yes` fixo viaja
  em toda requisição e torna a trava decorativa — foi o P2-4 da auditoria na tela de modo._
- 2026-11-15 — Intenção de visita e visita marcada são **duas métricas com dois nomes**.
- 2026-11-15 — Incidente vira **linha em tabela**, não contador, com `notifyOps` ao lado.
- 2026-11-15 — Migração que o `ensure-schema` também cria é **aditiva e repetível**.
- 2026-11-15 — Teste de integração que só vale em banco virgem é teste errado.
- 2026-11-11 — Cota/limite com falha **segura**: erro de banco bloqueia a IA em vez de liberar.
- 2026-10-31 — `noindex` mantido até existir domínio próprio.

## Última sessão
2026-11-16 — Fase 5: a jornada no celular. Prévia da arte fixa durante o ajuste, busca e ordem
estável no estoque, metade das fichas de marca e cor, exclusão de conversa barrada no servidor e
a caixa de "marcar vendido" que não mente mais. Três itens da auditoria de UX foram encontrados
**já resolvidos** e deixados em paz: as quatro ações não falham mais em silêncio (`d4a9aa3`), a
hierarquia já tem uma ação primária por tela (`e6bb983`) e o título da arte nunca perde caractere
(o estúdio reescrito mede o texto de verdade). Sem push, sem merge, sem deploy, sem segredo
alterado.
