# Showroom Noturno — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar a direção visual "Showroom noturno" — aprovada em mockup — a todas as telas da prévia da Liberato Motos Car, sem alterar conteúdo, rotas ou dados.

**Architecture:** O site é Next.js App Router com CSS puro num único `src/app/globals.css` e componentes sem estilo inline. A mudança é quase toda em tokens e regras de CSS; os componentes mudam só onde a direção exige marcação nova (logo com duas versões, navegação em pílula, palco da foto com reflexo, revelação por scroll). Nenhuma rota, nenhum dado e nenhum texto comercial muda. As imagens recortadas entram como arquivos novos em `public/images/recorte/`, gerados por um script versionado, e convivem com as fotos originais, que continuam servindo às imagens de Open Graph.

**Tech Stack:** Next.js 16.4.2 (App Router, Turbopack), React 19.3, TypeScript 5, CSS puro com custom properties, `next/font`, `motion` ^14.6.0 (já instalado), Pillow 10.2 para o recorte das fotos.

**Spec:** `docs/superpowers/specs/2026-10-23-direcao-showroom-noturno-design.md`

## Global Constraints

- **Sem framework de teste no projeto.** `package.json` tem `dev`, `build`, `start`, `lint` e nada mais. A entrega é visual e não existe asserção automática que prove "está bonito". Este plano **não usa TDD** nas tarefas de CSS; usa um portão de verificação fixo (abaixo). As duas tarefas que produzem artefato verificável por máquina — o recorte das fotos e a logo negativa — trazem um auto-teste no próprio script. Não instalar runner de teste para este trabalho.
- **Portão de verificação de toda tarefa visual**, nesta ordem: `npm run lint` → `npx tsc --noEmit` → `npm run build` → inspeção em navegador nas larguras **1360**, **800** e **390** px. A inspeção reprova se: houver rolagem horizontal; qualquer texto ficar sobre a foto da fachada no mobile; qualquer par de botões irmãos ficar com larguras diferentes na mesma linha; qualquer título quebrar em ponto pior que o atual.
- **Antes de escrever qualquer código Next.js**, ler o guia correspondente em `node_modules/next/dist/docs/` (exigência do `AGENTS.md` do projeto — esta versão tem mudanças de API em relação ao conhecimento de treino).
- A prévia continua `noindex` (`robots: { index: false, follow: false }` em `src/app/layout.tsx`). Nenhuma tarefa mexe nisso.
- `src/data/store.ts` é a fonte única de endereço, telefone e perfil do Google. Nenhuma tarefa duplica esses valores.
- Nenhum arquivo de maquete entra no commit: `public/__resp.html` e `.superpowers/` ficam fora (`.superpowers/` já está no `.gitignore`).
- Valores de cor fixados pela direção, usados literalmente: fundo `#08090C`, vermelho `#E0252F`, vidro `rgba(255,255,255,.055)` sobre borda `rgba(255,255,255,.10)`, card `linear-gradient(155deg, rgba(255,255,255,.075), rgba(255,255,255,.018))` sobre borda `rgba(255,255,255,.09)`, logo negativa clara `#F4F5F7` e vermelha `#E22A34`.
- Todo movimento novo precisa estar desligado sob `prefers-reduced-motion: reduce`.
- Commits em português, no padrão do repositório (`feat:`, `fix:`, `refactor:`), terminando com a linha de co-autoria já usada no projeto.

## Review Focus

Classes de entrada que a direção implica, que nenhuma tarefa exercita sozinha, e onde cada uma foi fixada:

1. **`backdrop-filter` não suportado.** A navegação, os botões fantasma e o card do veículo ficam ilegíveis se o navegador não aplicar desfoque — o fundo translúcido vira texto claro sobre foto clara. Fixado na Tarefa 3, passo "fallback `@supports not (backdrop-filter: blur(1px))`".
2. **Veículo claro sobre base escura.** Saveiro e Fazer são brancas; o recorte pode comê-las junto com o fundo. Fixado na Tarefa 5, no auto-teste que mede pixels opacos dentro da área do veículo em cada uma das sete fotos.
3. **Cartão sem foto recortada.** Se o recorte de um veículo falhar ou faltar, o card não pode renderizar um palco vazio. Fixado na Tarefa 6: o componente cai para a foto original em painel quando o recorte não existe.
4. **JavaScript desligado ou `motion` ainda carregando.** Elementos com revelação por scroll não podem nascer invisíveis, ou a página fica em branco sem JS. Fixado na Tarefa 7: estado inicial visível, animação só adiciona.
5. **Título longo em tela estreita.** Archivo é mais larga que a ExtraCondensed atual; "O PRÓXIMO CAPÍTULO COMEÇA AQUI." e "A GENTE SE ENCONTRA NA PARANGABA." são os dois piores casos. Fixado na Tarefa 2, no passo de recalibragem dos `clamp()`, verificado a 390px.

