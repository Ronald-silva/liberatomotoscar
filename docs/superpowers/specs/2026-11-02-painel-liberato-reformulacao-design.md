# Reformulação do painel + agenda da Dayse — design

**Data:** 2 de novembro de 2026
**Base:** `b108509` (branch `main`)
**Auditoria que originou:** `docs/auditorias/AUDITORIA-UX-ADMIN-LIBERATO.md`

---

## 1. Intenção e o porquê

Em 1 de novembro de 2026 o proprietário do projeto tentou apresentar este sistema ao Elton, dono
da Liberato Motos Car. **A apresentação não aconteceu**: ele se perdeu na própria interface e não
conseguiu conduzir a demonstração. O Elton então mostrou o **Vapo**, a ferramenta que usa hoje.

O que o Vapo faz e encantou: **modelo de arte primeiro**. Escolhe uma peça pronta, insere a foto do
veículo — da galeria ou batendo na hora — e manda. Tem também **artes prontas de datas
comemorativas**, que foi o ponto que mais interessou.

O diagnóstico, confirmado pela auditoria, é que o problema **não é falta de recurso**. A camada de
servidor é sólida: concorrência otimista real, auditoria append-only, política de publicação em
fonte única, 482 testes verdes. O problema é que **o painel não se explica**. A tela de edição de um
veículo publicado com seis fotos tem cerca de 51 controles interativos, e o painel inteiro usa 27
botões secundários contra 6 primários — "Criar arte" é visualmente idêntico a "Excluir veículo".
Não há menu, não há navegação persistente, e não existe lugar nenhum para "divulgar".

Perdeu-se uma disputa de **clareza**, não de capacidade.

A resposta tem duas metades. A primeira é tornar o painel apresentável: dar-lhe uma navegação onde
não se perca, consertar o retorno silencioso das ações principais e a perda de texto nas artes. A
segunda é **não competir no terreno do Vapo**, e sim mostrar o que o Vapo não tem: uma atendente que
responde um cliente às 22h de um domingo e **marca a visita**. Hoje a Dayse já faz isso — e o
resultado não aparece em lugar nenhum do painel.

---

## 2. Objetivos

1. O proprietário consegue conduzir uma demonstração do painel sem se perder, tocando em quatro
   destinos e contando uma história em cada um.
2. Nenhuma ação principal falha em silêncio. Todo toque produz um retorno visível no lugar onde o
   toque aconteceu.
3. A arte comercial nunca sai com o nome do veículo cortado.
4. A arte sai do sistema para o WhatsApp sem o proprietário precisar procurar arquivo em pasta de
   download.
5. Existe uma tela de **agenda** que responde "quem vem hoje, a que hora, ver qual veículo" — com
   nome e telefone — alimentada automaticamente pela Dayse e também à mão.
6. Quando o vendedor responde uma conversa de WhatsApp pelo painel, **o cliente recebe** — ou é dito
   claramente por que não pode receber.
7. O chat do site sai do produto, e em seu lugar existe um controle que de fato pausa a Dayse no
   WhatsApp.

## 3. Não-objetivos (desta entrega)

- **Redesenho visual.** A identidade escura, a tipografia e a paleta permanecem. A auditoria não
  encontrou o visual como causa do problema da demonstração.
- **Modelo-primeiro e artes comemorativas.** Decidido para a Etapa 2, feito com esquema de layout
  declarativo (ver §9). Nesta entrega a aba "Divulgar" entra como destino, levando ao estúdio atual.
- **Situação do agendamento** (confirmado / compareceu / não veio) e **lembrete automático** por
  WhatsApp. Explicitamente fora: exige template aprovado pela Meta e tarefa agendada.
- **Publicação automática** em Instagram e Facebook. Exige conta Business, revisão do app pela Meta
  e armazenamento público das artes.
- **Persistência de artes.** Continuam efêmeras.
- **Busca e paginação do estoque**, reorganização completa das três seções de situação, e os demais
  itens P2/P3 da auditoria que não estejam listados em §5.

## 4. Anti-objetivos (o que torna isto um fracasso mesmo funcionando)

- **Somar dívida ao `ArtCanvas`.** Ele já tem 43 condicionais de geometria em 156 linhas. Qualquer
  mudança nesta entrega deve **reduzir ou manter** esse número, nunca aumentá-lo.
- **Quebrar a concorrência otimista do editor.** `useVehicleDraft.ts` tem 13 linhas de comentário
  explicando por que a versão vive ali. Mexer sem ler reintroduz a classe de bug que ele elimina.
- **Duplicar a regra de publicação.** `publishRequirements` em `validation.ts:48` é fonte única; o
  serviço recusa por ela e a tela mostra a mesma lista.
- **Entregar a agenda vazia na demonstração.** Uma agenda sem nada dentro é pior que nenhuma agenda.
  Ver §8.4.
- **Prometer uma semana e entregar nove dias sem avisar.** O tamanho real está em §10.

---

## 5. Achados que esta entrega corrige

Três vieram da auditoria; três foram descobertos durante o desenho e **não estão na auditoria**.

### 5.1 Da auditoria

**P0-1 — As quatro ações principais abortam em silêncio.** `publish()`, `openArt()`,
`StatusActions.change()` e `DangerActions.execute()` chamam `draft.saveBeforeAction()` e, quando
falha, retornam **sem definir mensagem**:

