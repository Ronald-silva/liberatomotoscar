# Auditoria técnica, UX/UI e usabilidade — painel administrativo

**Projeto:** Liberato Motos Car
**Data:** 2 de novembro de 2026
**Commit auditado:** `b108509` (branch `main`, árvore limpa)
**Natureza:** investigativa. Nenhum arquivo de código, dependência, migração, variável de ambiente
ou configuração foi alterado. A única escrita no repositório é este relatório.

> **Método.** Toda afirmação abaixo foi conferida no código-fonte, não na documentação. Onde a
> documentação do projeto afirmava algo que o código contradiz — ou onde o código tem uma decisão
> deliberada que pareceria defeito à primeira vista —, isso está dito explicitamente. As medidas de
> tipografia foram obtidas reproduzindo o algoritmo real de quebra de linha do Konva instalado
> (`node_modules/konva/lib/shapes/Text.js`) sobre as fontes reais do projeto. Os contrastes foram
> calculados pela fórmula da WCAG. A suíte de testes foi executada: **482 testes passam, 32 pulados,
> 52 arquivos passam, 3 pulados** (os 3 pulados são de integração e exigem banco real).

---

## 1. Resumo executivo

O painel não é um protótipo malfeito. É um painel **bem construído por dentro e difícil por fora**.
A camada de servidor tem concorrência otimista real, auditoria append-only, política de publicação
em fonte única e 482 testes verdes. O problema que o proprietário sentiu na demonstração não vem de
falta de engenharia: vem de três coisas específicas.

**Primeira: o painel não conta ao dono o que aconteceu.** As quatro ações que mais importam —
publicar, mudar situação, arquivar/excluir e criar arte — todas abortam em silêncio quando a
gravação automática falha. O dono toca em "Sim, publicar anúncio", a caixa de confirmação fecha, e
nada é publicado nem explicado. A explicação existe, mas é desenhada em outra seção da página,
acima, frequentemente fora da tela do celular. Quatro ocorrências do mesmo defeito
(`VehicleEditor.tsx:63` e `:81`, `StatusActions.tsx:26`, `DangerActions.tsx:23`). Isto é o que
produz a sensação de "não sei se funcionou" — e é o achado mais grave desta auditoria.

**Segunda: o gerador de artes descarta texto sem avisar.** O título do veículo é desenhado numa
caixa de altura fixa sem reticências. O Konva, ao encontrar altura fixa, **para de adicionar
linhas e descarta o resto do texto**, sem nenhum indicador. Medido com as fontes reais: um título
de 75 caracteres perde até **39 caracteres** na arte final, e o dono não tem como saber. Não é
hipótese: é o comportamento documentado do `Text.js:624`, reproduzido com as três fontes possíveis.

**Terceira: o painel pede decisões demais, todas com o mesmo peso visual.** A tela de edição de um
veículo publicado com seis fotos apresenta cerca de **51 controles interativos** (13 chips de marca,
13 de cor, 48 opções de ano, 2 por foto). E a hierarquia é plana: há **27 usos de
`buttonSecondary` contra 6 de botão primário** no painel inteiro. "Criar arte" — a ação que o dono
mais quer — tem exatamente a mesma aparência de "Excluir veículo".

Sobre o Vapo: a comparação não é de estética, é de **ciclo de retorno**. No estúdio de artes em
celular, a prévia fica fora da tela enquanto se mexe nos controles; existem dois botões-âncora
("Ver prévia da arte" / "Alterar opções") que são o próprio reconhecimento do problema. Cada ajuste
de enquadramento custa um rolar para baixo, um olhar e um rolar para cima. E o fim do fluxo não é
compartilhar: é **baixar um arquivo** e sair do produto para procurá-lo na pasta de downloads.
Não existe compartilhamento nativo em nenhum ponto do código (`navigator.share` não aparece em
`src/`). É aí que o Vapo ganha, não no desenho das peças.

Há também um bloqueio de produto que vale nomear: **não se cria arte de veículo não publicado**
(`src/server/art-studio/policy.ts:6`). O dono que quer preparar a divulgação antes de colocar o
anúncio no ar não consegue baixar nada. É uma decisão de integridade comercial, não um bug, mas
inverte a ordem natural do trabalho dele.

Recomendação de sequência, sem implementar nada agora: **(1)** consertar o retorno silencioso das
quatro ações; **(2)** consertar a perda de texto na arte e trocar o dimensionamento por contagem de
caracteres por medição real; **(3)** reorganizar o estúdio em celular para prévia e controle na
mesma tela; **(4)** adicionar compartilhamento nativo via Web Share API; **(5)** só então discutir
redesenho visual. Os itens 1 e 2 são correções pontuais de alto impacto e baixo risco. O item 5 é o
mais caro e o menos urgente.

---

## 2. Inventário das funcionalidades existentes

### 2.1 Rotas administrativas (5 páginas, 3 rotas de API)

| Rota | Arquivo | Natureza |
|---|---|---|
| `/admin/login` | `src/app/admin/login/page.tsx` | Entrada por Google (NextAuth) |
| `/admin` | `src/app/admin/(protected)/page.tsx` | Estoque: lista + filtros por situação |
| `/admin/veiculos/novo` | `.../veiculos/novo/page.tsx` | Escolha moto/carro, cria rascunho |
| `/admin/veiculos/[id]` | `.../veiculos/[id]/page.tsx` | Editor do veículo (tela central) |
| `/admin/veiculos/[id]/arte` | `.../veiculos/[id]/arte/page.tsx` | Estúdio de artes |
| `/admin/atendimento` | `.../atendimento/page.tsx` | Caixa de entrada + configuração WhatsApp |
| `/api/admin/health` | `src/app/api/admin/health/route.ts` | Diagnóstico |
| `/api/admin/vehicles/[id]/art-check` | `.../art-check/route.ts` | Trava de versão antes de exportar |
| `/api/admin/vehicles/[id]/art-photo/[photoId]` | `.../art-photo/[photoId]/route.ts` | Proxy autenticado da foto |

A autorização **não** está no layout: `(protected)/layout.tsx` redireciona, mas cada operação passa
por `requireAdmin()` no serviço. Confirmado em `service.ts` e `vehicle-art-data.ts:9`. É o padrão
correto no Next 16 e está documentado em `docs/PENDENCIAS_PAINEL.md`.

### 2.2 Navegação

**Não existe menu, barra lateral ou navegação persistente.** A navegação é por links contextuais:

- `/admin` → `/admin/atendimento` (um link, estilo secundário, `page.tsx:44`)
- `/admin` → `/admin/veiculos/novo` (botão primário, fixo no pé)
- `/admin` → `/admin/veiculos/[id]` (cartão do veículo)
- `/admin/veiculos/[id]` → `/admin/veiculos/[id]/arte` (botão secundário dentro da seção "Fotos")
- Volta sempre por um botão "Voltar ao…" no topo de cada tela

Consequência estrutural: **o estúdio de artes só é alcançável de dentro do editor de um veículo**,
e o botão que leva até ele está na segunda das três a cinco seções da tela, exigindo rolagem.

### 2.3 Componentes reutilizáveis (confirmados no código)

| Componente | Arquivo | Uso |
|---|---|---|
| `ChipPicker` | `veiculos/ChipPicker.tsx` | Marca e Cor (escolha por toque + escape para digitar) |
| `Combobox` | `veiculos/Combobox.tsx` | Modelo (sugestões próprias, não `<datalist>`, por decisão documentada) |
| `PhotoGallery` / `PhotoActions` | `veiculos/PhotoGallery.tsx` | Galeria, capa, remoção |
| `PhotoUpload` | `veiculos/PhotoUpload.tsx` | Câmera e galeria separadas, fila de envio, redução no navegador |
| `SubmitButton` | `veiculos/SubmitButton.tsx` | Pendência por botão, não por formulário |
| `FormNotice` | `veiculos/FormNotice.tsx` | Mensagem; só a de versão obsoleta ganha link de recarga |
| `SaveIndicator` | `veiculos/[id]/SaveIndicator.tsx` | "Salvando… / ✓ salvo / erro + tentar de novo" |
| `StatusFilter` | `(protected)/StatusFilter.tsx` | 7 filtros com contagem |
| `useVehicleDraft` | `veiculos/[id]/useVehicleDraft.ts` | **Peça mais sofisticada do painel** (ver §11) |
| `ArtCanvas` / `ArtEditor` | `components/art-studio/` | Composição e controles da arte |

### 2.4 Modais e formulários

**Não existe nenhum modal/diálogo no painel.** Toda confirmação é feita por revelação em linha:
o botão é substituído por um aviso `role="alert"` mais "Sim, …" e "Cancelar". Padrão consistente
em `VehicleEditor` (publicar), `StatusActions` (vender/republicar), `DangerActions`
(arquivar/excluir) e `PhotoActions` (remover foto). **É uma boa decisão e deve ser preservada.**

