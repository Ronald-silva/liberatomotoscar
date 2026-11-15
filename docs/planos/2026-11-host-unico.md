# Plano — host único (Railway × Vercel)

_Escrito em 2026-11-15. **Plano, não execução.** A decisão é sua; nada foi alterado. Os dados abaixo
vieram de leitura das APIs do Railway e da CLI da Vercel — **nomes** de variáveis, nunca valores._

## 1. O problema

O mesmo commit está publicado em dois lugares, apontando para **o mesmo Neon e o mesmo R2**:

| | Railway | Vercel |
|---|---|---|
| Projeto / serviço | `liberato-motos-car` / `liberatomotoscar` | `liberatomotoscar` |
| Endereço | `liberatomotoscar-production.up.railway.app` (porta 8080) | `liberatomotoscar.vercel.app` |
| Origem | GitHub `Ronald-silva/liberatomotoscar`, branch `main` | mesmo repo, branch `main` |
| Último deploy | 2026-11-10 15:30 UTC, sucesso | há ~5 dias (10/11), Ready, Node 24.x |
| Domínio próprio | nenhum | nenhum |
| Tráfego 7 dias | **5 requisições**, todas robô do Google em `/opengraph-image`; **zero** chamadas em `/api/webhooks/whatsapp` | não medido (ver passo 2) |

Dois hosts com o mesmo banco significam: dois agendadores possíveis para a mesma rotina de
expurgo, duas instâncias disputando a reserva de turno da mesma conversa, e dois destinos
possíveis para o webhook da Meta — sendo que só **um** está registrado nela de fato.

E o `AGENTS.md` diz “Deploy: Vercel” enquanto o PR #1 diz “Produção oficial: Railway”. Uma das duas
frases está errada e isso precisa acabar com a decisão.

## 2. Como descobrir qual produção a Meta chama hoje

A resposta autoritativa está na **inscrição da WABA**, não no painel do app: o código registra um
`override_callback_uri` por WABA (`src/server/whatsapp/test-number.ts`), porque o callback global
do app atende outro projeto (SalesNet). Então:

```bash
# Token: o de API Setup (WhatsApp → API Setup). Leitura, não altera nada.
curl -s "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer <TOKEN>" | jq .
```

O `override_callback_uri` que voltar é **o host que a Meta chama**. Confirmação cruzada:

1. `WHATSAPP_WEBHOOK_CALLBACK_URL` de cada host (o Railway tem; a Vercel **não tem** — forte
   indício de que o último “Ativar webhook” foi feito pelo Railway).
2. `NEXT_PUBLIC_SITE_URL` de cada host: é o que alimenta `TEST_WEBHOOK_URL` e os links dos
   anúncios já divulgados.
3. Logs: no Railway, **nenhum** `POST /api/webhooks/whatsapp` em 7 dias (verificado). Na Vercel,
   conferir em Observability → Logs, filtro por `/api/webhooks/whatsapp`, últimos 7 dias.
4. Painel da Meta → WhatsApp → Configuration: mostra o callback **do app**, que pode não ser o da
   WABA. Serve de contexto, não de prova.

> Hipótese que os dados sugerem: o webhook aponta para o Railway (é quem tem
> `WHATSAPP_WEBHOOK_CALLBACK_URL`), mas **nenhuma mensagem real chegou lá** desde 08/11 — ou seja,
> ninguém mandou mensagem ao número de teste nesse período. Confirme com o `curl` acima antes de
> decidir.

## 3. O que pesa na escolha

| Critério | Railway | Vercel |
|---|---|---|
| Agendador para `/api/cron/retencao` | precisa criar (ver §6) | `vercel.json` já tem o cron; só falta `CRON_SECRET` |
| `vercel.json` (`regions`, `crons`) | ignorado | é a configuração do projeto |
| Processo | Node longo, porta 8080, `next start` | funções; `maxDuration = 300` já declarado na rota |
| Variáveis hoje | 25 nomes, inclui `AUTH_URL`, `META_GRAPH_API_VERSION`, `OPENROUTER_MODEL`, `WHATSAPP_AI_DAILY_LIMIT`, `WHATSAPP_WEBHOOK_CALLBACK_URL` | 23 nomes, inclui `DATABASE_URL_DIRECT`, `NEON_DEVELOPMENT_BRANCH_ID` |
| Domínio próprio futuro | suportado | suportado |
| Custo | serviço sempre ligado | por uso |

