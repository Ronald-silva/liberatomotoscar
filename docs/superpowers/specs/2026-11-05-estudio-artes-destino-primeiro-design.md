# Estúdio de artes: destino primeiro, foto como herói

**Data:** 05/11/2026
**Estado:** desenho aprovado em conversa; plano de execução a seguir
**Substitui as decisões de layout e de fluxo de:** `docs/liberato-inteligente/04-PLANO-ESTUDIO-ARTES.md` (o restante daquele documento — escolha do Konva, limites comerciais, política de rascunho — continua valendo)

---

## 1. Intenção e o porquê

O estúdio de artes existe e funciona: gera JPEG na dimensão exata, serve foto privada do R2 por rota autenticada, confere a versão do anúncio antes de entregar e já foi usado para publicar de verdade. O problema não é de funcionamento, é de **qualidade da peça e de fluxo**.

Duas causas de raiz foram medidas na auditoria de 05/11/2026:

**(a) A regra de composição inverte herói e apoio.** `art-layout.ts` declara que "a foto é o bloco elástico — quem cede é a imagem, nunca o texto". A regra garante que nada seja cortado, e isso foi um ganho real contra a versão de coordenadas fixas. Mas numa arte de veículo o que vende é a foto. Rodando o motor atual com medição equivalente à de produção:

| formato | foto (título curto, 4:3) | foto (título longo, retrato) |
| --- | --- | --- |
| feed 1080×1350 | 732×549 → **27,6% da arte** | 353×470 → **11,4%** |
| quadrado 1080×1080 | 372×279 → **8,9%** | 174×232 → **3,5%** |
| story 1080×1920 | 908×681 → **29,8%** | 452×602 → **13,1%** |
| tiktok 1080×1920 | 669×502 → **16,2%** | 389×519 → **9,7%** |

Uma parede de texto com um selo do veículo no meio. É isso que o dono descreveu como "totalmente desalinhado", e está correto.

**(b) O formato é escolhido separado do destino.** O arquivo sai como `liberato-<slug>-story.jpg` sem vínculo nenhum com onde vai ser postado. Um 9:16 enviado ao Feed é recortado ao centro e perde logo e rodapé; um 4:5 no Status do WhatsApp é recortado em cima e embaixo. E hoje formato e plataforma são escolhidos em **dois lugares diferentes da tela**, sobrescrevendo-se mutuamente — a prévia muda sozinha debaixo do operador e invalida o arquivo já preparado. É isso que o dono descreveu como "sai com textos cortados", e também está correto.

**Por que agora:** o dono quer ofertar este app como produto. Peça desalinhada e corte no compartilhamento são exatamente o que um comprador vê primeiro.

---

## 2. Objetivos

1. **Cada destino produz uma peça precisamente correta.** Nenhum texto fora da área livre da interface da rede, em nenhuma combinação de conteúdo, situação e proporção de foto.
2. **A foto é o herói da composição.** Ela preenche a peça.
3. **Publicar é um toque** a partir de uma prévia que já está certa.
4. **O formato é derivado do destino**, nunca escolhido à parte.
5. **O operador consegue conferir** que o texto não disputa espaço com os ícones da rede, vendo isso na tela antes de publicar.
6. **A identidade da loja é dado**, não código.

### Não-objetivos

- Editor gráfico livre (arrastar, redimensionar, rotacionar elementos).
- Publicação automática nas redes. Não há API envolvida; o menu nativo do aparelho continua sendo o caminho.
- Vídeo, Reels, carrossel de múltiplas imagens.
- Preço promocional com desconto, validade e trilha de aprovação. Segue **explicitamente fora**, como no P2.
- Banco multi-tenant, tela de administração de loja, upload de logo.
- Legenda com IA. O gerador determinístico atual fica.
- Persistir as artes geradas no R2, histórico de artes.

### Anti-objetivos (fracasso mesmo se funcionar)

- A peça continuar parecendo montada por amador — texto demais, veículo de menos.
- Qualquer texto cortado ou coberto pela interface da rede, em qualquer destino.
- O fluxo ficar com **mais** toques do que hoje.
- Perder as travas comerciais: veículo vendido parecendo oferta disponível, desconto inventado, rascunho escapando como peça comercial.
- Regredir correções já conquistadas no celular (ver §7).

---

## 3. Decisões tomadas

### 3.1 Tomadas pelo dono

| Decisão | Conteúdo |
| --- | --- |
| **Destinos** | Quatro: Feed Instagram/Facebook (1080×1350), Stories Instagram/Facebook (1080×1920), Status do WhatsApp (1080×1920, zona segura própria), TikTok foto vertical (1080×1920). **O quadrado 1:1 sai** — é hoje o pior layout dos quatro e o feed 4:5 o substitui nas mesmas redes. |
| **Composição** | Foto *full-bleed* com véu: a foto preenche a arte inteira, um degradê escuro no rodapé dá leito ao texto, e o texto mora dentro da área segura do destino. |
| **Multi-loja** | Deixar o caminho aberto: a identidade (tema, logo, telefone, hashtags) sai do código e vira dado, **sem** tela de administração e **sem** banco multi-tenant nesta rodada. |
| **Confirmações** | Manter a caixa de "confirmei/autorizo" apenas no **texto auxiliar livre** escrito pelo operador — é ali que se inventa desconto, garantia e financiamento. A legenda gerada/editada deixa de exigir confirmação: ela é lida na tela antes de sair. |