---

### Task 1: Logo em versão negativa

Primeira tarefa porque é o ativo que a Tarefa 3 consome e o único ponto já validado pelo dono do projeto de forma isolada.

**Files:**
- Create: `scripts/gerar-logo-negativa.py`
- Create: `public/logo-liberato-negativo.png` (gerado pelo script)
- Modify: `src/components/layout/Brand.tsx`

**Interfaces:**
- Consumes: `public/logo-liberato.png` (800×376 RGBA, desenho todo preto com listras vermelhas sobre transparência).
- Produces: `public/logo-liberato-negativo.png`, mesmas dimensões; `<Brand variant="negativa" | "positiva" />` com `variant` opcional e padrão `"negativa"`.

- [ ] **Step 1: Escrever `scripts/gerar-logo-negativa.py`**

Lê `public/logo-liberato.png`, percorre os pixels e, para cada pixel com `a > 0`: se `r - max(g, b) > 45`, grava `(226, 42, 52, a)`; senão grava `(244, 245, 247, a)`. Preserva o alfa original, que é o que mantém a suavização das bordas. Salva em `public/logo-liberato-negativo.png`.

- [ ] **Step 2: Adicionar o auto-teste ao final do mesmo script**

```python
def verificar(caminho):
    im = Image.open(caminho).convert('RGBA')
    vermelhos = claros = 0
    for r, g, b, a in im.getdata():
        if a == 0:
            continue
        if (r, g, b) == RED:
            vermelhos += 1
        elif (r, g, b) == CLARO:
            claros += 1
        else:
            raise AssertionError(f'cor inesperada {(r, g, b)}')
    assert vermelhos > 20_000, f'listras vermelhas sumiram: {vermelhos}'
    assert claros > 80_000, f'desenho claro sumiu: {claros}'
    assert im.size == (800, 376), im.size
    print(f'ok  vermelho={vermelhos}  claro={claros}')
```

- [ ] **Step 3: Rodar o script**

Run: `python3 scripts/gerar-logo-negativa.py`
Expected: imprime `ok  vermelho=…  claro=…` e cria `public/logo-liberato-negativo.png`

- [ ] **Step 4: Dar duas versões ao `Brand`**

Em `src/components/layout/Brand.tsx`, trocar a assinatura para `Brand({ priority = false, variant = 'negativa' }: { priority?: boolean; variant?: 'negativa' | 'positiva' })`. A `variant` escolhe o `src` (`/logo-liberato-negativo.png` ou `/logo-liberato.png`) e a classe (`brand-art brand-art--negativa` ou `brand-art brand-art--positiva`). Atualizar o comentário do componente, que hoje explica a placa branca e passa a explicar as duas versões.

- [ ] **Step 5: Tirar a placa branca do CSS**

Em `src/app/globals.css`, substituir a regra `.brand-art` (hoje `width: 168px; padding: 11px 14px; background: var(--white); border-radius: var(--radius);`) por uma que não tenha fundo nem padding; `.brand-art--positiva` mantém fundo branco, padding e raio para quando for usada sobre claro. Remover também o override de `.brand-art` no bloco `@media (max-width: 700px)`.

- [ ] **Step 6: Verificar**

Rodar o portão de verificação. A inspeção precisa mostrar a logo direto sobre o cabeçalho escuro, sem retângulo branco, no header e no rodapé.

- [ ] **Step 7: Commit**

```bash
git add scripts/gerar-logo-negativa.py public/logo-liberato-negativo.png src/components/layout/Brand.tsx src/app/globals.css
git commit -m "feat: usar a logo em versão negativa, sem placa branca"
```

---

### Task 2: Tipografia Archivo e recalibragem dos títulos