```
VehicleEditor.tsx:63   if (!await draft.saveBeforeAction()) { setPublishing(false); setConfirming(false); return; }
VehicleEditor.tsx:81   if (await draft.saveBeforeAction()) router.push(...)
StatusActions.tsx:26   if (!await draft.saveBeforeAction()) { setBusy(false); setConfirming(null); return; }
DangerActions.tsx:23   if (!await draft.saveBeforeAction()) { setBusy(false); return; }
```

A mensagem existe — `saveBeforeAction` a escreve (`useVehicleDraft.ts:218,224`) — mas é renderizada
pelo `SaveIndicator`, dentro de `VehicleForms`, no fim da **seção 1**. O botão "Publicar" está na
**seção 3**. Em celular a explicação nasce fora da tela. Em `DangerActions` é pior: `confirming` não
é limpo, então a caixa "Sim, excluir veículo" fica aberta sem explicação.

**P0-2 — A arte descarta texto do título sem aviso.** O título é desenhado com altura **fixa**,
`wrap="word"` e **sem `ellipsis`** (`ArtCanvas.tsx:129-131`). O Konva instalado, em
`node_modules/konva/lib/shapes/Text.js:624`, faz `if (fixedHeight && currentHeightPx + lineHeightPx > maxHeightPx) break;`
e só acrescenta "…" quando o atributo `ellipsis` é verdadeiro. **As linhas que não cabem
desaparecem, sem marca.** Medido com as fontes reais do projeto, um título de 75 caracteres perde
28 caracteres no feed e até 39 no Stories.

Quantas linhas cabem, pela aritmética do próprio Konva (`lineHeightPx = 1,02 × fontSize`):

| Corpo | Linha | Caixa | Cabem |
|---|---|---|---|
| 66px (≤24 chars, feed) | 67,32px | 120px | **1** |
| 55px (25–32 chars) | 56,10px | 120px | 2 |
| 48px (>32 chars) | 48,96px | 120px | 2 |
| 52px (vertical) | 53,04px | 108px | 2 (1,92px de sobra) |

Agravante: o corpo é escolhido por **contagem de caracteres** (`ArtCanvas.tsx:76-77`) enquanto a
restrição real é **largura em pixels**. "SUZUKI BOULEVARD M800" e "KAWASAKI NINJA ZX-10R" têm 21
caracteres e diferem 56px de largura. Folga medida a 66px: **5px** em "VOLKSWAGEN CROSSFOX", 16px em
"TOYOTA COROLLA CROSS" — ambos modelos do catálogo do próprio projeto
(`catalogo-marcas-modelos.ts`).

**P1-4 — Hierarquia plana.** 27 usos de `buttonSecondary` contra 6 primários.

### 5.2 Descobertos no desenho (não estão na auditoria)

**A-1 — O nome do cliente é recebido e descartado.** `webhook-handler.ts:243` lê
`contactMatch?.profile?.name?.trim() || null` da Meta e o passa adiante como `customerName`
(`:133, :249`). Mas `defaultRunAgentTurn` chama `recordIncomingWhatsappMessage` **sem esse campo**
(`:138-142`), e `IncomingWhatsappMessage` (`incoming.ts:48-53`) não o tem. O valor morre ali.

**A-2 — O telefone do cliente nunca é guardado.** `customerWaId` só alimenta
`whatsappConversationToken` (`incoming.ts:18-22`), um SHA-256 irreversível. A tabela `conversations`
guarda `tokenHash` e nada mais. O painel identifica conversas por `protocolOf()` —
"Atendimento #A3F2C1B8".

Não há decisão documentada mandando descartar. As menções a "conversas anonimizadas" em
`docs/APRESENTACAO_PREVIA.md:18` e `docs/PLANO_EXECUCAO.md:69` tratam da **fase de teste** do
agente, não do desenho definitivo.

**A-3 — A resposta do vendedor no WhatsApp nunca é entregue.** `sendWhatsAppTextMessage` é chamado
em **um único lugar**: `webhook-handler.ts:186`, o caminho da resposta automática.
`replyToInboxConversation` (`inbox.ts:71-74`) chama `appendHumanReplyAs`
(`conversation-repository.ts:233-248`), que **apenas insere no banco**. A action devolve
"Resposta enviada." e a mensagem não sai. Em conversa de canal `site` funciona, porque o chat do
site lê o banco; em `whatsapp`, não. A caixa de resposta é exibida igual nos dois casos
(`InboxOperatorControls.tsx:51-79`).

A causa raiz **não é só** A-2. `sendWhatsAppTextMessage` (`outbound.ts:5-13`) exige `phoneNumberId`,
`accessToken` e `to`. Hoje os três só existem no caminho do webhook, resolvidos a partir de
`metadata.phone_number_id` (`webhook-handler.ts:21-43, 253-257`). A tabela `conversations` não
guarda tenant nem número do negócio, e `inbox.ts` não tem ligação nenhuma com tenant. Ver §7.6 e
§7.9.