### 3.2 Minhas, para o dono conferir ao ler

Nenhuma destas foi acordada em conversa. São chamadas minhas, e estão marcadas para ele poder discordar.

1. **Status do WhatsApp ganha área segura própria**, distinta do Stories do Instagram. Hoje reusa `story` sem distinção, e as duas interfaces não são iguais.
2. **A prévia mostra um fantasma da interface da rede** por cima da arte — avatar e caixa de resposta no Stories, trilha de ícones e legenda no TikTok, linha de ações no Feed — com um interruptor para esconder. É o que torna a área segura verificável em vez de dogma, e é a resposta direta ao pedido "para não competirem com os ícones da plataforma". **O fantasma usa formas neutras, nunca a marca ou o logo das plataformas** (risco de marca registrada).
3. **O fantasma e a área segura vêm do mesmo dado.** Se forem duas fontes, divergem na primeira correção.
4. **A renderização sai da prévia visível.** Hoje `stageRef` aponta para o palco que está na tela, então só é possível exportar o formato visível. Passa a existir um palco oculto que renderiza os quatro destinos em sequência.
5. **A legenda viaja no compartilhamento e vai para a área de transferência no mesmo toque.** Vários destinos descartam o texto do `ShareData`; copiar junto é o que garante que ela esteja à mão no aplicativo. Elimina a etapa de abrir o `<details>`, escolher a rede de novo e copiar à mão.
6. **O nome do arquivo carrega o destino:** `liberato-<slug>-<destino>.jpg`. Na galeria do celular o operador precisa distinguir.
7. **Os seis modelos colapsam.** `new`, `highlight` e `offer` diferem só no texto do selo e usam paleta idêntica; `reserved` e `sold` são situação do cadastro, não escolha; `classic` é tema claro, que não sobrevive a um véu escuro sobre foto. Proposta: o "modelo" deixa de ser escolha de layout e passa a ser **escolha de selo** (um rótulo), e a situação do cadastro governa o tratamento de reservado/vendido. Isso remove uma opção visível ao operador — é a chamada que mais merece o olhar do dono.
8. **No Feed, todo o conteúdo fica dentro do quadrado central.** A grade do perfil recorta 4:5 para 1:1 (y de 135 a 1215 em 1350), e hoje o rodapé do texto termina em y=1294 — fora do recorte. A grade é onde o visitante decide tocar, então tanto a base (150) quanto o topo (150) do Feed respeitam o recorte: a logo também precisa aparecer inteira na grade. Custo: sobra uma faixa de foto acima e abaixo do conteúdo. Aceito o custo.

### 3.3 Minhas, decididas depois da revisão de quem constrói

Um revisor leu este documento como se fosse planejar a execução e apontou nove pontos cegos. Três voltaram ao dono (§12). Estes seis resolvi aqui, na direção conservadora sempre que havia trava comercial em jogo.

9. **A barra de destinos seleciona e pré-visualiza; publicar é um botão só.** Quatro botões que disparam o menu nativo direto tirariam do operador a chance de conferir a peça antes de publicar — o oposto do que esta rodada existe para resolver. Então: uma fileira de quatro fichas de destino que trocam prévia, área segura, fantasma e legenda instantaneamente (o arquivo já está pronto), e um botão primário **"Publicar no {destino}"**. Abrir a tela no último destino usado e tocar o botão primário é **um toque**; trocar de destino antes é dois. Honesto, e continua muito abaixo dos seis de hoje.
10. **"Baixar" permanece, como ação secundária do destino selecionado.** É hoje o único caminho em três situações reais que o §7 manda não regredir: desktop sem Web Share, painel aberto por HTTP no IP da rede local (`shareSupport === 'insecure'`) e navegador sem `navigator.share`. As mensagens específicas dessas três situações ficam. Quando `exportProblem` barra a peça comercial, a prévia continua aparecendo e **nada é pré-renderizado** — não há arquivo a preparar.
11. **O selo de reservado/vendido continua sobre a foto, e agora medido.** O §4.5 ia movê-lo para dentro da coluna de texto; o revisor observou, com razão, que uma pílula no rodapé é garantia bem mais fraca que uma tarja sobre o veículo, e o anti-objetivo "veículo vendido parecendo oferta disponível" é trava comercial. Com a foto agora full-bleed há espaço de sobra: a tarja fica, atravessando a largura da coluna de conteúdo, com véu próprio — mas passa a ser um bloco medido com `fitLines`, que era o defeito real. Também seguem: o filtro de `templatesForStatus()` (vendido e reservado só oferecem os próprios rótulos, nunca "Destaque da semana"), a troca do rótulo para "ESTOQUE LIBERATO" e a **supressão do preço do vendido**.
12. **A tipografia trava nos pesos 400 e 900.** O revisor encontrou um furo na proposta do §6: os arquivos em disco são `Archivo-Regular.ttf` (wght 400) e `Archivo-Black.ttf` (wght 900), mas o layout pede 700 e 800, e o Konva mapeia qualquer peso ≥ 600 para `bold`, que o navegador resolve em 700. Medir com a tabela do 900 não mediria o que embarca — a correção não entregaria a fidelidade que é o motivo dela. Decisão: a arte passa a usar **somente 400 e 900**, exatamente as instâncias que estão em disco, com `fontStyle="900"` (o Konva repassa ao atalho `font` do canvas, que aceita peso numérico). Para um anúncio, 900 no título e no preço é mais forte que 700 — a mudança tipográfica é visível e é melhoria. A métrica de "Archivo Fallback" sai da conta: nada é desenhado antes de `fontsReady`, e os pesos 400 e 900 passam a ser carregados explicitamente.
13. **A área de transferência é disparada sem `await`, imediatamente antes do compartilhamento.** O §7 declara intocável "arquivo preparado antes do toque" porque o WebKit encerra a ativação do usuário; um `await` de clipboard antes do `share` consome exatamente essa ativação. Então: `void navigator.clipboard.writeText(legenda)` e, na mesma volta do laço, `navigator.share(data)` — sem `await` entre os dois. Falha de clipboard nunca aborta o compartilhamento. A legenda continua viajando no `text` do `ShareData` também, e o botão manual "copiar legenda" fica, dentro da área recolhida da legenda, como rede de segurança que não custa toque no caminho principal. O resultado na tela diz que a legenda foi copiada: sobrescrever a área de transferência é efeito visível, não silencioso.