**Recomendação:** ficar na **Vercel** e desligar o Railway. Motivos: o cron da retenção já está
declarado no repositório e só funciona lá; o `vercel.json` (regiões) só vale lá; o tráfego real do
Railway é nulo, então não há nada a preservar; e o `noindex`/domínio próprio futuro é igual nos
dois. Se você preferir o Railway (processo contínuo, mais previsível), o plano abaixo funciona na
direção oposta — só acrescenta o §6.

## 4. O que migrar (diferença de variáveis, por nome)

**Só no Railway hoje** — se a Vercel vencer, criar lá:
`AUTH_URL` (precisa ser o endereço do host vencedor), `META_GRAPH_API_VERSION`, `OPENROUTER_MODEL`,
`WHATSAPP_AI_DAILY_LIMIT`, `WHATSAPP_WEBHOOK_CALLBACK_URL` (precisa apontar para o host vencedor).

**Só na Vercel hoje** — se o Railway vencer, criar lá:
`DATABASE_URL_DIRECT`, `NEON_DEVELOPMENT_BRANCH_ID`.

**Faltando nos dois** (pendências já conhecidas):
`WHATSAPP_TOKEN_ENCRYPTION_KEY` (ver `2026-11-migracao-chave-whatsapp.md`), `WHATSAPP_WABA_ID`,
`CRON_SECRET`, `OPS_ALERT_WEBHOOK_URL`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`.

**Achado a corrigir:** o Railway tem uma variável `WHATSAPP_WEBHOOK_CALLBACK_UR` (sem o `L`) ao
lado da correta. É lixo de digitação; nada no código a lê. Apagar quando mexer nas variáveis.

Não há dado a mover: Neon e R2 são os mesmos para os dois hosts. **Nenhuma migração de banco é
necessária neste corte** — o que muda é quem chama o banco.

Fora das variáveis, precisa acompanhar o host vencedor:

- **Google OAuth** (Auth.js): o redirect URI autorizado no console do Google precisa conter
  `https://<host-vencedor>/api/auth/callback/google`, e `AUTH_URL` tem de bater com ele. Se não
  bater, o login do painel para.
- **Meta**: `override_callback_uri` da WABA (§5) e, se aplicável, os domínios permitidos do app.
- **Links já divulgados**: `NEXT_PUBLIC_SITE_URL` é o endereço que aparece nos anúncios e nas
  legendas de arte. Se os 5 anúncios publicados citam o host que vai morrer, eles ficam quebrados.
  **Conferir antes de desligar qualquer coisa.**

## 5. Ordem de corte (com volta atrás em cada passo)

Premissa: os dois hosts continuam de pé até o fim. Nada é desligado antes do passo 7.

1. **Registrar o estado atual.** Salve o resultado do `curl` de `subscribed_apps`, a lista de
   variáveis de cada host e o `NEXT_PUBLIC_SITE_URL` de cada um. É o que você vai querer de volta.
   _Volta atrás:_ nada foi mudado.
2. **Nivelar as variáveis no host vencedor** (§4), incluindo `WHATSAPP_WEBHOOK_CALLBACK_URL`
   apontando para ele mesmo, `AUTH_URL` e `NEXT_PUBLIC_SITE_URL` com o endereço dele. Ainda **sem**
   `CRON_SECRET`.
   _Volta atrás:_ apagar as variáveis criadas. O webhook ainda não mudou de lado.
3. **Deploy e conferência do host vencedor** sem tráfego da Meta: abrir a vitrine, entrar no painel
   com o Google (prova `AUTH_URL` + OAuth), abrir `/admin/atendimento` e `/admin/ajustes`, e rodar
   “Conferir token salvo”.
   _Volta atrás:_ nada no lado da Meta mudou; o outro host continua atendendo.
4. **Chave de criptografia**, se for fazer junto: executar `2026-11-migracao-chave-whatsapp.md`
   neste host. Fazer antes do passo 5 evita regravar o token duas vezes.
5. **Virar o webhook.** No painel do host vencedor, `/admin/ajustes` → “Ativar número de teste
   neste serviço” (ou “Ativar webhook com o token salvo”): isso chama a Meta e troca o
   `override_callback_uri` da WABA para este host. Confirmar com o `curl` do §2.
   _Volta atrás:_ rodar a mesma ação no host antigo — ele reaponta o callback para si. Por isso o
   host antigo **não pode** ser desligado ainda.