**A-4 — O formulário de modo de atendimento não controla nada.** `SiteModeForm`
(`atendimento/SiteModeForm.tsx`) escreve o canal `site` em `channel_settings`. `readSiteSetting` é
lido **em um único lugar**: `atendimento/page.tsx:61`, para preencher o próprio formulário. Nada no
site público consome. E o chat do site **não existe**: `src/components/attendance/` contém apenas
`site-chat.module.css`, 10 KB de CSS que nenhum arquivo importa, sem componente e sem rota. A Dayse
do WhatsApp lê `readWhatsappSetting()`, outro canal. Os três modos — "🤖 Agente IA Dayse",
"⚡ Chatbot Guiado", "⏸️ Desativado" — são um no-op com o rótulo mais confuso do painel. Em produção
ele foi alternado **34 vezes** (`channel_settings.version = 34`) sem efeito algum.

Pior: o modo "Desativado" **não seguraria** nem se houvesse chat. `ensure-schema.ts:130-134` roda
`UPDATE "channel_settings" SET "mode" = 'ai' WHERE "channel" = 'site' AND "mode" = 'disabled'` em
toda verificação de schema, e `settings.ts:25` trata `disabled` sem `updatedBy` como `ai`. O
desligamento se reacenderia sozinho — e com ele a despesa de IA.

**A-6 — `demo_ai_usage` é uma tabela órfã.** Existe no schema (`schema.ts:146`) e no banco de
produção, e **nenhum arquivo do projeto a referencia**. Fica registrada aqui; sua remoção não está
nesta entrega por decisão do proprietário.

**A-5 — A caixa de entrada mostra conversas vazias.** Conversas abertas com dono `automation` e sem
handoff entram no filtro "Com a Dayse" (`inbox.ts:22`) independentemente de terem mensagem. Em
produção há 12 nessa situação, todas com zero mensagens e zero turnos.

### 5.3 Retrato da produção em 2 de novembro de 2026

Consulta somente de leitura ao projeto Neon `liberato-motos-car-us` (`bitter-term-83685427`), que é
o que `.env` aponta (`c-14.us-east-1.aws.neon.tech`), autorizada pelo proprietário:

| Medida | Valor |
|---|---|
| Conversas | 13 — das quais **12 do canal `site` com 0 mensagens e 0 turnos** |
| Conversas reais | **1**, canal `whatsapp`, 19 turnos, 37 mensagens |
| Conversas com o fato `visit` | **1** — a mesma |
| Mensagens com `sender = 'human'` | **0** |
| Handoffs | 1 |
| Tenant de WhatsApp ativo | `liberato-motos-car-teste`, número `+1 555-195-6955` |
| `channel_settings` | só a linha `site`, modo `ai`, **versão 34**; não existe linha `whatsapp` |
| Veículos | 5 publicados, 8 ativos |

Três leituras disso, que mudam decisões:

1. **O conteúdo do fato `visit` dessa única conversa é `"ACHO QUE SABADO DEPOIS DDO ALMOCO / 14 HRS"`** —
   a mesma frase que aparece como exemplo no comentário de `ficha.ts:25-26`. O comentário foi escrito
   a partir dela. A agenda alimentada só por `facts` mostraria **um cartão**, sem hora resolvível.
   Por isso **"marcar visita à mão" sai da Etapa 2 e entra no Bloco 1** (§7.8, §8.2).
2. **O número conectado é o número de teste da Meta.** Número de teste só troca mensagem com uma
   lista curta de destinatários verificados, então hoje nenhum cliente real alcança a Dayse. Na
   apresentação ela só responde a um telefone que esteja nessa lista. **Não é trabalho de código** —
   é pré-requisito operacional, registrado em §8.5.
3. **Zero mensagens de vendedor explica por que A-3 passou despercebido:** o caminho nunca rodou em
   produção.

---

## 6. Restrições

- **Next.js 16.4.2 / React 19.3 / Drizzle / Postgres (Neon) / NextAuth 5 beta.** Antes de escrever
  código, ler o guia pertinente em `node_modules/next/dist/docs/` — `AGENTS.md` do repositório
  determina isso, e esta versão tem mudanças de API em relação ao conhecimento de treino.
- **Autorização não vive no layout.** Toda operação administrativa passa por `requireAdmin()` no
  serviço. Funções novas seguem o mesmo padrão.
- **Concorrência otimista obrigatória.** Toda escrita em veículo exige a versão esperada e a
  incrementa. A fila de `useVehicleDraft.enqueue` é a única porta de escrita do editor.
- **Mobile-first.** O proprietário usa o painel pelo celular.
- **Fuso America/Fortaleza.** Já é o fuso usado em `atendimento/page.tsx:44-48`.
- **Horário da loja já existe em forma de máquina:** `STORE_POLICY.horarioEstruturado` em
  `store-policy.ts:57-63` — segunda a sábado, 9h às 18h, domingo fechado. `store-policy.ts:65`
  registra: "Confirmado em 30/10/2026: ver veículo é sempre com hora marcada."
- **Retenção existente:** `RETENTION_NO_LEAD_DAYS = 30` e `RETENTION_LEAD_DAYS = 180`
  (`conversation-repository.ts:15-16`). O expurgo apaga mensagens e handoffs em cascata.
- **`conversations.facts` guarda no máximo 7 fatos** (`conversation-repository.ts:133`,
  `.slice(-7)`), um por campo. **Um agendamento guardado só em `facts` pode ser perdido** numa
  conversa longa. É a razão pela qual a agenda não pode viver em `facts`.
- **Limite de corpo de server action: 4 MB** (`next.config.ts`); o cliente reduz foto antes de
  enviar, com teto de 3,5 MB (`PhotoUpload.tsx:14`).