---

## 4. A composição

### 4.1 O princípio que substitui o atual

Hoje: *a foto absorve a sobra.* Resultado medido: foto de 3,5%.

Novo: **o véu absorve a sobra.** A foto é full-bleed e nunca encolhe. O texto cresce para cima a partir da base da área segura, e o degradê que dá contraste a ele cresce junto, de graça. Um título de duas linhas não tira nada da foto — ele escurece 60 px a mais de uma foto que já estava ali.

É a mesma inversão de prioridade de antes (o texto nunca perde), mas agora o que cede é um gradiente, não o produto.

### 4.2 Estrutura da peça

```
┌─────────────────────────┐
│ ░ véu leve ░            │  ← logo no canto, sobre véu suave
│ [logo]                  │
│                         │
│      ▓▓▓▓▓▓▓▓▓▓▓▓       │  ← foto sangra até as quatro bordas
│    ▓▓▓▓▓  🏍  ▓▓▓▓▓▓    │
│      ▓▓▓▓▓▓▓▓▓▓▓▓       │
│                         │
│ ░░░░░░░░░░░░░░░░░░░░░░  │  ← véu cresce com o texto
│ (RECÉM-CHEGADO)         │
│ Honda CG 160 Titan      │
│ 2019 · 42.380 km · Preta│
│ ███ R$ 18.900,00 ███    │
│ (85) 99636-5664         │
│ Consulte disponibilidade│
└─────────────────────────┘
```

- **Foto:** aparece **sempre inteira**, nunca cortada, grande e centralizada na região acima do bloco de texto. O que sangra até as quatro bordas é uma **ampliação desfocada da própria foto**, servindo de fundo. Nunca há tarja preta nem veículo decapitado.

  Isto não é um caminho de exceção, é o caminho principal, e a consulta ao estoque de 05/11 é o motivo: **todas as fotos com dimensão registrada são 1600×1200, ou seja 4:3 paisagem** (7 fotos; outras 9 são importações antigas sem dimensão no banco). Três dos quatro destinos são 9:16. Um `cover` de 4:3 num 9:16 descarta cerca de 58% da largura — o resultado seria o meio do veículo e nada mais. Mesmo no Feed 4:5 o `cover` cortaria ~40%. Projetar em torno do `cover` e tratar o desfoque como exceção seria projetar para um estoque que não existe.

  `cover` direto, sem camada desfocada, fica como otimização para quando a proporção da foto já está a menos de ~15% da proporção do canvas — hoje, uma foto de celular em retrato num 9:16.

  Com a foto 4:3 ocupando a largura cheia, ela fica com ~42% da área num 9:16 e ~60% num 4:5, e o resto da peça é ela mesma desfocada. Contra os 9,7%–27,6% medidos hoje, é a diferença que o dono pediu.
- **Véu:** degradê do transparente até o quase-preto da marca na borda inferior, estendido cerca de 1,35× a altura do bloco de texto para que a primeira linha já nasça com contraste. Um véu suave e curto no topo dá leito à logo.
- **Bloco de texto:** ancorado na base da área segura, cresce para cima. De baixo para cima: observação, telefone, placa de preço, linha de dados, título, pílula do selo.
- **Logo:** canto superior esquerdo, dentro da área segura do topo. Entra no sistema de medição — hoje o `logo` do layout tem `width: 0` e nenhum teste confere se ele cabe.
- **Coluna de conteúdo:** centralizada dentro da caixa segura, não colada à esquerda. No TikTok, onde a margem direita é maior, a coluna fica deslocada à esquerda de propósito e isso lê como composição, porque não há mais fundo vazio à direita — há foto.

### 4.3 Quando o texto é grande demais