A exceção é o atendimento: lá não há confirmação nenhuma (§4, P1-8).

### 2.5 Funcionalidades incompletas ou ausentes (verificadas, não presumidas)

| O que | Situação real | Evidência |
|---|---|---|
| Compartilhamento nativo | **Não existe** | `grep navigator.share src/` → nada |
| Persistência de artes | **Não existe** | Não há tabela de artes em `schema.ts` (20 tabelas conferidas) |
| Artes comemorativas | **Não existe** | Arquitetura é presa ao veículo (§5.6) |
| Busca no estoque | **Não existe** | Nenhum `type="search"` em `src/app/admin` |
| Paginação do estoque | **Não existe** | `service.ts:94-96` e `:101-113` sem `limit` |
| Atualização automática do atendimento | **Não existe** | Sem polling/stream; exige recarga manual |
| Vitrine pública lê o banco | **Existe, sim** | `src/app/page.tsx:17` usa `listPublicVehiclesWithCover`. **`docs/PENDENCIAS_PAINEL.md` está desatualizado neste ponto** |
| `.editorWithFooter` / `.formSticky` | **CSS morto** | Definidos em `admin.module.css:246-247`, nunca aplicados |

---

## 3. Diagnóstico de UX/UI

### 3.1 Lei de Hick-Hyman — excesso de decisões

Contagem de controles interativos simultâneos por tela (conferida componente por componente):

| Tela | Controles | Composição |
|---|---|---|
| `/admin/veiculos/novo` | **3** | Voltar, Moto, Carro — **excelente** |
| `/admin` (estoque) | **10 + N cartões** | Sair, Atendimento, 7 filtros, Cadastrar |
| `/admin/veiculos/[id]` (rascunho, 3 fotos) | **≈44** | — |
| `/admin/veiculos/[id]` (publicado, 6 fotos) | **≈51** | — |
| `/admin/veiculos/[id]/arte` (6 fotos) | **≈22** | 4 formatos, 6 fotos, 2 controles, 4 modelos, 2 downloads, 2 âncoras |

O detalhe da tela de edição: **13 chips de marca** (12 marcas de carro + "Outra marca";
`catalogo-marcas-modelos.ts:55-80`), **13 chips de cor** (12 cores + "Outra cor"; `:112-115`),
**48 opções de ano** (`masks.ts:50-52`, `span = 45` → 47 anos + "Não informado"), **2 botões por
foto**, e os botões de publicação, situação e gerenciamento.

No estúdio, o espaço de combinação é **4 formatos × 4 modelos × N fotos** = 96 peças distintas para
seis fotos, antes de contar os dois controles de enquadramento com 101 posições cada.

**Gravidade: P1.** **Impacto:** é a causa direta de "excesso de botões" e "opções misturadas".

### 3.2 Hierarquia visual — o achado mais consequente de UI

O painel tem **27 usos de `buttonSecondary` contra 6 de botão primário**:

```
ArtEditor.tsx            4     DangerActions.tsx        4
PhotoGallery.tsx         4     page.tsx (estoque)       3
VehicleEditor.tsx        3     StatusActions.tsx        2
PhotoUpload.tsx          2     outros (1 cada)          5
```

Resultado prático: na tela de edição, **"Criar arte", "Remover" (foto), "Definir como capa",
"Arquivar", "Excluir veículo" e "Voltar ao estoque" são visualmente idênticos** — todos
`buttonSecondary`, borda `#4d535d`, fundo transparente, 52px de altura. A ação criativa que o dono
mais quer tem o mesmo peso da ação que apaga o veículo.

**Localização:** `VehicleEditor.tsx:105-106` ("Criar arte"), `DangerActions.tsx:53-54`
("Excluir veículo"). **Gravidade: P1.** **Impacto:** "dificuldade para identificar ações" — exato.

### 3.3 Nielsen #1, Visibilidade do estado — falha sistêmica silenciosa

As quatro ações principais chamam `draft.saveBeforeAction()` e, quando ela falha, **retornam sem
definir mensagem nenhuma**:

```
VehicleEditor.tsx:63   if (!await draft.saveBeforeAction()) { setPublishing(false); setConfirming(false); return; }
VehicleEditor.tsx:81   if (await draft.saveBeforeAction()) router.push(...)      // falha → nada acontece
StatusActions.tsx:26   if (!await draft.saveBeforeAction()) { setBusy(false); setConfirming(null); return; }
DangerActions.tsx:23   if (!await draft.saveBeforeAction()) { setBusy(false); return; }
```

A mensagem de erro **existe** — `saveBeforeAction` a escreve em `setMessage`
(`useVehicleDraft.ts:218, 224`) —, mas ela é renderizada pelo `SaveIndicator`, que está dentro de
`VehicleForms` (`VehicleForms.tsx:67`), isto é, no fim da **seção 1** da página. O botão
"Publicar anúncio" está na **seção 3**, e "Excluir veículo" ainda mais abaixo. Em celular, a
explicação nasce fora da tela.

Pior em `DangerActions`: como `setConfirming(null)` não é chamado no caminho de falha, a caixa
"Sim, excluir veículo / Cancelar" **continua aberta sem nenhuma explicação** de por que o toque não
surtiu efeito.

**Gravidade: P0.** **Impacto:** é a origem da desconfiança. O dono não aprende a relação entre o
toque e o resultado, e isso corrói todo o resto do painel.

### 3.4 Nielsen #5, Prevenção de erros — inconsistência entre os dois módulos

| Ação | Confirma? | Onde |
|---|---|---|
| Publicar anúncio | Sim, com pergunta de disponibilidade | `VehicleEditor.tsx:124-131` |
| Marcar vendido | Sim | `StatusActions.tsx:59-68` |
| Arquivar / Excluir veículo | Sim | `DangerActions.tsx:42-49` |
| Remover foto | Sim | `PhotoGallery.tsx:40-47` |
| **Excluir conversa** | **Não. Nenhuma.** | `InboxOperatorControls.tsx:42-44` |
| **Trocar o modo de atendimento do site** | **Não** (um toque no rádio aplica) | `SiteModeForm.tsx:140-150` |

"Excluir conversa" é um `<button type="submit">` destrutivo e irreversível, lado a lado com
"Encerrar conversa" e "Devolver para automação", sem confirmação em nenhuma camada
(`atendimento/actions.ts:113-117` também não exige).

Caso agravante no modo de atendimento: o servidor **tem** uma trava
(`atendimento/actions.ts:79-81`: `if (formData.get('confirm') !== 'yes')`), mas o cliente a
neutraliza enviando `confirm: 'yes'` fixo em dois lugares (`SiteModeForm.tsx:155` no campo oculto e
`:145` no `FormData`). A trava do servidor **nunca pode disparar**. Um toque acidental em
"⏸️ Desativado" desliga o atendimento automático do site, sem confirmação e sem desfazer.

**Gravidade: P1** (exclusão de conversa), **P2** (modo do site).

### 3.5 Nielsen #4, Consistência — dois sistemas de design no mesmo painel

`attendance.module.css:1-16` redefine **12 tokens** com os mesmos valores de
`admin.module.css:2-17`, só com outro prefixo:

```
--admin-bg: #0a0d12       ←→   --attendance-bg: #0a0d12
--admin-surface: #171c24  ←→   --attendance-surface: #171c24
--admin-line: #4d535d     ←→   --attendance-line: #4d535d
--admin-accent: #ba1d28   ←→   --attendance-accent: #ba1d28     (e mais 8)
```

E `.submit` / `.secondaryButton` do atendimento duplicam `.button` / `.buttonSecondary` do painel.
Hoje a aparência coincide; qualquer ajuste futuro em um só divergirá.

A voz também divergiu. Veículos fala em frases simples e minúsculas de frase:
"Cadastrar veículo", "Voltar ao estoque", "Siga de cima para baixo". Atendimento fala em emoji +
Title Case + jargão: "🤖 Agente IA Dayse (Consultora Completa)", "⚡ Chatbot Guiado (Menu Rápido)",
"Devolver para automação", "Modo de Atendimento Automático (1 clique para alternar)"
(`SiteModeForm.tsx:110-129, 157`).

**Gravidade: P2.**

### 3.6 Terminologia técnica inadequada e arquitetura invertida no atendimento

A tela `/admin/atendimento` coloca a **configuração de desenvolvedor da Meta acima do trabalho do
dia**. Ordem de renderização (`atendimento/page.tsx:118-135`):

1. `WhatsAppOnboardingCard` — Embedded Signup, Meta App ID, Config ID
2. `MetaTestNumberForm` — webhook URL, phone number ID, WABA ID, access token
3. `SiteModeForm` — modo de atendimento
4. **Só então** as conversas