- **Migrações são aditivas e não destrutivas**, geradas por `drizzle-kit generate`. A última é
  `0009_aspiring_human_robot.sql`.
- **A suíte atual (482 testes) deve continuar verde.** É a rede de segurança desta entrega.

---

## 7. Decisões tomadas

Todas as decisões abaixo foram tomadas pelo proprietário na conversa de desenho, salvo as marcadas
**[minha decisão]**, que são do autor deste documento.

### 7.1 Navegação: barra fixa de quatro destinos

O painel ganha uma **barra de navegação fixa no rodapé**, presente em todas as telas autenticadas,
com quatro destinos e contador de pendências:

| Destino | Rota | Contador |
|---|---|---|
| Estoque | `/admin` | — |
| Agenda | `/admin/agenda` | visitas de hoje ainda não passadas |
| Divulgar | `/admin/divulgar` | — |
| Conversas | `/admin/atendimento` | conversas aguardando vendedor |

- O **Estoque continua sendo a tela inicial** (`/admin`), com a lista de veículos como hoje.
- A **configuração da Meta** (`WhatsAppOnboardingCard`, `MetaTestNumberForm`) **sai** de
  `/admin/atendimento` e vai para uma tela de ajustes própria, fora da barra, alcançável de
  Conversas.
- **`SiteModeForm` é removido**, não movido. A primeira versão deste documento dizia que ele
  permanecia em Conversas por ser "operação, não instalação"; **isso estava errado** — A-4 mostra
  que ele não controla nada. Em seu lugar entra um controle de verdade para o canal `whatsapp`, em
  Ajustes. Ver §7.11.
- **Divulgar** nesta entrega é uma tela de escolha que leva ao estúdio atual por veículo. O caminho
  modelo-primeiro é Etapa 2.
- **[minha decisão]** A barra é um componente servidor dentro de `(protected)/layout.tsx`, para
  aparecer em toda tela protegida sem repetição. Os contadores são consultas de contagem; se
  falharem, a barra renderiza sem número em vez de derrubar a tela — o mesmo padrão de tolerância já
  usado em `(protected)/page.tsx:22-37`.

### 7.2 Retorno das ações: a mensagem nasce onde o toque aconteceu

Os quatro caminhos de §5.1 passam a exibir o resultado **junto ao botão tocado**, não na seção 1.

- **[minha decisão]** `saveBeforeAction` passa a devolver o motivo da falha, e não só um booleano,
  para quem chamou poder exibi-lo localmente. A forma exata fica com o construtor; o requisito é que
  nenhum dos quatro caminhos termine sem retorno visível no local do toque.
- Em `DangerActions`, o estado de confirmação **deve** ser limpo ou a mensagem exibida dentro da
  caixa aberta. Nunca ficar aberta e muda.
- O `SaveIndicator` continua onde está, para a gravação automática contínua.

### 7.3 Hierarquia: uma ação primária por seção

Cada seção da tela de veículo passa a ter **uma única** ação primária. "Criar arte" deixa de ser
`buttonSecondary`. "Arquivar" e "Excluir veículo" ganham tratamento visual distinto do resto.

- **[minha decisão]** O token de borda usado por `buttonSecondary`, `.input`, `.chip` e
  `.vehicleCard` sobe para ≥ 3:1 de contraste. Hoje é `--admin-line: #4d535d`, que dá **2,51:1**
  sobre o fundo e **2,21:1** sobre a superfície, reprovando a WCAG 2.2 SC 1.4.11 em quase toda
  borda do painel. É uma linha de CSS e entra junto.

### 7.4 Título da arte: medir, não contar

- O corpo da fonte do título passa a ser escolhido **medindo o texto** com a fonte real, não
  contando caracteres. `ArtCanvas.tsx:76-77` sai.
- A caixa do título recebe **`ellipsis`**, para que o caso extremo apareça cortado com "…" em vez
  de desaparecer.
- **[minha decisão]** O canvas passa a pedir a família de fallback que o Next gerou com compensação
  métrica — `"Archivo", "Archivo Fallback"` — em vez de `"Archivo, Arial"`. O Next emitiu
  `Archivo Fallback` com `size-adjust: 98.7%` e `ascent/descent-override` justamente para reduzir a
  divergência durante o `swap`, e o canvas hoje a ignora (8 ocorrências em `ArtCanvas.tsx`).
- **[minha decisão]** Depois de `document.fonts.ready`, o palco é redesenhado **antes** de medir e
  exportar, para que prévia e arquivo usem a mesma métrica. Hoje o Konva mede uma vez, na montagem,
  e não redesenha quando a fonte chega.
- **Não** alterar a área segura dos formatos verticais. Os ~686px vazios abaixo de y=1244 são
  decisão documentada em `docs/liberato-inteligente/04-PLANO-ESTUDIO-ARTES.md:13`, com referência ao
  TikTok Ads Manager e ao guia da Meta. Fora do escopo desta entrega.

### 7.5 Compartilhamento nativo da arte

- O estúdio ganha **"Enviar para…"** usando `navigator.share({ files })`, que abre a folha do
  sistema com WhatsApp, Instagram, Facebook e o que estiver instalado.
- O botão de baixar **permanece**, para computador. A Web Share API com arquivos não é confiável em
  navegador de desktop.