O véu absorve quase tudo, mas há um teto: o bloco de texto não passa de ~55% da altura segura, senão a peça volta a ser texto. Ao bater no teto, nesta ordem:

1. a observação sai (é a linha mais dispensável);
2. a linha de dados sai;
3. o título desce de corpo e aceita até 3 linhas.

**Em nenhuma hipótese uma palavra é descartada ou vira reticências.** `fitLines` já tem essa garantia e ela é mantida.

### 4.4 Contraste

Texto branco sobre foto só é legível por causa do véu. O véu precisa valer para a foto mais clara do estoque, não para a média. Decisão: o texto só é desenhado onde a opacidade composta do véu chega a **0,82 ou mais** sobre o quase-preto da marca, o que mantém o mínimo de 4,5:1 da WCAG mesmo sobre foto branca. Isso é verificável por teste (§6), não por olho.

### 4.5 Selo de reservado/vendido

Hoje esse selo é desenhado direto no `ArtCanvas`, fora do sistema de medição: 60 px fixos, faixa de 112 px, largura do painel da foto. Como o painel passou a abraçar a foto, no quadrado com foto retrato o painel tem 202–237 px e "RESERVADO" pede 334 px — **não cabe, e por ser palavra única o Konva não quebra: vaza para fora da peça**. Com o quadrado removido o caso exato desaparece, mas a causa (elemento de texto fora da medição) fica.

O selo passa a ser um bloco medido como qualquer outro, com `fitLines` próprio — mas **continua sobre a foto**, atravessando a largura da coluna de conteúdo e com véu próprio, pelo motivo explicado em §3.3.11: é trava comercial, e precisa da força de uma tarja. Mesma regra de medição para a marca d'água "PRÉVIA · NÃO PUBLICAR" de rascunho/arquivado, que hoje é desenhada em `width` cheia ignorando a área segura.

---

## 5. Os quatro destinos

Um destino é a unidade do novo modelo. Ele carrega: dimensão, área segura, fantasma da interface, variante da legenda, rótulo do botão e sufixo do arquivo.

| destino | dimensão | área segura (ponto de partida) | interface a respeitar |
| --- | --- | --- | --- |
| Feed IG/FB | 1080×1350 | t **150** · r 72 · b **150** · l 72 | nenhuma sobreposta; as margens são estéticas, e t/b de 150 põem todo o conteúdo dentro do recorte 1:1 da grade do perfil (y 135–1215) |
| Stories IG/FB | 1080×1920 | t 250 · r 72 · b **340** · l 72 | avatar e nome no topo, caixa de resposta e "enviar mensagem" na base |
| Status WhatsApp | 1080×1920 | t 220 · r 72 · b 260 · l 72 | avatar, nome e hora no topo; legenda e seta de resposta na base |
| TikTok | 1080×1920 | t 150 · r 180 · b 500 · l **120** | trilha de curtir/comentar/compartilhar à direita, legenda, música e navegação na base |

**Esses números são ponto de partida, não verdade.** Nenhuma plataforma publica mapa oficial em pixels; o que existe são guias de terceiros que divergem entre si — e essa divergência foi conferida em 05/11, não suposta:

- **Stories:** o topo converge em ~250 px em praticamente todas as fontes; a base aparece com mais frequência em **336–340 px** do que nos 300 em produção hoje. Daí o `b 340`. Para anúncio pago há quem recomende 400 por causa do botão de CTA — relevante só se a loja passar a impulsionar.
- **TikTok:** as laterais convergem em **~120 px de cada lado**, contra os 72 da esquerda hoje; daí o `l 120`. A trilha de ícones à direita é estimada entre 100 e 164 px, então os 180 seguem confortáveis. A base aparece entre 367 e 660 px dependendo da fonte; os 500 ficam no meio.
- **Status do WhatsApp:** nada utilizável foi encontrado. Segue estimativa minha.
- **Feed:** sem interface sobreposta; o que governa é o recorte 1:1 da grade.