O dono precisa rolar por três blocos de infraestrutura — com termos como *webhook*, *WABA*,
*phone number ID*, *Embedded Signup*, *token* — para chegar às conversas dos clientes. São itens de
instalação, usados uma vez, ocupando o topo de uma tela de uso diário.

**Gravidade: P1.** **Recomendação inicial:** mover para uma tela de configuração separada,
alcançável mas não no caminho do trabalho.

### 3.7 WCAG 2.2 — o que passa e o que reprova

Calculado pela fórmula de contraste relativo da WCAG sobre os tokens reais:

| Par | Razão | Mínimo | Resultado |
|---|---|---|---|
| Borda `--admin-line` sobre o fundo (`.buttonSecondary`, `.chip`, `.filterLink`, `.vehicleCard`) | **2,51:1** | 3:1 | **REPROVA — SC 1.4.11** |
| Borda `--admin-line` sobre a superfície (`.input`, `.galleryItem`, `.group`) | **2,21:1** | 3:1 | **REPROVA — SC 1.4.11** |
| Texto `--admin-muted` sobre o fundo | 11,95:1 | 4,5:1 | passa |
| Branco sobre `--admin-accent` (botão primário) | 6,37:1 | 4,5:1 | passa |
| `--admin-ink` sobre o fundo | 18,13:1 | 4,5:1 | passa |
| Etiquetas de situação (4 cores) sobre a superfície | 8,47 – 10,91:1 | 4,5:1 | passam |
| Foco (3px `--admin-ink`) | 18,13:1 | 3:1 | passa |
| Realce do selecionado (`--admin-accent` sobre o fundo) | 3,05:1 | 3:1 | passa (por 0,05) |

A reprovação atinge **o contorno de quase todo botão secundário, todo campo de entrada e todo chip**
do painel — isto é, a maior parte da interface. É a borda que define onde o botão começa e termina.

**O que está bem, e merece registro:** alvos de toque cumprem a SC 2.5.8 com folga —
`.button` 52px, `.chip` 44px, `.buttonCompact` 44px, `.comboButton` 44px, `.filterLink` 44px,
caixas de seleção 24px. Foco visível em tudo. `aria-pressed`, `aria-expanded`, `aria-controls`,
`role="combobox"` com `aria-activedescendant`, `role="alert"` nas confirmações e
`aria-live="polite"` no progresso de envio. Rótulos associados. Texto escondido para leitor de tela
na lista de pendências (`VehicleEditor.tsx:118`). **A acessibilidade semântica deste painel é
melhor que a média do mercado.** O problema é de contraste não textual, e é corrigível em um token.

**Gravidade: P2** (não bloqueia o uso, mas é falha objetiva de conformidade).

### 3.8 A barra de publicar não é fixa de verdade

`admin.module.css:248` define `.editorFooter { position: sticky; bottom: 0 }`. Mas o elemento está
dentro de `<section aria-labelledby="conferir-title">` (`VehicleEditor.tsx:109-142`), e `sticky` é
limitado pelo bloco do pai. A seção contém apenas o parágrafo, a lista de 4 pendências e a própria
barra — poucos pixels. **A barra só flutua enquanto essa seção curta está na tela**; ao rolar para
"Situação" ou "Gerenciar anúncio", ela sai com a seção. Na prática, comporta-se como botão comum.

Agravante: `.editorWithFooter` (`admin.module.css:247`), cuja única função é reservar espaço no pé
para a barra não cobrir o conteúdo, **nunca é aplicada**. `VehicleEditor.tsx:86` usa
`styles.listPanel`, que não tem `padding-bottom`. Enquanto a barra flutua, ela se sobrepõe ao que
está abaixo.

**Gravidade: P1.** **Impacto:** a ação primária não tem âncora confiável na tela.

### 3.9 Estoque: encontrar um veículo

`/admin` não tem busca e não tem paginação. A lista inteira é carregada e ordenada por
`desc(vehicles.updatedAt)` (`service.ts:108`). Dois efeitos:

- Com 30+ veículos, localizar um é rolar, ou filtrar por uma das 7 situações e rolar menos.
- **A posição do veículo na lista não é estável**: editar um veículo o move para o topo. O dono não
  consegue memorizar "minha CG 160 é a quinta" — o que anula justamente o reconhecimento em vez da
  memorização que o resto do painel busca.

**Gravidade: P1** (busca), **P2** (ordenação instável).

### 3.10 Informações duplicadas

- **Situação do veículo em três lugares** na tela de edição: o aviso `publishedNotice`
  ("Situação: Publicado", `VehicleEditor.tsx:90-94`), o título da seção
  ("Situação: Publicado", `StatusActions.tsx:49`) e a etiqueta no cartão do estoque.
- **Pendências de publicação em dois formatos**: a lista de 4 itens com ✓/○
  (`VehicleEditor.tsx:113-121`) e a frase "Para publicar, complete: Marca, Preço." no texto de
  bloqueio (`:137`) — a mesma informação, duas vezes, a centímetros de distância.
- **Texto auxiliar padrão escrito duas vezes**, em arquivos diferentes: `ArtEditor.tsx:35-36`
  (como `placeholder`) e `ArtCanvas.tsx:79-80` (como texto desenhado). São literais idênticos
  duplicados; divergirão.

**Gravidade: P3.**

---

## 4. Diagnóstico do gerador de artes

### 4.1 Arquitetura

```
/admin/veiculos/[id]/arte/page.tsx        servidor: busca veículo + fotos, calcula o bloqueio
  └─ vehicle-art-data.ts                  requireAdmin + 2 consultas paralelas
  └─ policy.ts: artExportProblem()        regra única do que impede exportar
  └─ ArtEditor.tsx          cliente: 4 grupos de controle + exportação
       └─ ArtCanvas.tsx     cliente (dynamic, ssr:false): Konva/react-konva, palco 1080px
       └─ templates.ts      4 formatos + 6 modelos (dados)
  └─ /api/.../art-photo/[photoId]         proxy autenticado (stream, mesma origem)
  └─ /api/.../art-check                   trava de versão + repete a política
```

**Formatos** (`templates.ts:1-6`): feed 1080×1350, quadrado 1080×1080, Stories 1080×1920,
TikTok 1080×1920.
**Modelos** (`:11-18`): Recém-chegado, Destaque da semana, Preço em destaque, Reservado, Vendido,
Tradicional — filtrados por situação em `templatesForStatus` (`:20-24`), restando 4 escolhas no
caso comum.
**Exportação:** `stage.toBlob({ pixelRatio: 1 })` com `Konva.pixelRatio = 1`, download por link
`<a download>`. Sempre 1080px de largura.

### 4.2 PROBLEMA CONFIRMADO — P0: a arte descarta texto do título sem avisar

O título é desenhado assim (`ArtCanvas.tsx:129-131`):

```jsx
<Text x={inset} y={footerTop + 16} width={contentWidth} height={vertical ? 108 : 120}
  text={title.toLocaleUpperCase('pt-BR')} fontSize={titleSize} lineHeight={1.02} wrap="word" />
```

Altura **fixa**, `wrap="word"`, **sem `ellipsis`**. O Konva instalado, em
`node_modules/konva/lib/shapes/Text.js:624`, faz:

```js
// if element height is fixed, abort if adding one more line would overflow
if (fixedHeight && currentHeightPx + lineHeightPx > maxHeightPx) { break; }
```

E `_tryToAddEllipsisToLastLine()` só acrescenta "…" quando o atributo `ellipsis` é verdadeiro — não
é. Portanto **as linhas que não cabem simplesmente desaparecem, sem nenhuma marca**.

Quantas linhas cabem, pela própria aritmética do Konva (`lineHeightPx = 1.02 × fontSize`):

| Corpo | Linha | Caixa | Linhas que cabem |
|---|---|---|---|
| 66px (título ≤24 chars, feed) | 67,32px | 120px | **1** (2 = 134,6 > 120) |
| 55px (25–32 chars) | 56,10px | 120px | 2 |
| 48px (>32 chars) | 48,96px | 120px | 2 (3 = 146,9 > 120) |
| 52px (vertical) | 53,04px | 108px | 2, com 1,92px de sobra |

Reproduzido com as fontes reais do projeto. Caixa do feed 940×120px, corpo 48px:

| Título (75 chars) | Arte mostra | **Arte descarta** |
|---|---|---|
| CHEVROLET S10 HIGH COUNTRY 2.8 TURBO DIESEL 4X4 AUTOMATICA COURO MULTIMIDIA | "CHEVROLET S10 HIGH COUNTRY" / "2.8 TURBO DIESEL 4X4" | **"AUTOMATICA COURO MULTIMIDIA" (28 chars)** |
| HONDA CG 160 TITAN SPECIAL EDITION 2024 PARTIDA ELETRICA FREIO CBS REVISADA | "HONDA CG 160 TITAN SPECIAL" / "EDITION 2024 PARTIDA ELETRICA" | **"FREIO CBS REVISADA" (19 chars)** |