- **[minha decisão]** A escolha PNG/JPEG deixa de ser dois botões. O sistema escolhe o formato e
  oferece uma ação de envio e uma de download. PNG/JPEG é decisão técnica que não pertence ao dono
  de revenda. **Deixado ao construtor:** qual formato padrão, com a ressalva de que a folha de
  compartilhamento precisa de um `File` com `type` coerente e `navigator.canShare({ files })`
  verdadeiro.
- O `Blob` já existe em `ArtEditor.tsx:49`. Não exige persistir a arte.
- **A ordem das operações precisa mudar para o iPhone funcionar.** Hoje `download()` faz
  `await fetch('/art-check')` **antes** de gerar o blob (`ArtEditor.tsx:44-49`). No Safari do iOS,
  `navigator.share` exige ativação do usuário na mesma tarefa, e o `await` de rede a consome: o
  compartilhamento é recusado. O proprietário não soube dizer qual aparelho usará na apresentação,
  então a reordenação é obrigatória: gerar o blob dentro do mesmo toque e conferir a versão sem
  perder a ativação. A trava de versão **não** pode ser abandonada — ela existe para a arte não sair
  com preço velho.

### 7.6 Dados do cliente passam a ser guardados

**Decisão do proprietário: sim, guardar nome e telefone**, com a retenção que já existe (30 dias sem
interesse registrado, 180 com). A justificativa aceita é que o cliente enviou esses dados à loja por
vontade própria, ao escrever no WhatsApp dela.

- `customerName` para de ser descartado e passa a ser persistido na conversa.
- O número do cliente passa a ser persistido **além** do `tokenHash`. O `tokenHash` permanece: é ele
  que dá continuidade à conversa do mesmo número e é a chave única.
- **[minha decisão]** O nome é atualizado a cada mensagem recebida (a pessoa pode trocar o nome de
  perfil); o número, sendo a identidade, é gravado na criação da conversa.
- **A conversa passa a registrar por qual tenant ela entrou.** Sem isso o painel não consegue
  resolver `phoneNumberId` nem o token para responder (A-3). Guardar o `tenantId` é o suficiente: o
  número do negócio e o token saem de `whatsapp_tenants`, que já os tem. Assumir "o único tenant
  ativo" foi considerado e **recusado**: hoje é verdade por acidente, e o módulo de WhatsApp é
  multi-tenant por desenho (`findActiveTenantByPhoneNumberId`).
- **Deixado ao construtor:** se os campos novos ficam em `conversations` ou numa tabela de contato
  própria. Recomendação: colunas em `conversations`, porque a retenção e o expurgo em cascata já
  estão resolvidos ali e uma tabela nova exigiria repetir essa lógica.

### 7.7 Agenda: dado estruturado, não texto livre

Hoje a Dayse grava a visita como **texto livre curto** via `registrar_lead` campo `visit`
(`tools.ts:219`), por exemplo `"sábado 14h"`. O prompt pede isso explicitamente
(`prompt.ts:88`: *"Em visita grave o dia e a hora combinados, como 'sábado 14h'"*). Texto livre não
ordena por cronologia, não sabe se já passou e não vai para calendário.

- A Dayse passa a registrar o agendamento com **data e hora resolvidas** (timestamp), **além** da
  frase do cliente, que continua sendo guardada e exibida.
- A resolução é validada contra `STORE_POLICY.horarioEstruturado` (seg–sáb, 9h–18h) no fuso
  America/Fortaleza. Pedido fora do horário ou no domingo não vira agendamento silenciosamente.
- **Quando a hora não dá para resolver** — "sábado de manhã" — o agendamento é gravado **sem hora**,
  com a frase original, e aparece na agenda no grupo "Combinado, sem hora certa", pedindo
  confirmação. Este caso é esperado e frequente, não exceção.
- **Quando o cliente pede fora do horário** — domingo, ou 20h — **a Dayse contrapropõe um horário
  válido.** Ela diz que a loja atende de segunda a sábado, das 9h às 18h, e oferece uma alternativa
  próxima. Marcar é o melhor resultado dela (`prompt.ts:23`), então desistir seria contra o papel.
  Isso é mudança de comportamento e tem de ser provada em `evals/`, não só em teste de unidade: a
  Dayse não pode inventar que a loja abre num horário que não abre, nem afirmar que marcou quando
  não marcou.
- O agendamento **não vive em `facts`**: `facts` é limitado a 7 itens e seria perdido numa conversa
  longa (§6). Vive em estrutura própria, ligada à conversa.
- O agendamento guarda também o **veículo de interesse**, quando houver. A Dayse já consulta o
  estoque por id para responder (`tools.ts` / `buscar_veiculos`), então o vínculo é obtível.
- **Deixado ao construtor:** se a extração é uma ferramenta nova (`marcar_visita`) ou uma evolução
  de `registrar_lead`. Requisito: o modelo não inventa data; quando a pessoa não deu dia e hora, o
  agendamento fica sem hora em vez de receber um palpite. Os guardas em `guards.ts` e o corpus de
  avaliação em `evals/` são o lugar de provar isso.

### 7.8 Página da agenda

Rota `/admin/agenda`. Formato escolhido pelo proprietário: **agrupada por dia, cartão completo**.

**Grupos, nesta ordem:** `Hoje` · `Amanhã` · `Esta semana` · `Depois` · `Combinado, sem hora certa`.