Fontes consultadas: [socialsizes.io](https://socialsizes.io/instagram-stories-size/), [growthscribe.com](https://growthscribe.com/instagram-story-size/), [firstpier.com](https://www.firstpier.com/resources/instagram-ad-safe-zones), [reap.video](https://reap.video/blog/short-form-video-safe-zones), [poster.ly](https://www.poster.ly/tools/tiktok-safe-zone-checker), [trymypost.com](https://www.trymypost.com/blog/tiktok-ad-specs-2026-safe-zones). Nenhuma delas é spec oficial de plataforma.

A conferência definitiva é visual, no aparelho da loja, com o fantasma da interface ligado — e é para isso que o fantasma existe. Corrigir depois é trocar número num só lugar.

---

## 6. Testes

A auditoria encontrou um problema de credibilidade: **674 testes passam e a arte está ruim.** Dois motivos, ambos a corrigir.

**Fidelidade de medição.** O teste mede com `length × size × 0,62`; a produção mede com `ctx.measureText × 1,03`. São dois modelos diferentes, então o teste valida um layout que não é o que embarca — foi por isso que o estouro do quadrado (rodapé em y=1025 contra limite 1024) passou batido. Correção: o repositório já tem `Archivo-Regular.ttf` (wght 400) e `Archivo-Black.ttf` (wght 900) em disco, usados por `src/lib/og.ts`. Extrair deles uma tabela de avanço de glifos, versionada como fixture, e usá-la como `Measure` nos testes.

Isso só entrega fidelidade porque a arte passa a usar **exatamente esses dois pesos** (§3.3.12). Com 700/800 desenhados e 400/900 medidos, a correção seria cosmética.

**Invariantes de composição, não só de caixa.** Os testes atuais afirmam "nada saiu da área segura" e nada sobre a peça ser boa. Acrescentar, para um corpus dos títulos mais longos que existem de verdade no estoque, × 4 destinos × situações (publicado, reservado, vendido, rascunho) × proporções de foto (retrato 3:4, quadrada, paisagem 16:9, panorâmica 2:1):

- a foto cobre 100% do canvas;
- todo bloco de texto, incluindo logo, selo de situação e marca d'água, cabe na área segura;
- a opacidade composta do véu sob a primeira linha de cada bloco é ≥ 0,82;
- nenhuma palavra foi descartada e não há reticências;
- o bloco de texto não passa do teto de altura;
- as margens laterais da coluna são iguais entre si;
- no Feed, **tudo** — logo inclusive — cabe no quadrado central 1080×1080 (y 135–1215). O invariante genérico de área segura não pega isso sozinho, por isso é um teste próprio.

**Exportação.** Decodificar o JPEG gerado e afirmar dimensão exata por destino.

---

## 7. O que não pode regredir

Correções recentes e caras, que o plano precisa preservar. Em caso de conflito entre uma melhoria daqui e um item destes, o item daqui perde e a conversa volta ao dono.

- **Foto do R2 por rota autenticada same-origin**, com busca em duas tentativas (repete em 5xx e em falha de rede), leitura como blob e `objectURL` — e as mensagens específicas de 403 (sessão expirada) e 502 (foto indisponível). Commits `4bd4a77`, `3138d40`.
- **Foto importada (`legacy_public`) servida pelo arquivo público direto**, sem passar pela rota autenticada, por causa do endereço interno do Railway. Commit `3138d40`, com teste em `arte/page.test.tsx`.
- **Arquivo preparado antes do toque.** Safari e outros encerram a ativação do usuário se o `navigator.share` esperar por canvas ou rede. Toda a arquitetura de prepare existe por isso.
- **Classificação do erro de compartilhamento:** `AbortError` é decisão da pessoa e não é falha; `NotAllowedError` e `TypeError` recebem frases próprias. Commit `92f9d0e`.
- **Conferência de versão do anúncio** antes de entregar, e revalidação periódica com a tela aberta.
- **Remedição quando a fonte chega.** `font-display: swap` faz o Konva quebrar o texto com a métrica errada; a chave `key={String(fontsReady)}` na camada força refazer. Observação: hoje só `bold 48px` é carregado explicitamente — carregar também o peso normal, que é usado pela linha de dados e pela observação.
- **`Konva.pixelRatio = 1`** e export em JPEG 0,92. PNG de foto de veículo passa de vários MB e a rede recomprime de qualquer forma.
- **Rascunho e arquivado não geram peça comercial**, e `artExportProblem` continua barrando cadastro incompleto.
- **"Preço em destaque" não inventa desconto.** O estúdio não deve ser apresentado como criador de ofertas promocionais.

---

## 8. Fluxo e tela

### 8.1 O fluxo hoje

Mínimo de seis interações: formato → foto → modelo → abrir `<details>` → escolher a rede outra vez → copiar legenda → compartilhar. Mais dois botões-âncora ("Ver prévia da arte", "Alterar opções") que existem porque a tela não cabe no celular — sintoma, não solução. Cada toque em formato ou modelo dispara re-render e uma ida à rede com 250 ms de espera. Nada é lembrado entre sessões.

### 8.2 O fluxo novo

O operador abre a tela e a arte **já está certa**: foto de capa, selo padrão e o último destino usado. Na base, quatro botões de destino. Um toque em "Publicar no Stories" entrega ao menu nativo o JPEG 1080×1920 com a área segura do Stories e a legenda do Stories, e põe a legenda na área de transferência no mesmo gesto.

Um toque. O formato se adequa no ato de compartilhar para a plataforma desejada — que é exatamente o que o dono pediu.

**Nota técnica importante:** o navegador **não pode saber** qual aplicativo a pessoa escolheu no menu nativo ([Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)). Então "adequar no ato do compartilhamento" se realiza como **um botão explícito por destino**, cada um já com o arquivo certo pronto, e não como detecção do aplicativo escolhido. O efeito para o operador é o desejado; a etapa de escolher formato desaparece.

Para que todo botão responda no mesmo toque, os quatro arquivos são renderizados em segundo plano logo que foto e fonte estão prontas, em sequência, num único palco oculto reaproveitado (≈300 ms e ≈400 KB cada — folgado para celular). Se o toque chegar antes do arquivo daquele destino, ele é renderizado na hora; se a ativação do usuário se perder nesse caminho, a tela pede um segundo toque em vez de falhar em silêncio.

### 8.3 A tela

Celular é o caso primário: o operador compartilha do aparelho da loja.

- **Prévia primeiro**, largura cheia, com o fantasma da interface do destino selecionado e um interruptor para esconder.
- **Fileira de quatro fichas de destino**, que trocam prévia, área segura, fantasma e legenda instantaneamente.
- **Um botão primário "Publicar no {destino}"** e um secundário **"Baixar"**, ambos do destino selecionado (§3.3.9 e §3.3.10).
- **Controles secundários recolhidos:** foto (carrossel), selo, texto auxiliar.
- **Legenda** mostrada como texto pronto com um "editar" discreto. Não exige mais confirmação; o texto auxiliar livre continua exigindo.
- **Sai:** o passo de formato, o seletor de plataforma de dentro da legenda, os dois botões-âncora, as legendas numeradas "1." a "4." (a numeração impõe sensação de formulário a uma tela que deveria ser uma peça com controles).
- **Fica lembrado** no aparelho: último destino e último selo. Leitura e escrita protegidas por `try/catch`, e a tela funciona sem isso.

---

## 9. Identidade como dado

Um módulo de identidade — `BrandKit` — passa a carregar nome da loja, logo em positivo e negativo, paleta (fundo, tinta, apoio, realce, chip, véu), telefone de exibição e hashtags. O estúdio lê de lá; nada de cor ou telefone cravado no componente. Sem tela de administração, sem tabela nova, sem upload: só a extração do que hoje está espalhado entre `templates.ts`, `ArtCanvas.tsx` e `src/data/store.ts`.

É o investimento mínimo que torna "ofertar a outra loja" uma troca de dado em vez de uma refatoração do layout.

---

## 10. O que fica a cargo de quem constrói

- Paradas exatas e rampa de opacidade do degradê do véu, respeitando o piso de 0,82 sob texto.
- Como produzir o fundo desfocado: filtro de blur do Konva (exige `cache()`) ou cópia ampliada com opacidade baixa. A escolha depende de desempenho medido em aparelho real, não de preferência.
- Desenho do fantasma de cada interface, em formas neutras.
- Se os seis modelos colapsam exatamente como proposto em §3.2.7 — a redução é minha chamada, e merece uma passada visual antes de virar código.
- Se a foto precisa de escolha de foco (topo/centro/base) além do critério automático de `cover` contra `contain`+desfoque. Começar sem; acrescentar se a passada visual pedir.
- Ordem e texto exatos das dicas na tela.

## 11. Riscos

- **Marca registrada.** O fantasma da interface não desenha logo nem marca de plataforma nenhuma. Formas.
- **Veículo cortado pelo `cover`.** Mitigado pelo limiar que troca para `contain` sobre fundo desfocado. Precisa de passada visual com fotos reais do estoque — inclusive as de celular em retrato, que são o caso difícil.
- **Memória no celular.** Quatro palcos de 1080×1920 ao mesmo tempo não cabem com folga; a renderização é sequencial em um palco só, liberando entre destinos.
- **Números de área segura.** São estimativas declaradas. O fantasma é o instrumento de conferência, e a aceitação é no aparelho da loja.
- **Aceitação comercial.** Peça nova em todos os destinos precisa de aprovação do dono da loja antes de virar material de venda do produto. Não é aceite técnico.

## 12. Pendências que voltam ao dono

Três pontos levantados na revisão de execução que não são meus para decidir. **O plano não fecha sem eles**, e cada um tem um caminho provisório anotado para o caso de a resposta demorar.

### Respostas do dono, 05/11/2026

**12.1 — RESPONDIDO: Android e iPhone, os dois.** Então o WebKit deixa de ser caso secundário e passa a ser a restrição que governa. Consequências que entram no plano:

- O desfoque **não** pode usar o filtro de blur do Konva, que é um stack blur em JavaScript: sobre um nó de 1080×1920 ele custa segundos num iPhone. Usar `context.filter = 'blur(Npx)'` dentro de um `sceneFunc` próprio (acelerado, Safari 16.4+), com recuo de reduzir-e-reampliar a foto quando `filter` não existir. Isso deixa de ser escolha de quem constrói (§10) e passa a ser decisão tomada.
- Um único palco oculto reaproveitado, renderizando os quatro destinos **em sequência** e liberando entre eles — nunca quatro palcos vivos. Com `pixelRatio = 1` isso mantém ~2,1 M px de canvas por vez, dentro do que o WebKit tolera; quatro palcos simultâneos não estariam.
- A renderização sob demanda com segundo toque é implementada **desde o começo** como caminho de recuo, não deixada para depois.
- O "≈300 ms e ≈400 KB cada" do §8.2 segue sendo estimativa minha e precisa de medição nos dois aparelhos antes de ser citado como fato.

**12.2 — RESPONDIDO: sim, consulta somente-leitura autorizada, e já executada em 05/11.** O corpus real está em §13. Ele corrigiu duas suposições deste documento (a dominância do 4:3 e qual campo é o que estoura), o que é exatamente o motivo pelo qual a pergunta importava.

**12.3 — RESPONDIDO: segue o provisório.** Quatro destinos, e a legenda do Feed emite `Anúncio: {publicUrl}` sempre que a URL existir, aceitando que no Instagram ela é lida e não tocada. Sem sub-seletor IG/FB.

---

### Registro original das pendências

**12.1 — Aparelho de aceitação e quem faz a passada visual.** O §10 delega a escolha da técnica de desfoque a "desempenho medido em aparelho real", e o §11 lista memória de celular como risco. Delegar à medição não é delegar ao gosto: sem saber se é Android/Chrome ou iPhone/Safari não há como avaliar os limites de área e de memória de canvas do WebKit, que é exatamente onde quatro renderizações sequenciais de 1080×1920 falham primeiro. O número "≈300 ms e ≈400 KB cada" do §8.2 é estimativa minha, não medição. Também é preciso saber quem roda as quatro conferências visuais de que o documento depende (colapso dos modelos, áreas seguras, limiar `cover`/`contain`, aceite comercial). *Provisório:* assumir Android/Chrome, pré-renderizar os quatro, e tratar a renderização sob demanda com segundo toque como caminho de recuo já implementado.

**12.2 — Corpus de títulos reais.** O §6 pede "os títulos mais longos que existem de verdade no estoque" como eixo da matriz de testes, e não há seed nem fixture de estoque no repositório — o estoque real está no banco. Se o corpus for inventado, os testes voltam a validar um layout que não é o que embarca, que é o defeito que o §6 existe para corrigir. *Provisório:* derivar o pior caso dos limites do schema, que é mais largo que a realidade e portanto conservador, e substituir pelo corpus real quando ele chegar. Os títulos são marca, modelo e versão — não há dado pessoal envolvido.

**12.3 — Legenda: Instagram e Facebook juntos, e o link do anúncio.** Hoje `createCaption` distingue quatro plataformas, e `facebook` é a única que emite `Anúncio: {publicUrl}`. Fundir IG e FB em "Feed IG/FB" e "Stories IG/FB" obriga a escolher: o link desaparece de todas as legendas, passa a sair também no Instagram (onde não é clicável), ou volta um sub-seletor IG/FB — que é justamente o toque que o §8.2 promete eliminar. É escolha comercial: decide se o estúdio continua mandando tráfego para o site. Cruza com a decisão de o site seguir `noindex` até o domínio próprio chegar, e com o fato de `publicUrl` já ser `null` quando `SITE_URL` não é https. *Provisório:* manter quatro destinos e emitir o link na legenda do Feed sempre que `publicUrl` existir, aceitando que no Instagram ele é lido e não tocado.

---

## 13. O corpus real do estoque (consulta somente-leitura, 05/11/2026)

Extraído do banco configurado com `SELECT` apenas. Nenhum dado pessoal envolvido: marca, modelo, versão, ano, quilometragem, cor, preço, situação e dimensão de imagem.

**Títulos de arte (marca + modelo), do mais longo:**

| n | título | situação | linha de dados | preço |
| ---: | --- | --- | --- | --- |
| 18 | Volkswagen Saveiro | published | 2024 · 56.000 km · Branca | 6.999.900 |
| 17 | Yamaha Lander 250 | published | 2023 · 23.218 km · Vermelho | 2.530.000 |
| 14 | Yamaha Crosser | draft | — · — · Vermelha e preta | 1.750.000 |
| 12 | Yamaha Fazer | published | 2014 · 72.000 km · Branco | 1.050.000 |
| 11 | Fiat Strada | published | 2016 · 89.000 km · Cinza-escuro | 6.700.000 |
| 11 | Honda Titan | published | 2013 · 70.760 km · Vermelho | 1.150.000 |
| 9 | Honda Pop | draft | — · 660 km · Branca com banco vermelho | 1.370.000 |
| 9 | Honda Fan | draft | 2015 · 84.000 km · Preta | 1.099.000 |

**O que isso corrige nas suposições deste documento:**

1. **O título não é o campo que estoura.** O maior título real tem 18 caracteres; eu vinha estressando o layout com 38. Entre os veículos descartados o título chegou a 50 caracteres, então o pior caso é real e fica no corpus — mas não é o caso comum.
2. **A cor é o campo perigoso.** É texto livre e produz "Branca com banco vermelho" (25), "Vermelha e preta", "Cinza-escuro". A linha de dados é `ano · km · cor`, então é ali que o estouro nasce. O corpus de teste precisa das cores reais, não de "Preta".
3. **Preço de carro é o caso de aperto.** Até 6.999.900 no estoque ativo e 46.000.000 entre descartados — "R$ 460.000,00" são 13 caracteres a 92 px, o que no TikTok (coluna de 828 px, placa de 776 px) chega perto do limite. A loja vende carros, então isso não é hipótese.
4. **Proporção de foto:** 7 fotos com dimensão, **todas 1600×1200 (4:3)**; 9 importações antigas sem dimensão no banco, cuja proporção só se conhece ao carregar. É a base da reescrita do §4.2.
5. **Distribuição por situação:** 5 publicados, 4 rascunhos, 16 descartados. O estoque ativo é pequeno — a matriz de teste não pode depender de volume, e os descartados são a única fonte de valores extremos.

**Defeito encontrado de passagem, fora do escopo da composição:** o veículo "Yamaha Lander 250" tem `version` = "Yamaha xtz Lander 250". O título do anúncio é `marca + modelo + versão`, então a legenda publicada hoje sai como **"🏍️ Yamaha Lander 250 Yamaha xtz Lander 250 • 2023"**, e o mesmo texto aparece no cabeçalho da tela de criar arte. A arte em si escapa porque usa só marca + modelo. É dado sujo no cadastro, mas o estúdio deveria resistir a ele: compor o título descartando repetição de marca e modelo já presentes na versão. Entra no plano como tarefa própria, pequena e independente.

---

## 14. Decisões assumidas por mim em 06/11, e as referências que as sustentam

O dono foi explícito: não tem conhecimento técnico para orientar as escolhas de design e não quer ser consultado sobre elas. Pediu que a ferramenta seja eficiente, que as peças sejam bonitas e façam diferença, e que eu modele em cima de referências de sucesso. As duas pendências de design que eu havia devolvido a ele ficam decididas aqui, por mim.

**14.1 — A tipografia trava em 400 e 900. Decidido: sim.** Título, preço e telefone em Archivo Black (900); linha de dados e observação em 400. Dois motivos que se somam: num anúncio o peso 900 tem mais presença que o 700 de hoje, e são exatamente as duas instâncias que existem em disco, o que torna a medição do teste idêntica ao que embarca (§6). Não há contrapartida — o 700 não estava ali por decisão, estava ali porque é onde o Konva cai quando se pede "bold".

**14.2 — Os seis modelos colapsam, e o tema claro sai. Decidido: sim.** "Recém-chegado", "Destaque da semana" e "Preço em destaque" têm paleta idêntica e diferem apenas no texto do selo — são um rótulo fantasiado de modelo. "Reservado" e "Vendido" são situação do cadastro, não escolha. "Tradicional" é tema claro e não sobrevive a um véu escuro sobre foto.

Resultado: **um único sistema visual**, o selo vira escolha de rótulo, e a situação do cadastro governa o tratamento de reservado/vendido. A variedade do feed passa a vir da foto, que é diferente em cada veículo e agora é a protagonista.

Isso não é perda de recurso, é a decisão que separa marca de colagem: num feed, moldura constante com conteúdo variável é o que faz as peças serem reconhecidas como da mesma loja. Seis molduras diferentes produzem seis lojas diferentes.

**14.3 — Em que me baseio.** Uma busca por orientação de criativos de concessionária em 05/11 devolveu conselho genérico de marketing (frequência de postagem, proporção de conteúdo promocional, revisar erros de digitação) e **nada sobre layout** — nenhuma fonte com especificação de hierarquia, posição de preço ou sobreposição de texto. Registro isso para não dar à composição um lastro que ela não tem por aí.

O que sustenta o desenho são padrões que eu sei nomear e que o leitor pode conferir olhando qualquer vitrine digital de veículo bem feita:

1. **Foto herói sangrando, véu, pilha de texto curta embaixo.** É a anatomia dos cartões de catálogo das grandes vitrines de veículo e, antes delas, dos cartões de conteúdo que todo mundo aprendeu a ler sem instrução.
2. **O preço é o elemento mais alto da hierarquia, numa placa sólida.** Em anúncio de veículo a decisão de parar o dedo é preço. Hoje o preço já tem placa — isso se mantém e se reforça: `fitLines` garante que ele nunca encolha por causa de outro bloco.
3. **A marca é pequena, discreta e sempre no mesmo lugar.** Logo grande compete com o produto; logo constante constrói reconhecimento. Posição fixa no canto superior esquerdo, dentro da área segura, em todos os destinos.
4. **Uma moldura, muitas fotos.** Ver 14.2.
5. **Conferência de área segura dentro da ferramenta.** Os gerenciadores de anúncio das próprias plataformas mostram pré-visualização com a interface sobreposta antes de publicar. O fantasma do §3.2.2 é isso, trazido para dentro do estúdio — e é a resposta concreta ao pedido "que não compitam com os ícones da plataforma".

**14.4 — Sobre a plataforma no geral.** O dono pediu que a plataforma esteja coesa, funcional e eficiente, não só o estúdio. Conferido em 06/11: a auditoria de 02/11 (`docs/auditorias/AUDITORIA-UX-ADMIN-LIBERATO.md`, 1041 linhas) e o plano que saiu dela (`docs/superpowers/plans/2026-11-02-painel-liberato-reformulacao.md`) **foram executados por inteiro** — as sete tarefas estão no código, dos commits `d4a9aa3` a `101c3a4`. A tarefa 2 daquele plano (medir o título da arte em vez de contar caracteres) foi superada por uma reescrita maior, que é justamente o `art-layout.ts` auditado aqui.

Além disso, `docs/PENDENCIAS_PAINEL.md` está **desatualizado no seu item mais grave**: afirma que "a vitrine pública continua lendo o catálogo estático", e a home já usa `listPublicVehiclesWithCover` e o detalhe `getPublicVehicleWithPhotos`, ambos do banco. Publicar no painel chega no site.

Conclusão: a coesão da plataforma não pede outra auditoria — ela teve a dela e o plano embarcou. O que resta ali é validação e deploy, não desenho. Por isso este plano fica no estúdio de artes, com uma tarefa final de conferência ponta a ponta no aparelho da loja e de atualização dos documentos defasados.