**Files:**
- Modify: `src/app/layout.tsx:8-18` (as duas chamadas de `localFont`)
- Modify: `src/app/globals.css` (bloco `:root`, regra de família dos títulos, todos os `clamp()` de título)
- Delete: `src/app/fonts/NotoSans-Regular.ttf`, `src/app/fonts/NotoSans-ExtraCondensedBlack.ttf`, `src/app/fonts/LICENSE-NOTO.txt`

**Interfaces:**
- Produces: as custom properties `--font-body` (Archivo), `--font-display` (Archivo) e `--font-mono` (Space Mono), consumidas por todas as tarefas seguintes.

- [ ] **Step 1: Ler o guia de fontes**

Run: `sed -n '1,120p' node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`
Serve para confirmar as opções de `next/font/google` nesta versão antes de escrever a chamada.

- [ ] **Step 2: Trocar as fontes em `src/app/layout.tsx`**

Substituir os dois `localFont` por `next/font/google`:

```tsx
import { Archivo, Space_Mono } from 'next/font/google';

const bodyFont = Archivo({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const displayFont = Archivo({ subsets: ['latin'], weight: '900', variable: '--font-display', display: 'swap' });
const monoFont = Space_Mono({ subsets: ['latin'], weight: '700', variable: '--font-mono', display: 'swap' });
```

E incluir `monoFont.variable` na `className` do `<html>`.

`next/font/google` baixa e auto-hospeda no build, o que exige rede durante `npm run build` — já verificado como disponível neste ambiente. Se um build offline for necessário, o caminho alternativo é baixar os `.woff2` do endpoint `https://fonts.googleapis.com/css2?...` com User-Agent de navegador moderno (≈35 KB para Archivo variável 400–900 no subconjunto latino) e voltar para `next/font/local`.

- [ ] **Step 3: Apagar os arquivos da Noto**

```bash
git rm src/app/fonts/NotoSans-Regular.ttf src/app/fonts/NotoSans-ExtraCondensedBlack.ttf src/app/fonts/LICENSE-NOTO.txt
```

- [ ] **Step 4: Ajustar a família dos títulos e o `letter-spacing`**

Em `globals.css`, no grupo `.hero h1, .section-title, .detail-title, .trade-title, .contact-title`, trocar o fallback `'Arial Narrow', sans-serif` por `sans-serif`, manter `font-weight: 900`, `letter-spacing: -.045em` e `line-height: .94`. Aplicar a mesma troca de fallback nas outras sete regras que citam `var(--font-display), 'Arial Narrow'` (`.proof-value`, `.vehicle-content h3`, `.vehicle-price`, `.step-number`, `.step h3`, `.detail-price`, `.detail-information h2, .detail-contact h2`, `.related h2`, `.related-link strong`, `.detail-specification h2`).

- [ ] **Step 5: Recalibrar os `clamp()`**

Archivo 900 é visivelmente mais larga que Noto ExtraCondensed Black: os mesmos tamanhos passam a ocupar mais linha. Reduzir o topo de cada `clamp()` de título até que, a 1360, 800 e 390 px, nenhum título quebre em ponto pior que o atual. Títulos em jogo: `.hero h1` (`clamp(3.75rem, 7.4vw, 7.4rem)` e os dois overrides em `@media`), `.section-title` (`clamp(3.3rem, 6.2vw, 6.25rem)` e override), `.trade-title`, `.contact-title`, `.detail-title`, `.detail-title--inventory`, `.detail-price`, `.vehicle-content h3`, `.detail-information h2, .detail-contact h2`.

- [ ] **Step 6: Levar os rótulos pequenos para a monoespaçada**

Aplicar `font-family: var(--font-mono), monospace` e `letter-spacing: .24em` em `.eyebrow`, `.vehicle-kicker`, `.section-index`, `.proof-label` e `.detail-label`. São os rótulos que a direção define como monoespaçados.

- [ ] **Step 7: Verificar**

Rodar o portão de verificação, com atenção especial ao item "nenhum título quebra em ponto pior que o atual" a 390 px, nos dois piores casos: "O PRÓXIMO CAPÍTULO COMEÇA AQUI." e "A GENTE SE ENCONTRA NA PARANGABA."

- [ ] **Step 8: Commit**

```bash
git add -A src/app/layout.tsx src/app/globals.css src/app/fonts
git commit -m "feat: trocar a tipografia do site para Archivo e Space Mono"
```