**[minha decisão]** `Esta semana` termina no **sábado**, não em sete dias corridos: a semana da loja
fecha no sábado e a pessoa pensa em semana de calendário. `Depois` existe para a visita marcada além
disso — sem ele, um compromisso de dez dias à frente desapareceria da tela, o que é pior que o
problema original.

**Cada cartão de visita mostra:**

- a **hora**, em destaque tipográfico;
- o **nome** do cliente e o **telefone**;
- o **veículo** de interesse, com ano e preço, quando houver vínculo;
- a **frase do cliente** sobre a visita, como ela escreveu;
- o que a Dayse apurou de orçamento e troca, quando houver (vem de `facts`, via `organizarFicha`);
- duas ações: **WhatsApp** (abre conversa com o número) e **Ver conversa** (vai para a conversa no
  painel).

**Marcar à mão.** A agenda tem "+ marcar visita que chegou por telefone", para o cliente que liga
direto na loja. O agendamento manual não tem conversa associada; nome e telefone são digitados, e o
veículo é escolhido do estoque. A regra de horário é **a mesma** da Dayse (§7.7) — uma só
implementação, não duas.

**Este item sobe para o Bloco 1.** A primeira versão deste documento o deixava por último, na
suposição de que a agenda teria conteúdo vindo da Dayse. O retrato da produção (§5.3) desfez a
suposição: existe **uma** visita anotada, com hora não resolvível. Sem marcar à mão, a agenda na
demonstração é um cartão só — e uma tela de um cartão com hora indefinida não demonstra nada.
Marcar à mão é também melhor de apresentar: o proprietário cria uma visita na frente do Elton, sem
depender de simular conversa com a Dayse por um número de teste.

**Corrigir e cancelar.** **[minha decisão]** O proprietário pode editar e cancelar um agendamento
pelo painel. Sem isso, um horário anotado errado pela Dayse — e ela vai errar — fica para sempre na
tela sem remédio. Cancelar remove a linha; não há estado "cancelado", porque situação de agendamento
é não-objetivo (§3).

- **[minha decisão]** Visitas cujo horário já passou saem dos grupos futuros. Não há estado
  "compareceu" nesta entrega (é não-objetivo), então o passado simplesmente deixa de ser mostrado
  como pendência. **Deixado ao construtor:** se o dia corrente mostra as visitas já passadas em
  tratamento apagado ou as oculta. Preferência: mostrar apagadas até o fim do dia, porque às 15h
  ainda interessa saber quem veio às 14h.
- **[minha decisão]** A agenda precisa funcionar **antes** de a Dayse extrair data estruturada: até
  lá, e para conversas antigas, ela exibe o que existir em `facts` campo `visit` como visita sem
  hora. Isso garante tela com conteúdo na demonstração mesmo que a extração atrase. Ver §8.4.

### 7.9 Entrega da resposta do vendedor no WhatsApp

Quando o vendedor responde pelo painel uma conversa de canal `whatsapp`, a mensagem passa a ser
**enviada** pela Cloud API, além de gravada.

- **De onde saem as credenciais.** `sendWhatsAppTextMessage` exige `phoneNumberId`, `accessToken` e
  `to`. O `to` vem de `customerPhone` (§7.6); os outros dois saem de `whatsapp_tenants`, localizado
  pelo `tenantId` que a conversa passa a guardar (§7.6). Nada disso é derivável do `tokenHash`, que é
  hash de mão única.
- **Conversa criada antes desta mudança não tem telefone nem tenant.** Nessas, a caixa de resposta
  **não aparece**; em seu lugar, uma frase explicando que aquela conversa é anterior ao registro de
  contato e que a resposta precisa sair pelo celular da loja. Nunca uma caixa que aceita texto e o
  descarta.
- **A janela de 24 horas da Meta.** Texto livre só é aceito dentro de 24h da última mensagem **do
  cliente**; fora disso a Meta recusa, e template aprovado é não-objetivo (§3). **Decisão do
  proprietário:** passadas as 24h, a caixa de resposta explica que a janela fechou e oferece um link
  `wa.me` para o vendedor responder pelo celular da loja. Não se tenta um envio que já se sabe
  recusado, e o vendedor nunca fica sem caminho. A janela é calculada a partir da última mensagem com
  `sender = 'visitor'`.
- A gravação no banco e o envio não podem divergir: o painel não deve dizer "Resposta enviada."
  quando o envio falhou. Há precedente no projeto para a falha de envio — `send-failure.test.ts` e o
  registro `envio_falhou` em `run.ts` — e o mesmo tratamento se aplica.
- **Deixado ao construtor:** a ordem exata entre gravar e enviar, e o que acontece com a mensagem
  gravada quando a Meta recusa. Requisito: nenhum sucesso falso.

### 7.10 Roteiro de apresentação

Entregável de documentação, não de código: `docs/ROTEIRO_APRESENTACAO.md`, com a ordem de telas e o
que dizer em cada uma, pensado para ser seguido no celular sem o apresentador ter de decidir nada
durante a demonstração. Deve cobrir o que fazer quando algo falha ao vivo.

---

### 7.11 Exclusão do chat do site

**Decisão do proprietário:** o chat do site sai. A razão que ele deu é despesa — "a criação desse
chat foi mais para teste". O retrato da produção (§5.3) e o A-4 confirmam: não há chat, não há
consumidor do ajuste, e o desligamento não seguraria.