6. **Ensaio real** (com sua autorização): mensagem do celular verificado → resposta da Dayse →
   handoff → resposta do vendedor pelo painel. Critério: `falhasOperacionais = 0`, nenhum
   `envio_falhou`, e um alerta de teste chegando ao `OPS_ALERT_WEBHOOK_URL`.
   _Volta atrás:_ passo 5 invertido.
7. **Ligar a retenção**: criar `CRON_SECRET` no host vencedor e o agendador (§6 se for Railway;
   na Vercel o `vercel.json` já faz). Disparar uma vez à mão e conferir a resposta:
   ```bash
   curl -i -H "Authorization: Bearer <CRON_SECRET>" \
     https://<host-vencedor>/api/cron/retencao
   ```
   Esperado: `200` com `"falhas":0`. Sem o cabeçalho: `403`. Sem a variável no servidor: `503`.
   _Volta atrás:_ apagar `CRON_SECRET` — a rota volta a 503 e não apaga nada.
8. **Período de observação: 7 dias** com os dois hosts vivos e só um recebendo webhook.
9. **Desligar o perdedor.** No Railway: _Remove_ do serviço (ou pausar). Na Vercel: desconectar o
   Git do projeto para parar o deploy automático. **Antes disso**, confirmar que nenhum anúncio,
   QR code ou link publicado aponta para ele.
   _Volta atrás:_ recriar o serviço do mesmo repo/branch e repor as variáveis do passo 1 — é o
   passo mais caro de desfazer, e é por isso que ele é o último.
10. **Corrigir o `AGENTS.md`** (a linha “Deploy: Vercel”) e o `docs/ESTADO.md` com o host decidido.

## 6. Se o Railway for o escolhido: o agendador

O cron de `vercel.json` (`17 6 * * *` em `/api/cron/retencao`) **só dispara na Vercel**. No Railway
a rotina nunca roda — e “retenção pronta mas não ligada” continua sendo pendência P0. Opções, da
mais simples à mais robusta:

1. **Serviço de cron no próprio Railway** (recomendado): criar um segundo serviço no mesmo projeto,
   imagem leve (ex.: `alpine/curl`), _Cron Schedule_ `17 6 * * *`, comando:
   ```sh
   curl -fsS --max-time 300 -H "Authorization: Bearer $CRON_SECRET" \
     https://liberatomotoscar-production.up.railway.app/api/cron/retencao
   ```
   O serviço precisa **terminar** ao fim da execução (é como o Railway trata cron). `CRON_SECRET`
   entra como variável desse serviço, com o mesmo valor do app. Vantagem: mesma conta, mesmo
   painel, falha visível ali.
2. **GitHub Actions agendado** (`schedule: cron`), com o segredo em _Actions secrets_ e `curl -f`.
   Vantagem: histórico de execuções e e-mail em falha. Desvantagem: o agendador do GitHub atrasa e
   às vezes engole execuções — aceitável para expurgo diário, não para algo de minuto.
3. **Cron externo** (cron-job.org e similares). Mais simples de ligar, mas põe o segredo num
   terceiro e não tem histórico confiável. Último recurso.

Em qualquer opção: `-f` (ou `--fail`) é obrigatório, senão o `500` de etapa falhada passa por
sucesso e a retenção volta a ser rotina que ninguém confere. E o segredo tem de ser **o mesmo** do
app, senão a rota responde 403 todo dia em silêncio.

Se a Vercel for a escolhida, confira no painel qual é o limite do plano para cron (no Hobby o
disparo é diário e em hora aproximada — o que basta para `17 6 * * *`) e que `CRON_SECRET` existe,
porque é a existência da variável que faz a Vercel enviar o `Authorization` automaticamente.

## 7. Decisões que são suas

- [ ] **Qual host fica.** (recomendação: Vercel)
- [ ] Rodar a migração da chave junto com o corte (passo 4) ou depois?
- [ ] Autorizar o ensaio real com o número de teste da Meta (passo 6)?
- [ ] Desligar o perdedor de vez (passo 9) ou deixá-lo pausado por um mês?
- [ ] Domínio próprio: entra neste corte ou fica para depois? Se entrar, muda
      `NEXT_PUBLIC_SITE_URL`, `AUTH_URL`, o redirect do Google, o callback da Meta — e libera a
      saída do `noindex`, que hoje é decisão consciente.