---

### Task 3: Sistema de material — tokens, vidro, raios e a navegação em pílula

**Files:**
- Modify: `src/app/globals.css` (bloco `:root`; `.button*`; `.site-header`, `.header-inner`, `.desktop-nav`, `.header-actions`; blocos `@media`)
- Modify: `src/components/layout/Header.tsx`

**Interfaces:**
- Consumes: `--font-body`, `--font-mono` da Tarefa 2; `<Brand variant="negativa" />` da Tarefa 1.
- Produces: tokens `--radius-pill`, `--radius-card`, `--radius-box`, `--glass-bg`, `--glass-line`, `--card-bg`, `--card-line`, `--glow-red`, consumidos pelas Tarefas 4, 6 e 7.

- [ ] **Step 1: Trocar os tokens de superfície e raio em `:root`**

Fundo `--bg: #08090C`; `--red: #E0252F`. Apagar `--radius: 0.25rem` e criar `--radius-pill: 999px`, `--radius-card: 30px`, `--radius-box: 18px`. Criar `--glass-bg: rgba(255,255,255,.055)`, `--glass-line: rgba(255,255,255,.10)`, `--card-bg: linear-gradient(155deg, rgba(255,255,255,.075), rgba(255,255,255,.018))`, `--card-line: rgba(255,255,255,.09)`, `--glow-red: 0 14px 38px -10px rgba(224,37,47,.75)`.

Apagar `--radius` força o compilador a apontar todos os usos: trocar cada `border-radius: var(--radius)` pelo token novo que couber — pílula em controles (`.button`, `.filter-list`, `.filter-button`), caixa nos painéis.

- [ ] **Step 2: Transformar os botões em pílulas**

`.button` recebe `border-radius: var(--radius-pill)`. `.button--red` ganha `box-shadow: var(--glow-red)`. `.button--outline` passa a ser vidro: `background: var(--glass-bg)`, `border-color: var(--glass-line)`, `backdrop-filter: blur(12px)`.

- [ ] **Step 3: Transformar o cabeçalho em pílula flutuante**

`.site-header` perde o `background: linear-gradient(...)` de borda a borda e vira um contêiner transparente. `.header-inner` passa a ser a pílula: `width: min(100% - 2.5rem, 1060px)`, `margin: 22px auto 0`, `padding: 9px 9px 9px 24px`, `background: var(--glass-bg)`, `border: 1px solid var(--glass-line)`, `backdrop-filter: blur(22px)`, `border-radius: var(--radius-pill)`, e `min-height` menor que os 100px atuais. A pílula não encosta em nenhuma borda.

- [ ] **Step 4: Dar fallback ao vidro**

```css
@supports not (backdrop-filter: blur(1px)) {
  .header-inner, .button--outline, .vehicle-card, .map-label, .hero-bottom {
    background: rgba(10, 12, 17, .92);
  }
}
```

Sem isto, em navegador sem `backdrop-filter` o texto claro da navegação cai sobre a foto clara da fachada.

- [ ] **Step 5: Ajustar o recuo do hero ao novo cabeçalho**

A pílula é mais baixa que o cabeçalho atual e está deslocada do topo. Recalcular `padding-block` de `.hero-content` (hoje `155px 125px`, com overrides a 800px e 700px) e de `.detail-hero` (hoje `145px`, override `130px`) para que o espaço entre a pílula e o título volte a ser o mesmo proporcionalmente.

- [ ] **Step 6: Conferir a navegação no mobile**

A 800px `.desktop-nav` já some. Verificar que a pílula continua com logo à esquerda e botão de WhatsApp à direita, sem apertar, a 390px — se faltar espaço, reduzir a altura da logo antes de reduzir o botão, porque o botão é o alvo de toque.

- [ ] **Step 7: Verificar**