**Sai da base de código:**

| Alvo | Observação |
|---|---|
| `src/components/attendance/site-chat.module.css` | 10 KB que nenhum arquivo importa |
| `atendimento/SiteModeForm.tsx` e a action `changeSiteMode` | o no-op de versão 34 |
| `settings.ts`: `defaultSiteMode`, `readSiteSetting`, `readAdminSiteSetting`, `listAdminSiteModeChanges`, `setSiteMode` | `readWhatsappSetting` e `attendanceModeSchema` **ficam** |
| `limits.ts:43, 72, 76` | as três cotas de IA do canal `site` |
| `conversation-repository.ts:36` | onde nasce a conversa de canal `site`; é a origem das 12 vazias |
| `ensure-schema.ts:130-134` | o UPDATE que reacende o modo do site |

**Não sai:** o enum `channel` continua `['site', 'whatsapp']`. Estreitá-lo tocaria 4 tabelas e 4
check constraints numa migração destrutiva, por ganho nenhum. Basta parar de criar linhas `site`.
A linha `site` de `channel_settings` e as 34 entradas de `channel_settings_audit` **ficam** no banco,
por decisão do proprietário.

**Sai do banco:** as **12 conversas de canal `site`**, todas com 0 mensagens e 0 turnos, autorizadas
item por item pelo proprietário. A conversa real do WhatsApp não é tocada. A exclusão acontece junto
com a remoção do código, não antes.

**Entra em seu lugar:** um controle real do canal `whatsapp` em Ajustes, que a Dayse efetivamente lê
por `readWhatsappSetting()`. Hoje **não existe linha `whatsapp` em `channel_settings`** (§5.3): a
Dayse roda no padrão do código, sem freio nenhum. O controle serve para pausá-la — numa viagem, numa
fatura alta, ou se ela começar a responder errado. Os três modos de `attendanceModeSchema`
(`disabled`, `deterministic`, `ai`) continuam válidos; os rótulos devem ser escritos em português
simples, sem emoji e sem Title Case, alinhados à voz das telas de veículo (§3 do relatório de
auditoria, P2-6).

**Independente disto:** a aba Conversas passa a esconder conversa sem nenhuma mensagem. A exclusão
das 12 resolve o caso de hoje; o filtro impede que o próximo apareça.

---

## 8. Sequência e o portão da demonstração

### 8.1 Por que esta ordem

O proprietário quer reapresentar **nesta semana**. O trabalho somado é maior que uma semana (§10).
A ordem abaixo existe para que exista um **ponto de parada apresentável no meio do caminho**.

### 8.2 Bloco 1 — a demonstração deixa de falhar e a agenda existe de verdade

1. Retorno das quatro ações (§7.2)
2. Título da arte: medir e `ellipsis` (§7.4)
3. Hierarquia e contraste da borda (§7.3)
4. Exclusão do chat do site e controle real do WhatsApp em Ajustes (§7.11)
5. Barra de navegação; configuração da Meta para Ajustes; conversa sem mensagem escondida (§7.1, §7.11)
6. Estrutura do agendamento no banco (§7.7) — pré-requisito de 7
7. Página da agenda com marcar, editar e cancelar à mão (§7.8) — depende de 6
8. "Enviar para…" nativo, com a reordenação que o iOS exige (§7.5)
9. Roteiro de apresentação (§7.10)

### 8.3 Bloco 2 — a agenda se alimenta sozinha

10. Nome, telefone e tenant persistidos (§7.6)
11. Entrega da resposta do vendedor e janela de 24h (§7.9) — depende de 10
12. Dayse resolve dia e hora, e contrapropõe fora do horário (§7.7) — depende de 6 e 10
13. Agenda agrupada por dia, com o cartão completo (§7.8) — depende de 10 e 12

### 8.4 O portão

**Ao fim do Bloco 1 o sistema está apresentável e a aba Agenda tem conteúdo que o proprietário
mesmo cria.**

A primeira versão deste documento previa um portão em que a agenda exibiria o que a Dayse já tinha
anotado em `facts`. **O retrato da produção (§5.3) invalidou isso:** existe uma anotação, com hora
não resolvível. Uma tela de um cartão não é demonstração, e uma aba vazia é anti-objetivo (§4).

A correção é marcar à mão entrar no Bloco 1 (item 7). Com ela, a agenda nasce verdadeira e o
proprietário pode criar uma visita na frente do Elton. O que o Bloco 2 acrescenta não é a tela: é a
tela **se alimentando sozinha**, que é o argumento comercial.

### 8.5 Pré-requisito operacional, fora do código

**O número de WhatsApp conectado é o número de teste da Meta** (`liberato-motos-car-teste`,
`+1 555-195-6955` — §5.3). Número de teste só troca mensagem com uma lista curta de destinatários
verificados. Consequências para a apresentação:

- A Dayse **não responde** a um telefone fora dessa lista. Se a demonstração do atendimento for ao
  vivo, o telefone usado precisa estar autorizado no painel da Meta antes.
- Nenhum cliente real alcança a Dayse hoje. Enquanto for número de teste, a agenda só se alimenta
  à mão — o que reforça o item 7 do Bloco 1.

Isto não é trabalho de implementação. É condição que o proprietário precisa resolver no painel da
Meta, ou aceitar e demonstrar o atendimento com o próprio telefone.