No formato Stories (caixa 800×108px, corpo 52px), a perda chega a **39 caracteres**. O
comportamento se repete nas três fontes testadas (Archivo 400, Archivo 900 e Liberation Sans Bold
como equivalente métrico de Arial), variando só onde a quebra cai.

Isto é alcançável no uso normal: o título é `brand + model + version`
(`arte/page.tsx:18`) e o campo *Versão* aceita **160 caracteres**
(`validation.ts:3,13`; `actions.ts:79`), sem nenhum aviso de que texto além de ~60 caracteres não
aparecerá na arte.

**Impacto:** a peça comercial sai com o nome do veículo cortado no meio, e o dono não tem como
saber. É a explicação mais direta de "geração inconsistente" e "textos mal posicionados".

### 4.3 PROBLEMA CONFIRMADO — P1: o corpo da fonte é escolhido por contagem de caracteres

```js
// ArtCanvas.tsx:76-77
const titleSize = vertical ? 52 : Math.min(format === 'square' ? 59 : 66,
  title.length > 32 ? 48 : title.length > 24 ? 55 : 66);
```

A decisão usa **número de caracteres**; a restrição real é **largura em pixels**. Os dois critérios
discordam, e o degrau de 66px é um precipício, porque nele **cabe apenas uma linha**. Medido a 66px
na caixa de 940px:

| Título | Largura (Archivo 900) | Folga |
|---|---|---|
| VOLKSWAGEN CROSSFOX (19 chars) | 935,2px | **5px** |
| TOYOTA COROLLA CROSS (20 chars) | 923,5px | **16px** |
| KAWASAKI NINJA ZX-10R (21 chars) | 904,0px | 36px |
| SUZUKI BOULEVARD M800 (21 chars) | **959,6px** | **estoura 20px → perde "M800"** |

Note que "SUZUKI BOULEVARD M800" e "KAWASAKI NINJA ZX-10R" têm o **mesmo número de caracteres** e
recebem o mesmo corpo, mas diferem 56px em largura. A contagem de caracteres não pode prever isso.

**Honestidade sobre a medida:** o canvas pede peso `bold` (700) e o projeto tem localmente apenas
as instâncias estáticas 400 e 900. A 900 o título acima estoura; a 400 e a Arial-700 ele cabe. O
peso real (700) fica entre os dois — ou seja, *este* título específico provavelmente cabe. O que
está **confirmado** é o mecanismo e as margens: 5px e 16px de folga em modelos reais do catálogo do
próprio projeto são margens que qualquer variação de fonte, peso ou plataforma consome.

### 4.4 PROBLEMA CONFIRMADO — P1: a prévia pode divergir da exportação

Três fatos, todos verificados:

1. O Konva calcula a quebra **uma vez**, em `_setTextData`, quando os atributos mudam — não a cada
   desenho. A medição usa `measureText` com a fonte ativa **naquele instante**.
2. A fonte é `Archivo`, carregada por `next/font/google` com `font-display: swap` em três sub-faixas
   Unicode (confirmado no CSS gerado em `.next/dev/static/chunks/[next]_internal_font_google_archivo_*.css`).
   Antes de carregar, o navegador usa fallback.
3. `document.fonts.ready` é aguardado **só na exportação** (`ArtEditor.tsx:48`), e `ArtCanvas` é
   carregado por `dynamic(..., { ssr: false })` — monta depois da hidratação.

Se a fonte terminar de carregar **depois** de o canvas medir o texto, a prévia na tela guarda a
quebra calculada com o fallback e **o Konva não redesenha sozinho**; a exportação desenha os glifos
já com a Archivo, usando quebras medidas para outra fonte. As quebras realmente diferem — medido:

```
Archivo-900:  'VOLKSWAGEN SAVEIRO'        / 'ROBUST CD'
Arial-700:    'VOLKSWAGEN SAVEIRO ROBUST' / 'CD'
```

Detalhe correlato: o Next gerou uma família `Archivo Fallback` com `size-adjust: 98.7%` e
`ascent/descent-override` exatamente para reduzir essa divergência — mas o canvas pede
`fontFamily="Archivo, Arial"` (`ArtCanvas.tsx:130` e outras 6 ocorrências), ou seja, **pula o
fallback compensado e cai no Arial cru**. A compensação métrica que o Next montou não é usada.

**Classificação:** mecanismo **confirmado**; a ocorrência em campo depende de tempo de rede e
**precisa de reprodução em dispositivo** (ver §8, H1).

### 4.5 PROBLEMA CONFIRMADO — P1: no celular, não se vê a prévia enquanto se ajusta

`art-studio.module.css:3` define duas colunas (controles 370px | prévia 1fr) e `:31` colapsa para
uma coluna abaixo de 960px. Em celular, a ordem no DOM é **controles primeiro, prévia depois**: os
quatro grupos de controle ocupam a tela inteira e a prévia fica abaixo.

A prova de que isso é conhecido está no próprio código: dois botões-âncora existem **só no
celular** (`art-studio.module.css:30` e `:38`) — "Ver prévia da arte" (`ArtEditor.tsx:116`) e
"Alterar opções" (`:130`). Eles são o contorno do problema, não a solução.

Consequência: mexer nos controles de enquadramento (`ArtEditor.tsx:93-98`) **não tem retorno
visual**. Cada tentativa custa: mover o controle → tocar "Ver prévia" → olhar → tocar "Alterar
opções" → mover de novo. É este ciclo, e não a qualidade das peças, que faz o estúdio perder do
Vapo.

**Gravidade: P1.**

### 4.6 PROBLEMA CONFIRMADO — P2: fotos de proporção diferente deixam faixas vazias

```js
// ArtCanvas.tsx:60-67
const containPhoto = classic || vertical;
const containRatio = Math.min(photoBox.width / photo.width, photoBox.height / photo.height);
```

Nos modelos **Tradicional** e nos dois **formatos verticais**, a foto é contida (`contain`), não
preenchida. A moldura desenhada em `:106-107` (Tradicional) e `:97-98` (Destaque) enquadra **a
caixa**, não a foto. Uma foto retrato (3:4, típica de celular) numa caixa paisagem:

- Tradicional/feed: caixa 968×584px. Foto 3024×4032 → razão `min(0,320; 0,145) = 0,145` →
  **438×584px centrados**, deixando **265px de fundo bege de cada lado, dentro da moldura**.

Os dois controles de enquadramento são justamente **desabilitados** nesses casos
(`ArtEditor.tsx:34`: `canCrop = format !== 'story' && format !== 'tiktok' && template !== 'classic'`),
com a explicação "Neste formato a foto aparece inteira para evitar cortes no veículo" (`:99`). A
decisão é defensável — cortar a moto é pior que deixar faixa —, mas o resultado visual é uma peça
que parece malmontada, e o dono não tem alternativa. **Isto corresponde diretamente à queixa
"fotografias mal posicionadas".**

**Gravidade: P2** (comportamento deliberado, resultado ruim).

### 4.7 PROBLEMA CONFIRMADO — P2: a faixa do selo também é medida por contagem

```js
// ArtCanvas.tsx:125
<Rect width={Math.min(600, badge.length * 29 + 80)} height={64} ... />
<Text x={26} y={15} text={badge} fontSize={31} fontStyle="bold" />   // :127
```

Largura estimada a 29px por caractere, texto desenhado a 31px. Medido:

| Selo | Caixa calculada | Texto + margem real | Sobra à direita |
|---|---|---|---|
| RECÉM-CHEGADO | 457px | 331,7px | **125px** |
| DESTAQUE DA SEMANA | 600px (teto) | 420,0px | **180px** |
| PREÇO DO ANÚNCIO | 544px | 368,9px | **175px** |
| VENDIDO | 283px | 183,8px | 99px |
| COMPRA • VENDA • TROCA | 600px (teto) | 469,9px | 130px |

A faixa colorida fica de 99 a 180px mais larga que o texto, com padding assimétrico que varia por
modelo. Não quebra nada, mas é exatamente o tipo de desalinho que faz uma peça parecer amadora
quando comparada com um gerador maduro.

### 4.8 A arquitetura do gerador não comporta modelos novos

`ArtCanvas.tsx` tem **156 linhas e 56 expressões condicionais**, das quais **43 decidem geometria**
em função de `format` e `template`. Toda a posição vive em cadeias de ternários:

```js
const inset       = vertical ? 80 : 70;                                              // :48
const contentWidth= vertical ? 800 : width - inset * 2;                              // :49
const footerTop   = vertical ? 892 : height - (format === 'square' ? 395 : 470);     // :50
const photoTop    = vertical ? 420 : classic && format === 'square' ? 200 : height * 0.16;  // :55
const photoHeight = vertical ? 470 : classic ? footerTop - photoTop - 80
                  : highlighted ? footerTop - photoTop - 55 : height * 0.58;         // :56-57
const priceY      = vertical ? 1070 : footerTop + (format === 'square' ? 191 : 203); // :78
```

`templates.ts` é **só dados de rótulo** (`id`, `label`, `heading`, `accent`) — **não existe esquema
de layout**. Acrescentar um 7º modelo ou um 5º formato exige editar todas essas expressões em
`ArtCanvas`, uma a uma, sem nenhuma garantia estrutural. É o obstáculo central para as artes
comemorativas pedidas na Etapa 6 (§6.1).

**Gravidade: P1 (arquitetural, não visível ao usuário hoje).**

### 4.9 Hipóteses descartadas pela auditoria (vale registrar)

Duas causas plausíveis foram investigadas e **não se confirmam**:

- **Canvas contaminado por imagem de outra origem.** Seria a explicação clássica para
  `toBlob` falhar. Mas `art-photo/[photoId]/route.ts:18-25` **transmite os bytes** da R2 pelo
  próprio servidor (não redireciona), e o caminho legado redireciona para `/images/…`, também mesma
  origem. A logomarca vem de `/logo-liberato-negativo.png`. **Nenhuma origem externa toca o canvas.**
- **Exportação em resolução errada.** `Konva.pixelRatio = 1` (`ArtCanvas.tsx:10`) e
  `pixelRatio: 1` na exportação (`ArtEditor.tsx:49`) garantem saída de 1080px exatos,
  independentemente da densidade da tela. A escala visual da prévia é CSS
  (`transform: scale()`, `:84`) e não afeta o arquivo. **Está correto.**

### 4.10 Desempenho do estúdio no celular — P2

`ArtEditor.tsx:90` renderiza **uma miniatura `<img>` por foto**, todas apontando para
`/api/admin/vehicles/[id]/art-photo/[photoId]`. Essa rota responde com
`Cache-Control: private, no-store` (`route.ts:23`) e serve a imagem em **tamanho cheio** — as fotos
são gravadas com até 1920px de lado (`PhotoUpload.tsx:10`, `MAX_SIDE = 1920`).

Com seis fotos: seis downloads de ~300–600KB cada, cada um exigindo do servidor uma assinatura R2 +
um `fetch` + repasse. E como é `no-store`, o `new window.Image()` do canvas
(`ArtCanvas.tsx:15-20`) **baixa a foto selecionada uma sétima vez**. Não há miniatura reduzida.

Detalhe adicional: nada no canvas é interativo, mas a `Layer` do Konva mantém um **canvas de
detecção de toque** além do canvas visível. Para Stories (1080×1920) são dois buffers de ~8,3MB
cada, mais o da exportação.

---

## 5. Mapeamento dos fluxos

### A. Cadastrar um veículo — 3 navegações, ~13 interações, 2 confirmações

| # | Passo | Decisões | Observação |
|---|---|---|---|
| 1 | `/admin` → "Cadastrar veículo" | 1 | botão fixo no pé |
| 2 | Moto ou Carro | **1 de 2** | **melhor tela do painel** |
| 3 | Chip de Marca | **1 de 13** | |
| 4 | Modelo: digitar + tocar sugestão | 1 de ≤8 | exige teclado |
| 5 | Ano (lista) | **1 de 48** | |
| 6 | Quilometragem (teclado numérico) | — | máscara automática |
| 7 | Chip de Cor | **1 de 13** | |
| 8 | Preço (teclado numérico) | — | máscara automática |
| 9 | *(opcional)* "Detalhes opcionais" → Versão, Descrição | 1 | **texto aqui pode ser cortado na arte** (§4.2) |
| 10 | "Tirar foto" ou "Escolher da galeria" | 1 de 2 | aceita várias de uma vez |
| 11 | Rolar até "Conferir e publicar", ler 4 pendências | — | |
| 12 | "Publicar anúncio" | 1 | |
| 13 | "Sim, publicar anúncio" | 1 | |

**Pontos de confusão:** não há botão de salvar (gravação automática, `useVehicleDraft.ts:22`,
800ms de pausa) — é a decisão certa, mas o único sinal de que o trabalho está seguro é um "✓ salvo"
discreto no fim da seção 1. **Redundância:** as pendências aparecem como lista com ✓/○ e como frase
no bloqueio do botão. **Dificuldade no celular:** 44 controles em rolagem longa; a barra de
publicar desaparece ao sair da seção (§3.8); o rodapé se esconde quando o teclado abre
(`admin.module.css:249`, `.editorFooterKeyboard { display: none }`).

**Simplificação possível:** o passo 2 (moto/carro) e os passos 3–8 podem virar um fluxo em etapas
curtas; os 48 anos e os 13 chips podem ser reduzidos pelo histórico do estoque.

### B. Editar informações — 2 navegações, 1 interação

`/admin` → cartão do veículo → alterar campo → gravação automática em 800ms. **É o fluxo mais bem
resolvido do painel.** A única falta é um fechamento explícito: não há "pronto" nem volta
automática; o dono precisa decidir sozinho que terminou.

### C. Publicar no site — 4 a 6 passos

Pelo cadastro: passos 11–13 de (A). Por um rascunho antigo: `/admin` → filtro "Rascunhos" →
cartão → rolar → "Publicar anúncio" → "Sim, publicar anúncio" = 5 passos.

**Ponto crítico:** se a gravação automática falhar nesse instante, o toque em "Sim, publicar" fecha
a confirmação e **não publica nem explica** (§3.3, P0).

### D. Criar uma arte comercial — 3 navegações, ~10 interações, 1 saída do produto

| # | Passo | Observação |
|---|---|---|
| 1 | `/admin` → cartão do veículo | |
| 2 | Rolar até a seção "Fotos" | o botão não está em lugar previsível |
| 3 | "Criar arte" (espera "Salvando anúncio…") | **se a gravação falhar, nada acontece** (§3.3) |
| 4 | Formato | 1 de 4 |
| 5 | Foto | 1 de N |
| 6 | Enquadramento horizontal + vertical | **desabilitados em 2 de 4 formatos e no Tradicional** |
| 7 | Modelo | 1 de 4 |
| 8 | *(opcional)* texto auxiliar + caixa "Confirmei…" | obrigatória se houver texto (`ArtEditor.tsx:43`) |
| 9 | **Celular:** "Ver prévia da arte" → olhar → "Alterar opções"** | **repetido a cada ajuste** (§4.5) |
| 10 | "Baixar PNG" **ou** "Baixar JPEG" | **decisão técnica imposta a quem não é técnico** |
| 11 | Download do sistema | |
| 12 | **Sair do navegador**, abrir WhatsApp, achar o arquivo em Downloads, anexar | **fora do produto** |

**Redundância e atrito:** PNG vs JPEG não é uma escolha que o dono de revenda deva fazer; são dois
botões onde deveria haver um. **Bloqueio de produto:** se o veículo não estiver publicado,
`artExportProblem` desabilita os dois downloads e a prévia sai marcada
"PRÉVIA · NÃO PUBLICAR" (`ArtCanvas.tsx:148-150`) — não se prepara divulgação antes de publicar.
**Nada é guardado:** sair da página perde formato, modelo, foto, enquadramento e texto.

### E. Compartilhar uma arte — **não existe no produto**

O fluxo termina no download (passo 11 de D). Não há `navigator.share`, não há link de WhatsApp com
imagem, não há cópia para a área de transferência. O compartilhamento acontece inteiramente no
sistema operacional, fora do produto, e o produto não sabe que aconteceu.

### F. Localizar e gerenciar veículos — 1 navegação, 7 filtros, sem busca

`/admin` lista tudo, sem paginação, ordenado por última alteração. Sem campo de busca. Por veículo,
o cartão mostra capa, título, etiqueta de situação, ano e preço — **boa densidade de informação**.
Gerenciar exige abrir o veículo: nenhuma ação (publicar, reservar, vender, criar arte) é possível a
partir da lista.

---

## 6. Arquitetura da informação — diagnóstico

### 6.1 O que deveria estar agrupado

- **Artes e veículo.** Hoje a arte é uma sub-rota do veículo e o botão mora na seção "Fotos". Para o
  dono, "divulgar" é uma atividade com vida própria, aplicável a vários veículos. Não há nenhuma
  entrada para artes a partir do estoque.