Rodar o portão de verificação. Conferir também, com `backdrop-filter` desabilitado no navegador, que a navegação continua legível.

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/components/layout/Header.tsx
git commit -m "feat: adotar sistema de material em vidro e navegação em pílula flutuante"
```

---

### Task 4: Aplicar o material às superfícies restantes

Tarefa separada da 3 porque um revisor pode aprovar a navegação e reprovar o tratamento das seções internas, e vice-versa.

**Files:**
- Modify: `src/app/globals.css` (`.credibility`, `.filter-list`, `.filter-button`, `.step`, `.empty-state`, `.map-card`, `.map-label`, `.detail-highlights li`, `.detail-specification`, `.detail-label`, `.viewer`, `.viewer-controls button`, `.related-link`, `.related-thumb`, `.consent-banner`, `.hero-bottom`)

**Interfaces:**
- Consumes: os tokens da Tarefa 3.

- [ ] **Step 1: Arredondar e materializar os painéis**

Cada superfície hoje quadrada e opaca recebe raio e material: `--radius-box` e `--card-bg`/`--card-line` em `.step`, `.detail-highlights li`, `.detail-specification`, `.related-link`, `.empty-state`, `.viewer`, `.consent-banner`; `--radius-card` em `.map-card`; `--radius-pill` em `.filter-list`, `.filter-button`, `.detail-label`, `.viewer-badge` e nos botões redondos de `.viewer-controls`.

- [ ] **Step 2: Acender a luz vermelha no hero**

Adicionar a `.hero` um halo radial no canto superior direito, com a mesma receita do mockup: círculo de 900px, deslocado para fora da tela (`right: -280px; top: -420px`), `radial-gradient(circle, rgba(224,37,47,.20), transparent 62%)`, `pointer-events: none`, atrás do conteúdo e à frente do fundo. É a única fonte de luz colorida da página.

- [ ] **Step 3: Revisar as bordas de divisão**

`.credibility` e `.proof` dividem por linhas de 1px. Com cantos arredondados em volta, as linhas que chegam até a borda do contêiner ficam penduradas. Encurtar ou remover as divisórias que terminam fora de um painel.

- [ ] **Step 4: Verificar**

Rodar o portão de verificação. A inspeção reprova se sobrar qualquer canto reto em painel ou controle fora de `.vehicle-card` (que é da Tarefa 6).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: aplicar raios e material de vidro às seções internas"
```

---

### Task 5: Recorte das fotos de veículo

**Files:**
- Create: `scripts/recortar-fotos.py`
- Create: `public/images/recorte/*.webp` (sete arquivos, gerados)
- Modify: `src/data/inventory-vehicles.ts`

**Interfaces:**
- Consumes: os sete caminhos em `image` de `INVENTORY_VEHICLES` (`src/data/inventory-vehicles.ts`), todos PNG RGB 1448×1086 ou 1600×1200 com fundo branco chapado e sem canal alfa.
- Produces: o campo opcional `cutout?: string` em `InventoryVehicle`, preenchido com `/images/recorte/<slug>.webp` para cada veículo cujo recorte passe no auto-teste. A Tarefa 6 lê esse campo.

- [ ] **Step 1: Escrever `scripts/recortar-fotos.py`**

Recorte por preenchimento por inundação a partir das bordas, em Pillow puro (não há `numpy`, `rembg` nem ImageMagick neste ambiente). Receita já validada em maquete: sementes a cada 10px por toda a moldura da imagem, tolerância de cor 72 em distância euclidiana no RGB, e esmaecimento do alfa nos 22% inferiores com expoente 1.6 para dissolver a sombra de estúdio sem deixar emenda horizontal. Salvar como WebP com alfa.

O argumento do script é a lista de pares (origem, slug); ele lê os caminhos de `INVENTORY_VEHICLES` para não duplicar a lista.

- [ ] **Step 2: Adicionar o auto-teste ao script**

Duas asserções por foto, que é o que separa um recorte utilizável de um recorte que comeu o veículo:

```python
assert canto_transparente(im), f'{slug}: fundo não foi removido'
opacos = sum(1 for p in im.getdata() if p[3] > 200)
assert opacos > 0.06 * im.width * im.height, f'{slug}: só restaram {opacos} px opacos'
```

A segunda asserção é a que protege a Saveiro e a Fazer, que são brancas e correm o risco de ser removidas junto com o fundo.

- [ ] **Step 3: Rodar o script**

Run: `python3 scripts/recortar-fotos.py`
Expected: sete linhas `ok <slug> …` e sete arquivos em `public/images/recorte/`

- [ ] **Step 4: Inspecionar os sete recortes**