---

## 9. O que explicitamente fica para a Etapa 2

Registrado aqui para não se perder, com as barreiras já levantadas:

**Modelo-primeiro e artes comemorativas.** Três barreiras arquiteturais, todas confirmadas no
código:

1. `getArtVehicleData` (`vehicle-art-data.ts:8-21`) exige um `vehicleId`; a rota é filha do veículo.
2. `artExportProblem` (`policy.ts:6-8`) recusa peça cujo veículo não esteja publicado e sem marca,
   modelo, ano e preço. Uma arte de Dia das Mães falha em todas as condições.
3. A geometria vive em 43 condicionais em `ArtCanvas.tsx:47-78`; `templates.ts` só tem rótulos
   (`id`, `label`, `heading`, `accent`), **sem esquema de layout**. Acrescentar um modelo exige
   editar todas as condicionais.

A Etapa 2 deve começar por (3): transformar `templates.ts` em esquema de layout declarativo e
reduzir `ArtCanvas` a intérprete. Só então acrescentar modelos comemorativos e a porta
modelo-primeiro em `/admin/divulgar`, onde escolher um veículo do estoque **preenche os dados
sozinho** — a vantagem que o Vapo não tem, já que lá o preço é digitado à mão.

Também fica para depois: "bater a foto" dentro do fluxo da arte, busca e paginação no estoque,
unificação das três seções de situação, miniatura reduzida para o estúdio (hoje são 6 downloads de
foto em tamanho cheio com `no-store`, e a selecionada baixa duas vezes), e os demais itens P2/P3 da
auditoria.

---

## 10. Tamanho real

| Bloco 1 | Trabalho |
|---|---|
| Retorno das quatro ações, título da arte, hierarquia e contraste | 1,5 dia |
| Exclusão do chat do site e controle real do WhatsApp | 0,5 dia |
| Barra de navegação, Ajustes, conversa vazia escondida | 1 dia |
| Agendamento no banco | 1 dia |
| Página da agenda com marcar, editar e cancelar à mão | 1,5 dia |
| Compartilhamento nativo com a reordenação do iOS | 0,75 dia |
| Roteiro de apresentação | 0,5 dia |
| **Portão da demonstração (§8.4)** | **≈ 6,75 dias** |

| Bloco 2 | Trabalho |
|---|---|
| Nome, telefone e tenant persistidos | 1,5 dia |
| Entrega da resposta do vendedor e janela de 24h | 1,5 dia |
| Dayse resolve dia e hora, e contrapropõe | 1,5 dia |
| Agenda agrupada por dia com cartão completo | 1 dia |
| **Total** | **≈ 12,25 dias úteis** |

**O portão cresceu de 3,5 para ≈6,75 dias**, e o total de 9 para ≈12,25. As causas, nomeadas:
marcar à mão subiu para o Bloco 1 porque a produção não tem dado (§8.4); a exclusão do chat do site
e o controle do WhatsApp são escopo novo pedido pelo proprietário (§7.11); a janela de 24h e a
reordenação do iOS são trabalho que a primeira versão não tinha visto.

Uma semana não cobre o portão. O corte possível, se a data for inegociável, é retirar os itens 6 e 7
do Bloco 1 — o que devolve o portão a ≈4,25 dias e deixa a apresentação **sem a aba Agenda**, com
três destinos na barra em vez de quatro. É pior comercialmente e melhor que uma aba vazia. A escolha
é do proprietário.

---

## 11. O que fica com o construtor

Além dos pontos marcados **Deixado ao construtor** em §7:

- A forma dos componentes e dos arquivos, respeitando os padrões do repositório: CSS Modules com
  tokens do painel (sem duplicar como `attendance.module.css` fez), confirmação em linha em vez de
  modal, `requireAdmin()` em toda operação, `revalidatePath` tolerante a falha.
- A estratégia de teste. O projeto tem 482 testes e um guarda contra classes de CSS Modules
  inexistentes (`src/app/admin/css-classes.test.ts`); o `evals/` existe para o comportamento do
  agente. Mudança de prompt e de ferramenta da Dayse deve ser provada ali, não só por teste de
  unidade.
- A migração Drizzle, aditiva, gerada por `drizzle-kit generate` e aplicada com ordem explícita do
  proprietário — é o procedimento que `docs/PENDENCIAS_PAINEL.md` registra para a migração anterior.
- Se a barra de navegação usa ícones desenhados (`lucide-react` já é dependência) ou texto. Os
  esboços usaram emoji apenas como marcador de esboço.

## 12. Leitura obrigatória antes de começar

- `docs/auditorias/AUDITORIA-UX-ADMIN-LIBERATO.md` — §10 lista os riscos de reformulação e §11 o que
  preservar.
- Os comentários de `useVehicleDraft.ts:8-20` e `validation.ts:45-47`.
- `docs/PENDENCIAS_PAINEL.md` — decisões por entrega.
- `node_modules/next/dist/docs/` — conforme `AGENTS.md`.
- Três decisões deliberadas que **não** devem ser desfeitas por engano: a área segura dos formatos
  verticais (`04-PLANO-ESTUDIO-ARTES.md:13`), o `Combobox` não ser `<datalist>`
  (`Combobox.tsx:18-26`) e a ausência de `capture` no input de galeria (`PhotoUpload.tsx:65-66`).