- **Situação e publicação.** A mudança de estado está repartida entre três seções —
  "Conferir e publicar" (`VehicleEditor.tsx:109`), "Situação" (`StatusActions.tsx:48`) e
  "Gerenciar anúncio" (`DangerActions.tsx:39`) — e "Arquivar" aparece nas duas últimas de formas
  diferentes (`StatusActions.tsx:21` exclui `archived` do grupo comum; `DangerActions` o trata como
  ação de risco). É uma separação coerente no código e **confusa na tela**: três cabeçalhos para um
  conceito só.
- **Fotos e enquadramento.** A foto é escolhida no cadastro e enquadrada no estúdio, em telas
  diferentes, com vocabulário diferente ("capa" vs "foto 1 · capa").

### 6.2 O que deveria estar separado

- **Configuração da Meta e trabalho diário.** `WhatsAppOnboardingCard` e `MetaTestNumberForm`
  (`atendimento/page.tsx:118-131`) são instalação feita uma vez, ocupando o topo de uma tela de uso
  diário (§3.6).
- **Descartados.** O filtro aparece só quando há algum (`StatusFilter.tsx:24`) — um filtro que
  surge e desaparece é imprevisível. Lixeira é tela de administração, não filtro de estoque.

### 6.3 Ações secundárias excessivamente destacadas

- "Excluir veículo" e "Arquivar" são permanentemente visíveis, com o mesmo estilo de "Criar arte"
  (§3.2). `isDiscardable` devolve verdadeiro para **qualquer** veículo não descartado
  (`validation.ts:39-41`), então "Excluir veículo" aparece inclusive em anúncios publicados e
  vendidos.
- "Sair do painel" fica no topo do estoque, em pé de igualdade com a logomarca
  (`page.tsx:36-38`) — é a ação menos frequente no lugar mais nobre.
- Os 7 filtros de situação ocupam uma faixa rolável antes da lista (`admin.module.css:256`), com
  contagem em cada. "Descartados" e "Arquivados" raramente interessam no dia a dia.

### 6.4 Elementos administrativos desnecessários ao uso cotidiano

Meta App ID, Config ID, WABA ID, phone number ID, webhook URL, access token, "Ativar webhook com o
token salvo", os 6 estados de veículo expostos como vocabulário
(`status.ts:1`: Rascunho/Publicado/Reservado/Vendido/Arquivado/Descartado), e a escolha PNG/JPEG.

### 6.5 Onde a navegação pode simplificar

Com 5 telas e sem menu, a estrutura é rasa — o que é bom. O que falta é **uma casa para o trabalho
de divulgação**, hoje acessível apenas por dentro de um veículo específico, e **uma casa para
configuração**, hoje misturada ao atendimento.

### 6.6 Impedimento estrutural às artes comemorativas

Duas barreiras, ambas no código:

1. **Dados.** `getArtVehicleData` (`vehicle-art-data.ts:8-21`) exige um `vehicleId` válido; a rota
   é `/admin/veiculos/[id]/arte`. Uma arte de Dia das Mães não tem veículo.
2. **Política.** `artExportProblem` (`policy.ts:6-8`) **recusa** qualquer peça cujo veículo não
   esteja publicado e sem marca, modelo, ano e preço. Uma arte comemorativa falharia em todas as
   condições.

Somado ao §4.8 (geometria em ternários, sem esquema de layout), são três impedimentos arquiteturais
distintos. **Isto precisa estar claro antes de prometer a funcionalidade.**

---

## 7. Problemas classificados por gravidade

### P0 — Crítico

| # | Problema | Localização |
|---|---|---|
| P0-1 | As 4 ações principais abortam em silêncio quando a gravação automática falha; a explicação é renderizada em outra seção, fora da tela no celular | `VehicleEditor.tsx:63,81`; `StatusActions.tsx:26`; `DangerActions.tsx:23` |
| P0-2 | A arte descarta até 39 caracteres do título sem reticências nem aviso | `ArtCanvas.tsx:129-131` + `konva/lib/shapes/Text.js:624` |

### P1 — Alto

| # | Problema | Localização |
|---|---|---|
| P1-1 | Corpo da fonte do título escolhido por contagem de caracteres; folga de 5px em modelo real do catálogo; degrau de 66px só cabe 1 linha | `ArtCanvas.tsx:76-77` |
| P1-2 | Prévia e exportação podem divergir: quebra medida uma vez, sem redesenho ao carregar a fonte | `ArtCanvas.tsx:129`; `ArtEditor.tsx:48` |
| P1-3 | No celular a prévia fica fora da tela durante o ajuste; os 2 botões-âncora são contorno, não solução | `art-studio.module.css:30-38`; `ArtEditor.tsx:116,130` |
| P1-4 | Hierarquia plana: 27 `buttonSecondary` contra 6 primários; "Criar arte" = "Excluir veículo" | `VehicleEditor.tsx:105`; `DangerActions.tsx:53` |
| P1-5 | ~44–51 controles na tela de edição (13+13 chips, 48 anos) | `VehicleForms.tsx`; `catalogo-marcas-modelos.ts`; `masks.ts:50` |
| P1-6 | A barra de publicar só flutua dentro da própria seção, e `.editorWithFooter` nunca é aplicada → cobre o conteúdo e desaparece | `admin.module.css:247-248`; `VehicleEditor.tsx:86,122` |
| P1-7 | Configuração da Meta acima do trabalho diário, com jargão técnico | `atendimento/page.tsx:118-131` |
| P1-8 | "Excluir conversa" sem nenhuma confirmação, em nenhuma camada | `InboxOperatorControls.tsx:42-44`; `atendimento/actions.ts:113` |
| P1-9 | Sem busca e sem paginação no estoque | `service.ts:94-113`; nenhum `type="search"` no painel |
| P1-10 | Não se cria arte de veículo não publicado — inverte a ordem natural do trabalho | `policy.ts:6` |
| P1-11 | Geometria da arte em 43 condicionais, sem esquema de layout em `templates.ts` | `ArtCanvas.tsx:47-78` |
| P1-12 | Compartilhamento inexistente: o fluxo termina em download e sai do produto | nenhum `navigator.share` em `src/` |

### P2 — Médio

| # | Problema | Localização |
|---|---|---|
| P2-1 | Fotos retrato em caixa paisagem deixam ~265px de fundo de cada lado, dentro da moldura | `ArtCanvas.tsx:60-67,97,106` |
| P2-2 | Faixa do selo medida por contagem: 99–180px de sobra à direita | `ArtCanvas.tsx:125-127` |
| P2-3 | Contraste de borda 2,51:1 e 2,21:1 — reprova WCAG 2.2 SC 1.4.11 em quase todo botão secundário, campo e chip | `admin.module.css:6,73,89,120,174` |
| P2-4 | `confirm: 'yes'` fixo no cliente torna a trava de confirmação do servidor inalcançável | `SiteModeForm.tsx:145,155` vs `atendimento/actions.ts:79` |
| P2-5 | 12 tokens de design duplicados entre os dois módulos CSS, mais `.submit`/`.secondaryButton` | `attendance.module.css:1-16` vs `admin.module.css:2-17` |
| P2-6 | Voz divergente: emoji + Title Case + jargão no atendimento, frases simples nos veículos | `SiteModeForm.tsx:110-129` |
| P2-7 | Canvas pede `Arial` em vez de `Archivo Fallback`, pulando o `size-adjust: 98.7%` do Next | `ArtCanvas.tsx:102,117,127,130,133,138,145,147` |
| P2-8 | Peso da fonte da arte (700) difere do site (900) e das imagens OG (Archivo Black) | `ArtCanvas.tsx` vs `globals.css:234`, `lib/og.ts:20` |
| P2-9 | Estúdio baixa todas as fotos em tamanho cheio com `no-store`; a selecionada, duas vezes | `ArtEditor.tsx:90`; `art-photo/route.ts:23`; `ArtCanvas.tsx:15-20` |
| P2-10 | Arte não é persistida: recarregar perde formato, modelo, foto, enquadramento e texto | nenhuma tabela de artes em `schema.ts` |
| P2-11 | "A foto ainda não carregou. Aguarde" também aparece quando a foto falhou de vez | `ArtEditor.tsx:47`; `ArtCanvas.tsx:19` |
| P2-12 | Ordem por `updatedAt` deixa a posição do veículo instável na lista | `service.ts:108` |
| P2-13 | Atendimento não atualiza sozinho; exige recarga manual | `atendimento/page.tsx` sem polling/stream |
| P2-14 | Canvas de detecção de toque do Konva alocado sem nenhum elemento interativo | `ArtCanvas.tsx:85-151` |

### P3 — Baixo