Compor cada WebP sobre `#08090C` e olhar. Reprova se houver franja branca em volta do veículo, se faltar pedaço do veículo, ou se a sombra de estúdio tiver virado uma mancha cinza com borda visível. Conforme a anti-meta do documento de direção, um recorte reprovado não entra: o veículo fica sem `cutout` e volta ao painel branco.

- [ ] **Step 5: Declarar o campo e preencher**

Em `src/data/inventory-vehicles.ts`, adicionar `cutout?: string;` à interface `InventoryVehicle` e preencher nos veículos aprovados. `image` continua existindo e continua servindo às imagens de Open Graph, que têm fundo claro.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: compila; as onze imagens OG continuam sendo pré-renderizadas.

- [ ] **Step 7: Commit**

```bash
git add scripts/recortar-fotos.py public/images/recorte src/data/inventory-vehicles.ts
git commit -m "feat: recortar as fotos do estoque do fundo branco"
```

---

### Task 6: Card do veículo com palco, brilho e reflexo

**Files:**
- Modify: `src/app/globals.css` (`.vehicle-card`, `.vehicle-image-wrap`, `.vehicle-image`, `.vehicle-number`, `.vehicle-type`, `.vehicle-facts`, `.related-thumb`, e os overrides em `@media`)
- Modify: `src/components/showcase/Showcase.tsx`
- Modify: `src/components/vehicles/InventoryDetail.tsx`

**Interfaces:**
- Consumes: `cutout?: string` da Tarefa 5; tokens da Tarefa 3.
- Produces: a classe `.vehicle-stage` (palco escuro com brilho e reflexo), reaproveitada na página de detalhe.

- [ ] **Step 1: Renderizar o palco quando houver recorte**

Em `Showcase.tsx`, quando `vehicle.cutout` existir, renderizar a foto dentro de `<div className="vehicle-stage">` com um segundo elemento `aria-hidden` para o reflexo; quando não existir, manter exatamente a marcação atual com `.vehicle-image-wrap` e o painel claro. É o que garante que um recorte reprovado na Tarefa 5 não quebre o card (Review Focus 3).

- [ ] **Step 2: Estilizar o palco**

`.vehicle-stage` substitui o fundo `#f5f5f3` por escuro, com brilho radial vermelho elíptico na base (`radial-gradient(ellipse at 50% 100%, rgba(224,37,47,.30), rgba(224,37,47,.05) 45%, transparent 70%)`) e `filter: drop-shadow(0 34px 42px rgba(0,0,0,.75))` no veículo. O reflexo é a mesma imagem com `transform: scaleY(-1)`, `opacity: .22` e `mask-image: linear-gradient(to top, transparent, rgba(0,0,0,.9))`.

- [ ] **Step 3: Arredondar o card**

`.vehicle-card` recebe `border-radius: var(--radius-card)`, `background: var(--card-bg)`, `border-color: var(--card-line)` e `backdrop-filter: blur(16px)`. Verificar que `overflow: hidden` continua cortando a foto no raio novo.

- [ ] **Step 4: Corrigir a cor dos rótulos sobre o palco**

`.vehicle-number` hoje é `#8b9099` porque ficava sobre painel claro; sobre o palco escuro volta a ser claro. `.vehicle-type` precisa continuar legível sobre o palco.

- [ ] **Step 5: Aplicar o mesmo palco no detalhe e nas miniaturas**

`InventoryDetail.tsx` e `.related-thumb` usam o mesmo tratamento, com a mesma condição de existir recorte.

- [ ] **Step 6: Verificar**

Rodar o portão de verificação. A inspeção reprova se o reflexo encostar na borda inferior do card, se o brilho vermelho vazar por cima do veículo, ou se algum veículo claro sumir no palco.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/components/showcase/Showcase.tsx src/components/vehicles/InventoryDetail.tsx
git commit -m "feat: exibir os veículos sobre palco escuro com brilho e reflexo"
```

---

### Task 7: Movimento

Última porque só faz sentido sobre o layout final, e porque é a parte mais fácil de reverter se o dono do projeto achar demais.

**Files:**
- Create: `src/components/motion/Reveal.tsx`
- Modify: `src/components/hero/Hero.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css` (bloco `@media (prefers-reduced-motion: reduce)`)

**Interfaces:**
- Consumes: `motion` ^14.6.0 (já em `dependencies`).
- Produces: `<Reveal delay?: number>{children}</Reveal>`, componente cliente que revela o filho quando ele entra na viewport.

- [ ] **Step 1: Ler o guia de componentes cliente**

Run: `sed -n '1,80p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
`motion` precisa de `'use client'`; confirmar a fronteira nesta versão antes de inserir o componente numa página servidor.