| # | Problema | Localização |
|---|---|---|
| P3-1 | CSS morto: `.editorWithFooter` e `.formSticky` nunca aplicados | `admin.module.css:246-247` |
| P3-2 | IDs da Meta codificados como fallback dentro da página | `atendimento/page.tsx:94-96,106` |
| P3-3 | Texto auxiliar padrão duplicado em dois arquivos como literal | `ArtEditor.tsx:35-36`; `ArtCanvas.tsx:79-80` |
| P3-4 | Pendências de publicação mostradas em dois formatos lado a lado | `VehicleEditor.tsx:113-121,137` |
| P3-5 | Situação do veículo exibida em 3 lugares na mesma tela | `VehicleEditor.tsx:90-94`; `StatusActions.tsx:49` |
| P3-6 | Filtro "Descartados" aparece e desaparece conforme o conteúdo | `StatusFilter.tsx:24` |
| P3-7 | "Excluir veículo" visível em anúncios publicados e vendidos | `validation.ts:39-41` |
| P3-8 | PNG e JPEG como dois botões — decisão técnica imposta ao usuário | `ArtEditor.tsx:125-127` |

---

## 8. Problemas técnicos confirmados vs. hipóteses

### 8.1 Confirmados por leitura de código e medição

Todos os itens P0, P1 e P2 acima, com uma distinção: **P1-2 tem mecanismo confirmado e ocorrência a
reproduzir** (ver H1). A tabela de contrastes (§3.7), as medidas de tipografia (§4.2, §4.3, §4.7) e
as contagens de controles e de botões (§3.1, §3.2) são números calculados, não estimativas.

### 8.2 Hipóteses que exigem reprodução

**H1 — A divergência prévia/exportação ocorre no aparelho do dono.**
O mecanismo está provado (§4.4). O que falta é saber se, na rede e no aparelho dele, a fonte chega
depois da primeira medição. *Como reproduzir:* abrir o estúdio com throttling "Slow 3G" no
DevTools, exportar imediatamente, e comparar o arquivo com uma captura da prévia. Repetir com cache
quente. **Esta é a hipótese mais importante a testar**, porque confirma ou elimina a causa de
"inconsistência" percebida.

**H2 — A exportação falha por memória em aparelho modesto.**
Há uma mensagem preparada para isso: "Não foi possível gerar a arte neste aparelho"
(`ArtEditor.tsx:50`). A aritmética: Stories 1080×1920 = 2,07M píxeis × 4 bytes = **8,3MB por
buffer**; a `Layer` do Konva mantém canvas visível + canvas de toque = **16,6MB**; `toBlob` cria
outro = **~25MB**; mais a foto decodificada (1920×1440 ≈ 11MB) → **~36MB de pico**. *Como
reproduzir:* Android de entrada com 2–3GB de RAM, formato Stories, foto de 1920px, exportar PNG
várias vezes seguidas.

**H3 — Fotos de celular com orientação EXIF chegam giradas à arte.**
`PhotoUpload.tsx:21` usa `createImageBitmap(file, { imageOrientation: 'from-image' })`, que trata
a orientação corretamente — **com fallback** para `<img>.decode()` (`:27-29`), que depende do
navegador. Se o fallback for usado, a foto pode ser gravada girada e aparecer girada na arte.
*Como reproduzir:* enviar foto retrato com EXIF Orientation 6 em navegador sem
`createImageBitmap`, e conferir a arte.

**H4 — Qual é, concretamente, o caminho do Vapo que o dono considera intuitivo.**
Toda a comparação deste relatório é inferida do código. Sem observar o dono usando o Vapo não se
sabe se o ganho dele está no número de passos, na prévia ao vivo, na biblioteca de modelos ou no
compartilhamento direto. *Como reproduzir:* uma sessão de observação de 20 minutos, gravada, com a
tarefa "divulgue esta moto", primeiro no Vapo e depois aqui. **É o teste de maior retorno de toda
esta lista** e não custa uma linha de código.

**H5 — O limite de 160 caracteres de "Versão" é usado na prática.**
A perda de texto (§4.2) só dói se o dono escrever versões longas. *Como reproduzir:* consultar
`length(version)` no Neon sobre os veículos reais.

---

## 9. Oportunidades de simplificação

Diagnóstico, não desenho. Em ordem de retorno sobre esforço:

1. **Uma única mensagem de resultado por ação, ao lado do botão tocado.** Resolve P0-1 nos quatro
   lugares e é a correção de maior impacto por linha alterada de todo o relatório.
2. **Medir o texto em vez de contar caracteres, e dar `ellipsis` à caixa do título.** Resolve P0-2 e
   P1-1. A reticência é pior que o texto inteiro, mas infinitamente melhor que o silêncio.
3. **Prévia e controles na mesma tela no celular** (prévia fixa reduzida no topo, controles abaixo).
   Resolve P1-3 e elimina os dois botões-âncora.
4. **Um botão "Baixar arte" e, onde houver suporte, "Enviar para…" via Web Share API.** Resolve
   P1-12 e P3-8, e fecha o fluxo dentro do produto.
5. **Um peso visual só para a ação principal de cada seção.** Resolve P1-4 sem mexer em estrutura.
6. **Busca por texto no estoque.** Resolve P1-9 e reduz a dependência dos 7 filtros.
7. **Separar configuração de WhatsApp do atendimento diário.** Resolve P1-7 e boa parte do P2-6.
8. **Reduzir os chips pelo histórico do estoque** (as marcas que a loja realmente vende primeiro,
   o resto atrás de "Ver todas"). Ataca P1-5 sem remover nada.
9. **Unificar as três seções de situação em uma.** Ataca P1-11 na percepção e §6.1 na estrutura.
10. **Um token de borda com 3:1 de contraste.** Resolve P2-3 em uma linha.

---

## 10. Riscos de uma reformulação

**Risco alto — perder a concorrência otimista ao reescrever o editor.**
`useVehicleDraft.ts` é a peça mais sutil do painel e está documentada em 13 linhas de comentário
(`:8-20`) explicando *por que* a versão vive ali: toda escrita exige a versão esperada e a
incrementa, então cópias espalhadas de `version` ficariam velhas na primeira gravação automática e
a foto seguinte seria recusada com "anúncio alterado". A fila (`enqueue`, `:103-113`) garante uma
escrita por vez, cada uma recebendo a versão válida no instante em que começa. **Um redesenho que
trate o formulário como estado comum reintroduz a classe de bug que este código existe para
eliminar.** Quem mexer aqui precisa ler os comentários antes.

**Risco alto — duplicar a regra de publicação.**
`publishRequirements` (`validation.ts:48-55`) é fonte única: o serviço recusa por ela e a tela
mostra a mesma lista. O comentário `:45-47` diz exatamente isso. Uma tela nova que recalcule as
pendências do seu jeito fará o painel mentir.

**Risco médio — desfazer decisões deliberadas tomando-as por defeito.** Três exemplos reais,
verificados na documentação do projeto:
- **A área vazia no formato vertical não é bug.** Stories 1080×1920 tem conteúdo entre y=280 e
  y≈1234, deixando ~686px (36% da peça) livres. `docs/liberato-inteligente/04-PLANO-ESTUDIO-ARTES.md:13`
  documenta a decisão: "conteúdo principal entre x=80 e x=880 e y=280 e y=1244; o restante pode
  receber interface da plataforma", com referência ao TikTok Ads Manager e ao guia da Meta. O custo
  visual é real e merece revisão — mas **com a decisão na mesa**, não por engano.
- **O `Combobox` não é `<datalist>` de propósito** (`Combobox.tsx:18-26`): o nativo não mostra
  sugestões de forma previsível no Android e no iOS.
- **`PhotoUpload` não usa `capture` no input da galeria de propósito** (`:65-66`): forçar a câmera
  impedia escolher fotos já tiradas.

Há um arquivo `src/app/admin/css-classes.test.ts` que guarda contra classes de CSS Modules
inexistentes, e `docs/PENDENCIAS_PAINEL.md` registra decisões por entrega. **Ler esses dois antes de
mexer economiza retrabalho.**

**Risco médio — quebrar o `noindex` deliberado.** Todas as páginas do painel declaram
`robots: { index: false, follow: false }`, e o `layout.tsx` raiz também. O `noindex` do site é
decisão, não defeito, e espera o domínio próprio.

**Risco baixo — a rede de segurança existe.** 482 testes verdes, incluindo
`VehicleEditor.test.tsx`, `VehicleForms.test.tsx`, `useVehicleDraft.test.tsx`,
`PhotoGallery.test.tsx`, `PhotoUpload.test.tsx`, `templates.test.ts`, `feedback.test.ts`,
`masks.test.ts`, `status.test.ts`, `access-denied.test.ts` e `vehicle-art-data.test.ts`. Uma
reformulação que mantenha os contratos tem verificação imediata. **Este é o maior ativo do projeto
para suportar a mudança.**

---

## 11. Componentes que podem ser preservados

Avaliados por qualidade, não por conveniência:

**Preservar integralmente:**
- `useVehicleDraft.ts` — fila de escrita e versão. É infraestrutura correta, cara de refazer.
- `validation.ts` — `publishRequirements`, `allowedStatusTransitions`, `assertStatusTransition`.
  Fonte única, bem comentada.
- `policy.ts` — `artExportProblem`. Regra única, reutilizada pela página e pela rota de API.
- `masks.ts` — máscaras de preço, quilometragem e ano, com o cuidado da vírgula de centavos
  preservada (`:27-31`, que evita o erro de cem vezes).
- `feedback.ts` — tradução de erro de domínio para frase humana; impede vazamento de erro técnico.
- `service.ts` — concorrência otimista, auditoria, transações, limpeza de R2 compensatória.
- `art-photo` e `art-check` — proxy autenticado de mesma origem e trava de versão. Corretos.
- `SubmitButton.tsx` — pendência por botão e não por formulário. Detalhe pequeno, bem resolvido.

**Preservar o padrão, redesenhar a aparência:**
- **Confirmação em linha** em vez de modal. Funciona melhor no celular; manter.
- `ChipPicker` e `Combobox` — o conceito "toque para escolher, digite se precisar" é o certo; o que
  precisa mudar é **quantas** opções aparecem de uma vez (P1-5).
- `PhotoUpload` — câmera e galeria separadas, várias fotos num gesto, redução no navegador. Boa
  engenharia; só falta miniatura para o estúdio (P2-9).
- `SaveIndicator` — o conteúdo está certo; o **lugar** está errado (P0-1).
- `StatusFilter` — bom com contagens; sobram filtros para o dia a dia (§6.3).

**Rever a fundo:**
- `ArtCanvas.tsx` — a geometria em 43 condicionais não comporta modelos novos (P1-11). O caminho é
  um esquema de layout declarativo em `templates.ts`, com `ArtCanvas` reduzido a intérprete.
- `atendimento/page.tsx` — mistura instalação e operação (P1-7).
- `attendance.module.css` — deve consumir os tokens do painel, não duplicá-los (P2-5).

---

## 12. Recomendações preliminares

Sem implementar nada. Em ordem de execução sugerida:

**Antes de escrever código — 1 dia, custo zero em risco:**
1. Rodar **H4** (observação do dono no Vapo e aqui). É o insumo que falta para toda decisão de
   redesenho e é o item de maior retorno deste relatório.
2. Rodar **H1** (prévia vs exportação com rede lenta) e **H5** (comprimento real do campo Versão).

**Correções pontuais, alto impacto, baixo risco — não exigem redesenho:**
3. P0-1: mensagem de resultado junto ao botão tocado, nos quatro caminhos.
4. P0-2 e P1-1: medir o texto e dar `ellipsis` à caixa do título.
5. P2-3: um token de borda com 3:1.
6. P1-8: confirmação em "Excluir conversa", no padrão em linha já usado no painel.
7. P2-4: deixar a trava de confirmação do servidor realmente alcançável.

**Mudanças de experiência — exigem decisão de produto:**
8. P1-3: prévia e controles na mesma tela no celular.
9. P1-12: compartilhamento nativo (ver §13).
10. P1-4 e P1-5: uma ação primária por seção; reduzir as opções visíveis de uma vez.
11. P1-9: busca no estoque.
12. P1-7: separar configuração de WhatsApp do atendimento.
13. P1-10: decidir, com a loja, se arte de rascunho passa a ser permitida com marca de prévia.

**Mudanças estruturais — pré-requisito para a Etapa 6:**
14. P1-11: esquema de layout declarativo para os modelos de arte.
15. P2-10: persistir a arte (necessário para publicação automática, §13).

---

## 13. Etapa 6 — novas necessidades registradas como requisitos futuros

**Nada aqui foi implementado.** Registro de requisito, com as dependências reais encontradas.

### 13.1 Artes comemorativas

Pedido: modelos para datas comemorativas, logomarca automática, personalização simples, prévia,
compartilhamento rápido.

**Dependências descobertas nesta auditoria** (§6.6 e §4.8) — todas bloqueantes:

| # | Barreira | Onde |
|---|---|---|
| 1 | A arte exige um `vehicleId`; a rota é filha do veículo | `vehicle-art-data.ts:8-21`; `/admin/veiculos/[id]/arte` |
| 2 | `artExportProblem` recusa peça sem veículo publicado, marca, modelo, ano e preço | `policy.ts:6-8` |
| 3 | A geometria vive em 43 condicionais; `templates.ts` só tem rótulos, sem esquema de layout | `ArtCanvas.tsx:47-78`; `templates.ts:11-18` |

A logomarca automática já funciona e pode ser reaproveitada (`ArtCanvas.tsx:121-123`, com texto de
reserva quando a imagem não carrega). A prévia também. O que não existe é um caminho de arte **sem
veículo** e um sistema de modelos **com dados de layout**.

### 13.2 Compartilhamento — viabilidade real por plataforma

O enunciado pede para distinguir compartilhamento nativo de publicação automática. A distinção é
decisiva, porque o custo difere em uma ordem de grandeza.

**Compartilhamento nativo (Web Share API Level 2) — viável, baixo custo**

`navigator.share({ files: [...] })` entrega o arquivo à folha de compartilhamento do sistema, que
oferece WhatsApp, Instagram, Facebook e o que mais estiver instalado. Exige HTTPS, gesto do usuário
e `navigator.canShare({ files })` como teste de suporte. Funciona em Chrome no Android e Safari no
iOS; **não** funciona em navegador de desktop de forma confiável — logo o botão "Baixar" continua
necessário como alternativa.

Encaixe no código atual: o `Blob` já existe em `ArtEditor.tsx:49`, hoje consumido só por um link
`<a download>`. É o ponto natural de entrada e **não exige persistir a arte**.

**Publicação automática — viável para Instagram e Facebook, com condições pesadas**

| Plataforma | O que é possível | Condições |
|---|---|---|
| **WhatsApp** | **Não existe** publicação automática. `wa.me/?text=` compartilha **só texto e link**, nunca imagem. Enviar imagem exige a Cloud API — que **envia para um número**, não publica para o público | Cloud API já integrada no projeto (`src/server/whatsapp/`) — mas para conversa, não para divulgação |
| **Instagram** | Publicar em feed e Stories pela Content Publishing API | Conta **Business/Creator**, vinculada a uma Página do Facebook; revisão do app pela Meta (`instagram_content_publish`); **a imagem precisa estar numa URL pública acessível à Meta**; limite de publicações por período |
| **Facebook** | Publicar em Página pela Graph API | `pages_manage_posts` + revisão do app; token de Página |
| **TikTok** | Content Posting API | Auditoria e aprovação da TikTok; não é entrega automática imediata |

**Dependência que precisa ser dita antes de prometer:** a publicação automática no Instagram e no
Facebook exige que a imagem esteja em **URL pública**. Hoje a arte **não é guardada em lugar
nenhum** — é um `Blob` no navegador que vira download (§2.5). Portanto a publicação automática
depende de **persistir a arte em armazenamento público** (P2-10), o que é um requisito novo, não um
ajuste.

**Recomendação de escopo, para decisão:** o compartilhamento nativo resolve o problema real do dono
(sair do produto para achar o arquivo) a um custo pequeno e sem nenhuma dependência de aprovação
externa. A publicação automática resolve um problema menor a um custo muito maior — contas
Business, revisão de app pela Meta, armazenamento público e persistência de artes. **Não devem ser
prometidos no mesmo pacote.**

---

## 14. Limites desta auditoria

Ditos explicitamente, para que ninguém trate inferência como medição:

- **A auditoria é estática.** Nenhuma tela foi aberta em navegador, nenhuma arte foi gerada e
  comparada com a prévia, nenhum aparelho real foi usado. Tudo o que depende de tempo de rede, de
  memória do aparelho ou de fonte carregada está em §8.2 como hipótese, não como achado.
- **As medidas de tipografia foram obtidas reproduzindo o algoritmo do Konva em Python com as fontes
  do projeto**, não medindo no `measureText` do navegador. O algoritmo foi copiado da implementação
  instalada e as fontes são as reais, mas o peso 700 que o canvas usa não existe localmente em
  arquivo estático: as medidas de peso 400 e 900 enquadram o valor real (§4.3).
- **A comparação com o Vapo é inferida do código deste projeto.** Nenhuma tela do Vapo foi
  observada. H4 existe para corrigir isso.
- **O banco de produção não foi consultado.** Quantidade real de veículos, comprimento real do
  campo Versão e volume de fotos por veículo são desconhecidos; afetam a gravidade de P1-9, P2-9 e
  P0-2 (ver H5).
- **Os 3 arquivos de teste de integração não rodaram** (exigem banco). As garantias que eles cobrem
  — autorização e serviço de veículos de ponta a ponta — não foram verificadas nesta execução.