- [ ] **Step 2: Escrever `Reveal`**

`'use client'`. Usa `motion` com `whileInView` e `viewport={{ once: true, margin: '-80px' }}`, deslocamento vertical pequeno (16–24px) e opacidade. **O estado inicial é visível**: a animação só adiciona movimento, nunca esconde o conteúdo — sem isso, a página fica em branco com JavaScript desligado (Review Focus 4). Respeitar `useReducedMotion()` do próprio `motion`, retornando o filho sem animação.

- [ ] **Step 3: Escalonar a entrada do hero**

Em `Hero.tsx`, aplicar entrada escalonada no carregamento — eyebrow, título, descrição, botões, nesta ordem, com incremento de ~70ms. É a única entrada automática da página; o resto é por scroll.

- [ ] **Step 4: Envolver as seções**

Em `page.tsx`, envolver `Credibility`, `Showcase`, `Experience` e `Contact` em `<Reveal>`. Nada dentro do hero, que já tem a entrada própria.

- [ ] **Step 5: Elevar os cards no hover**

`.vehicle-card:hover` ganha `transform: translateY(-4px)` e sombra mais funda, com a transição usando `--duration` e `--ease` já existentes.

- [ ] **Step 6: Verificar o desligamento**

Com `prefers-reduced-motion: reduce` ativo no navegador, nenhuma das animações novas pode rodar — nem as do `motion`, nem a elevação no hover. Conferir também com JavaScript desligado que a página inteira continua visível.

- [ ] **Step 7: Verificar**

Rodar o portão de verificação.

- [ ] **Step 8: Commit**

```bash
git add src/components/motion/Reveal.tsx src/components/hero/Hero.tsx src/app/page.tsx src/app/globals.css
git commit -m "feat: adicionar entrada escalonada no hero e revelação por scroll"
```

---

### Task 8: Limpeza antes de apresentar

**Files:**
- Modify: `package.json`
- Delete: `public/images/hero-moto-campanha.png`, `public/images/carro-sedan.png`, `public/images/moto-adventure.png`, `public/images/moto-street.png` (se nenhum código os referenciar)
- Modify: `.env.example`, `README.md`

- [ ] **Step 1: Encontrar imagens órfãs**

Run: `for f in public/images/*.png public/images/*.jpeg; do n=$(basename "$f"); grep -rqF "$n" src/ || echo "órfã: $f"; done`
Expected: lista as imagens que nenhum código referencia.

- [ ] **Step 2: Apagar as órfãs confirmadas**

Só as que o passo 1 listou. `hero-moto-campanha.png` sozinha tem 1,9 MB.

- [ ] **Step 3: Remover dependências mortas**

Run: `for p in clsx tailwind-merge tailwindcss @tailwindcss/turbopack motion; do echo "== $p"; grep -rn "$p" src/ --include='*.ts' --include='*.tsx' | head -3; done`
`motion` passa a ser usada na Tarefa 7, então fica. Desinstalar as que não aparecerem: `npm uninstall <pacotes>`.

- [ ] **Step 4: Confirmar que nada de maquete entra**

Run: `git status --porcelain | grep -E "__resp|\.superpowers" || echo "limpo"`
Expected: `limpo`

- [ ] **Step 5: Registrar o `NEXT_PUBLIC_SITE_URL`**

Garantir que `.env.example` traz a variável e que o `README.md` diz, em uma linha, que sem ela a imagem de Open Graph aponta para `localhost`.

- [ ] **Step 6: Verificar**

Rodar o portão de verificação uma última vez, nas três larguras, na home e numa página de veículo.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remover imagens órfãs e dependências não usadas"
```

---

## Ordem e dependências

1 (logo) → 2 (tipografia) → 3 (material + navegação) → 4 (superfícies) → 5 (recorte) → 6 (palco) → 7 (movimento) → 8 (limpeza).

As Tarefas 1, 2 e 5 são independentes entre si e poderiam rodar em paralelo; 3 depende de 1 e 2; 4 depende de 3; 6 depende de 5 e 3; 7 depende de 6.
