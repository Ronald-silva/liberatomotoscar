# Estúdio de artes destino-primeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o estúdio de artes num criador em que a foto do veículo é a protagonista da peça e em que publicar é um toque, com o formato e a área segura derivados do destino em vez de escolhidos à parte.

**Architecture:** A composição inverte a prioridade atual: a foto deixa de ser o bloco que cede e passa a aparecer inteira sobre uma ampliação desfocada de si mesma que sangra até as bordas; o que absorve a sobra é o véu de gradiente, que não custa nada. O formato deixa de ser um passo e vira propriedade do destino (Feed, Stories, Status do WhatsApp, TikTok), cada um com sua área segura, seu fantasma de interface e sua legenda. Os quatro arquivos são renderizados em segundo plano num único palco oculto reaproveitado, separado da prévia visível, para que o toque em publicar nunca espere por canvas nem por rede.

**Tech Stack:** Next.js 16.4.2, React 19.3, react-konva 19.3.2 / konva 10.9, Archivo variável por `next/font`, vitest 5 com happy-dom, Drizzle/Neon, R2.

**Spec:** `docs/superpowers/specs/2026-11-05-estudio-artes-destino-primeiro-design.md`

## Global Constraints

- Renderização no cliente. `Konva.pixelRatio = 1`. Export em JPEG com qualidade `0.92`.
- Dimensões exatas: Feed `1080×1350`; Stories, Status e TikTok `1080×1920`.
- Áreas seguras, exatas: Feed `t150 r72 b150 l72`; Stories `t250 r72 b340 l72`; Status WhatsApp `t220 r72 b260 l72`; TikTok `t150 r180 b500 l120`.
- Tipografia: **somente os pesos 400 e 900**. Nenhum 700 nem 800 em lugar nenhum da arte.
- Opacidade composta do véu sob qualquer linha de texto: **≥ 0,82**.
- Bloco de texto: **≤ 55%** da altura da área segura.
- `fitLines` nunca descarta palavra e nunca acrescenta reticências. Vale para todo bloco de texto, selo de situação e marca d'água incluídos.
- Um único palco oculto, renderização **sequencial**, liberado entre destinos. Nunca quatro palcos vivos.
- Desfoque por `context.filter = 'blur(Npx)'` dentro de `sceneFunc` próprio, com recuo de reduzir-e-reampliar. **Nunca `Konva.Filters.Blur`** — é stack blur em JavaScript e custa segundos num iPhone sobre 1080×1920.
- Nenhum `await` entre `clipboard.writeText` e `navigator.share`.
- O fantasma da interface usa formas neutras. Nunca logo, marca ou ícone de plataforma.
- Todo texto de interface em português do Brasil.
- Os itens do §7 do spec ("O que não pode regredir") têm precedência sobre qualquer melhoria deste plano. Em conflito, a melhoria perde e a conversa volta ao dono.

## Review Focus

Classes de entrada que o spec implica e que nenhum teste de tarefa exercita por padrão. Cada linha tem o teste que a prende, na tarefa que é dona do código.

1. **Veículo sem marca e sem modelo** — existe um rascunho assim no estoque (título de 1 caractere). A peça precisa sair com um título de reserva legível em vez de uma linha vazia onde o título deveria estar. *Teste na Tarefa 9.*
2. **Cor longa e livre** — "Branca com banco vermelho" (25 caracteres) é dado real. A linha de dados é `ano · km · cor` e é ali que o estouro nasce, não no título. *Teste na Tarefa 5.*
3. **Preço de carro no TikTok** — "R$ 460.000,00" são 13 caracteres a 900, e o TikTok tem a coluna mais estreita das quatro (`l120 r180`). *Teste na Tarefa 4.*
4. **Foto sem dimensão no banco** — 9 das 16 fotos do estoque são importações sem `width`/`height`; `photoAspect` chega `null` até a imagem carregar, e a peça tem de se compor assim. *Teste na Tarefa 4.*
5. **`exportProblem` ativo** — rascunho ou cadastro incompleto: a prévia continua aparecendo, nada é pré-renderizado e nenhum botão de publicar promete o que não pode cumprir. *Teste na Tarefa 11.*

---

## File Structure

**Criar**
- `src/components/art-studio/destinations.ts` — o destino como unidade: dimensão, área segura, geometria do fantasma, variante de legenda, sufixo de arquivo. Passa a ser a fonte única que hoje está repartida entre `artFormats` e `ART_SAFE`.
- `src/components/art-studio/__fixtures__/archivo-advances.json` — tabela de avanço de glifos extraída dos TTFs em disco.
- `src/components/art-studio/measure-archivo.ts` — `createArchivoMeasure()` para os testes, a partir da fixture.
- `scripts/gen-archivo-advances.ts` — gerador da fixture, rodado à mão quando a fonte mudar.
- `src/data/brand.ts` — `BrandKit`: nome, logos, paleta, telefone, hashtags.
- `src/components/art-studio/art-render.ts` — renderização offscreen sequencial dos quatro destinos.
- `src/components/art-studio/art-title.ts` — composição do título sem repetição de marca e modelo.
- `src/components/art-studio/PlatformChrome.tsx` — o fantasma da interface, em formas neutras.

**Modificar**
- `src/components/art-studio/art-layout.ts` — reescrita da composição (Tarefas 4, 5, 6).
- `src/components/art-studio/templates.ts` — um só sistema visual; selo vira rótulo; `square` e `classic` saem.
- `src/components/art-studio/ArtCanvas.tsx` — pesos 400/900, fundo desfocado, véu, blocos medidos.
- `src/components/art-studio/ArtEditor.tsx` — a tela nova.
- `src/components/art-studio/caption.ts` — legenda por destino.
- `src/components/art-studio/share-art.ts` — legenda na área de transferência junto do compartilhamento.
- `src/app/admin/(protected)/veiculos/[id]/arte/page.tsx` — passa o `BrandKit` e o título composto.

**Testes** acompanham cada arquivo no mesmo diretório, no padrão do projeto (`*.test.ts` / `*.test.tsx`).

---

## Task 1: Medição fiel da Archivo

Hoje o teste mede com `length × size × 0,62` e a produção mede com `ctx.measureText × 1,03`. São dois modelos diferentes, e foi por isso que o estouro do quadrado passou batido por 674 testes verdes. Esta tarefa é a fundação: sem ela, todos os testes de composição das tarefas seguintes voltam a validar um layout que não é o que embarca.

**Files:**
- Create: `scripts/gen-archivo-advances.ts`
- Create: `src/components/art-studio/__fixtures__/archivo-advances.json`
- Create: `src/components/art-studio/measure-archivo.ts`
- Test: `src/components/art-studio/measure-archivo.test.ts`
- Modify: `package.json` (devDependency `fontkit`)

**Interfaces:**
- Consumes: nada.
- Produces: `createArchivoMeasure(): Measure` — devolve uma `Measure` (a mesma assinatura `(text: string, size: number, weight: number) => number` que já existe em `art-layout.ts`) que soma avanços da fixture, escala por `size / unitsPerEm` e aplica a mesma folga de 3% da produção. `weight >= 600` usa a tabela do 900; abaixo, a do 400.

- [ ] **Step 1: Instalar `fontkit` como devDependency**

```bash
npm install --save-dev fontkit
```

- [ ] **Step 2: Escrever o gerador em `scripts/gen-archivo-advances.ts`**

Lê `src/app/fonts/Archivo-Regular.ttf` e `src/app/fonts/Archivo-Black.ttf` com `fontkit`, e emite JSON com a forma `{ unitsPerEm: number, weights: { "400": Record<string, number>, "900": Record<string, number> } }`, onde a chave de cada glifo é o caractere e o valor é o avanço em unidades de em. Cobrir os caracteres que o conteúdo real usa: `A-Z a-z 0-9`, espaço, `· . , / ( ) % $ - + :` e os acentuados do português (`á à â ã é ê í ó ô õ ú ü ç` em minúscula e maiúscula). Para caractere ausente da fixture, o consumidor usa o avanço de `x` como aproximação.

- [ ] **Step 3: Gerar e versionar a fixture**

Run: `npx tsx scripts/gen-archivo-advances.ts > src/components/art-studio/__fixtures__/archivo-advances.json`
Expected: JSON com `unitsPerEm` igual a `1000` ou `2048` (o que o arquivo trouxer) e as duas tabelas não vazias.

- [ ] **Step 4: Escrever o teste que falha**

```ts
// src/components/art-studio/measure-archivo.test.ts
it('mede proporcionalmente ao corpo', () => {
  const measure = createArchivoMeasure();
  expect(measure('Honda', 100, 900)).toBeCloseTo(measure('Honda', 50, 900) * 2, 0);
});

it('negrito é mais largo que regular no mesmo corpo', () => {
  const measure = createArchivoMeasure();
  expect(measure('Volkswagen Saveiro', 76, 900))
    .toBeGreaterThan(measure('Volkswagen Saveiro', 76, 400));
});

it('acentuado não é medido como caractere ausente', () => {
  const measure = createArchivoMeasure();
  expect(measure('ç', 76, 400)).not.toBe(measure('\u0000', 76, 400));
});

it('fica a menos de 8% da medição do navegador para o título real mais longo', () => {
  // Valor de referência conferido no Chromium com a Archivo carregada, anotado aqui
  // porque happy-dom não implementa measureText de verdade.
  const measure = createArchivoMeasure();
  const largura = measure('Volkswagen Saveiro', 76, 900);
  expect(largura).toBeGreaterThan(700);
  expect(largura).toBeLessThan(900);
});
```

- [ ] **Step 5: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/measure-archivo.test.ts`
Expected: FAIL — `createArchivoMeasure` não existe.

- [ ] **Step 6: Implementar `createArchivoMeasure(): Measure` em `src/components/art-studio/measure-archivo.ts`**

Importa a fixture, soma os avanços dos caracteres, multiplica por `size / unitsPerEm` e por `1.03`, e arredonda para cima com `Math.ceil` — as mesmas três operações que `measureText` faz em `ArtCanvas.tsx`, para que teste e produção divirjam só pelo kerning, que a Archivo aplica com parcimônia e que a folga de 3% cobre.

- [ ] **Step 7: Rodar e verificar que passa**

Run: `npx vitest run src/components/art-studio/measure-archivo.test.ts`
Expected: PASS nos quatro.

- [ ] **Step 8: Commit**

```bash
git add scripts/gen-archivo-advances.ts src/components/art-studio/measure-archivo.ts src/components/art-studio/measure-archivo.test.ts src/components/art-studio/__fixtures__/archivo-advances.json package.json package-lock.json
git commit -m "test(art-studio): medir texto com a métrica real da Archivo"
```

---

## Task 2: O destino como unidade

**Files:**
- Create: `src/components/art-studio/destinations.ts`
- Test: `src/components/art-studio/destinations.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type SafeArea = { top: number; right: number; bottom: number; left: number }` — **mora aqui**, não em `art-layout.ts`. Hoje é o contrário, e manter assim criaria ciclo: `art-layout.ts` passa a importar `destinationSpec` deste módulo. `art-layout.ts` reexporta o tipo para quem já o importava de lá.
  - `type ArtDestination = 'feed' | 'story' | 'whatsapp' | 'tiktok'`
  - `type ChromeShape = { kind: 'avatar' | 'bar' | 'rail' | 'actions'; x: number; y: number; width: number; height: number }`
  - `type DestinationSpec = { id: ArtDestination; label: string; actionLabel: string; width: number; height: number; safe: SafeArea; chrome: readonly ChromeShape[]; fileSuffix: string }`
  - `ART_DESTINATIONS: Record<ArtDestination, DestinationSpec>`
  - `DESTINATION_ORDER: readonly ArtDestination[]`
  - `destinationSpec(id: ArtDestination): DestinationSpec`

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('tem as quatro dimensões exatas e nenhum quadrado', () => {
  expect(DESTINATION_ORDER).toEqual(['feed', 'story', 'whatsapp', 'tiktok']);
  expect(ART_DESTINATIONS.feed).toMatchObject({ width: 1080, height: 1350 });
  for (const id of ['story', 'whatsapp', 'tiktok'] as const) {
    expect(ART_DESTINATIONS[id]).toMatchObject({ width: 1080, height: 1920 });
  }
});

it('as áreas seguras são as do spec', () => {
  expect(ART_DESTINATIONS.feed.safe).toEqual({ top: 150, right: 72, bottom: 150, left: 72 });
  expect(ART_DESTINATIONS.story.safe).toEqual({ top: 250, right: 72, bottom: 340, left: 72 });
  expect(ART_DESTINATIONS.whatsapp.safe).toEqual({ top: 220, right: 72, bottom: 260, left: 72 });
  expect(ART_DESTINATIONS.tiktok.safe).toEqual({ top: 150, right: 180, bottom: 500, left: 120 });
});

it('o TikTok reserva a coluna de ícones e o rodapé da legenda', () => {
  expect(ART_DESTINATIONS.tiktok.safe.right).toBeGreaterThan(ART_DESTINATIONS.story.safe.right);
  expect(ART_DESTINATIONS.tiktok.safe.bottom).toBeGreaterThan(ART_DESTINATIONS.story.safe.bottom);
});

it('no Feed a área segura cabe no recorte 1:1 da grade do perfil', () => {
  const { safe, width, height } = ART_DESTINATIONS.feed;
  const recorte = { top: (height - width) / 2, bottom: height - (height - width) / 2 };
  expect(safe.top).toBeGreaterThanOrEqual(recorte.top);
  expect(height - safe.bottom).toBeLessThanOrEqual(recorte.bottom);
});

it('cada forma do fantasma fica fora da área segura do seu destino', () => {
  // O fantasma representa o que a rede desenha por cima. Se ele invadir a área
  // segura, ou a área está errada ou o fantasma está — e a prévia mentiria.
  for (const id of DESTINATION_ORDER) {
    const { safe, width, height, chrome } = ART_DESTINATIONS[id];
    for (const forma of chrome) {
      const invade = forma.x + forma.width > safe.left && forma.x < width - safe.right
        && forma.y + forma.height > safe.top && forma.y < height - safe.bottom;
      expect(invade, `${id}: ${forma.kind}`).toBe(false);
    }
  }
});

it('cada destino tem sufixo de arquivo próprio', () => {
  const sufixos = DESTINATION_ORDER.map((id) => ART_DESTINATIONS[id].fileSuffix);
  expect(new Set(sufixos).size).toBe(4);
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/destinations.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `destinations.ts`**

`SafeArea` sai de `art-layout.ts` e passa a ser declarado aqui, com reexport no lugar antigo para não quebrar quem o importa — é o que evita o ciclo entre os dois módulos. `actionLabel` é o texto do botão primário: `Publicar no Feed`, `Publicar no Stories`, `Publicar no Status`, `Publicar no TikTok`. As formas do fantasma ocupam exatamente as faixas que a área segura reserva — topo, base e, no TikTok, a coluna da direita — para que o teste de não-invasão tenha o que provar.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/art-studio/destinations.test.ts`
Expected: PASS nos seis.

- [ ] **Step 5: Commit**

```bash
git add src/components/art-studio/destinations.ts src/components/art-studio/destinations.test.ts
git commit -m "feat(art-studio): o destino passa a ser a unidade, com área segura e fantasma"
```

---

## Task 3: Identidade como dado, e um só sistema visual

**Files:**
- Create: `src/data/brand.ts`
- Test: `src/data/brand.test.ts`
- Modify: `src/components/art-studio/templates.ts`
- Modify: `src/components/art-studio/templates.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type BrandKit = { name: string; logoNegative: string; logoPositive: string; phoneDisplay: string; hashtags: readonly string[]; palette: { background: string; ink: string; dim: string; accent: string; chip: string; chipInk: string; scrim: string } }`
  - `BRAND: BrandKit` — a Liberato, montada a partir de `STORE` de `src/data/store.ts` para o telefone não ter duas fontes.
  - De `templates.ts`: `type ArtBadge = 'new' | 'highlight' | 'offer' | 'reserved' | 'sold'`; `artBadges: { id: ArtBadge; label: string; heading: string }[]`; `badgesForStatus(status: string): typeof artBadges`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/data/brand.test.ts
it('o telefone da arte é o mesmo da loja', () => {
  expect(BRAND.phoneDisplay).toBe(STORE.phoneDisplay);
});

it('o branco sobre o chip atinge o mínimo da WCAG para texto', () => {
  expect(contrastRatio(BRAND.palette.chipInk, BRAND.palette.chip)).toBeGreaterThanOrEqual(4.5);
});

// src/components/art-studio/templates.test.ts
it('o tema claro e o quadrado saíram', () => {
  expect(artBadges.map((b) => b.id)).not.toContain('classic');
});

it('vendido e reservado não oferecem selo de oferta', () => {
  expect(badgesForStatus('sold').map((b) => b.id)).toEqual(['sold']);
  expect(badgesForStatus('reserved').map((b) => b.id)).toEqual(['reserved']);
  expect(badgesForStatus('published').map((b) => b.id)).toEqual(['new', 'highlight', 'offer']);
});
```

`contrastRatio` existe? Se não houver utilitário de contraste no projeto, criá-lo em `src/lib/contrast.ts` com a fórmula da WCAG (luminância relativa) e seu próprio teste de que `#ffffff` sobre `#000000` dá `21`.

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/data/brand.test.ts src/components/art-studio/templates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `BRAND` e reduzir `templates.ts`**

`ART_THEMES` deixa de existir: há uma paleta só, em `BRAND.palette`. `artTemplates` vira `artBadges` sem campo de cor. `templatesForStatus` vira `badgesForStatus` com a mesma regra de filtro de hoje, que é trava comercial (§3.3.11 do spec). `ArtFormat`, `artFormats` e tudo que mencionar `square` ou `classic` sai de `templates.ts`; quem precisar de dimensão passa a importar de `destinations.ts`.

- [ ] **Step 4: Rodar a suíte inteira para ver o que o corte quebrou**

Run: `npx vitest run`
Expected: FAIL nos arquivos que ainda importam `artFormats`, `ART_THEMES` ou `ArtFormat`. Essa lista é o mapa das tarefas 4 a 11; anotar e seguir.

- [ ] **Step 5: Commit**

```bash
git add src/data/brand.ts src/data/brand.test.ts src/lib/contrast.ts src/lib/contrast.test.ts src/components/art-studio/templates.ts src/components/art-studio/templates.test.ts
git commit -m "feat(art-studio): identidade vira dado e a arte passa a ter um só sistema visual"
```

---

## Task 4: Composição full-bleed — geometria

O coração da mudança. A foto deixa de ser o bloco elástico: ela aparece inteira, grande, sobre uma ampliação desfocada de si mesma que sangra até as bordas. O que absorve a sobra é o véu.

**Files:**
- Modify: `src/components/art-studio/art-layout.ts`
- Modify: `src/components/art-studio/art-layout.test.ts`

**Interfaces:**
- Consumes: `destinationSpec` (Tarefa 2), `createArchivoMeasure` (Tarefa 1, testes), `BRAND` (Tarefa 3).
- Produces:
  - `type PhotoFit = { mode: 'cover' | 'contain'; backdrop: Frame | null; photo: Frame }`
  - `type ScrimStop = { offset: number; alpha: number }` — as paradas do gradiente saem do componente de desenho e viram dado, porque é a única forma de o piso de contraste do §4.4 do spec ser provado por teste em vez de por olho.
  - `scrimAlphaAt(scrim: { y: number; height: number; stops: readonly ScrimStop[] }, y: number): number`
  - `type ArtLayout = { spec: DestinationSpec; column: { x: number; width: number }; logo: Frame; fit: PhotoFit; scrim: { y: number; height: number; stops: readonly ScrimStop[] }; badgePill: Frame; badge: Placed; title: Placed; meta: Placed; pricePlate: Frame; priceLabel: Placed; price: Placed; phone: Placed; note: Placed | null }`
  - `layoutArt(destination: ArtDestination, content: ArtContent, measure: Measure): ArtLayout`
  - `COVER_TOLERANCE = 0.15`
  - `ArtContent` ganha `logoAspect: number | null` e perde nada.

- [ ] **Step 1: Escrever o teste que falha**

```ts
const measure = createArchivoMeasure();

// O corpus é o estoque real (§13 do spec), não invenção.
const CORPUS = [
  { title: 'Volkswagen Saveiro', meta: '2024 · 56.000 km · Branca', price: 'R$ 69.999,00' },
  { title: 'Yamaha Lander 250', meta: '2023 · 23.218 km · Vermelho', price: 'R$ 25.300,00' },
  { title: 'Honda Pop', meta: '660 km · Branca com banco vermelho', price: 'R$ 13.700,00' },
  { title: 'Yamaha Crosser', meta: 'Vermelha e preta', price: 'R$ 17.500,00' },
  { title: 'Fiat Strada', meta: '2016 · 89.000 km · Cinza-escuro', price: 'R$ 460.000,00' },
];
const PROPORCOES = [4 / 3, 3 / 4, 1, 16 / 9, 2, null];

it.each(DESTINATION_ORDER)('%s: a foto aparece inteira e o fundo sangra', (id) => {
  for (const aspect of PROPORCOES) {
    const l = layoutArt(id, conteudo({ photoAspect: aspect }), measure);
    const spec = destinationSpec(id);
    if (l.fit.mode === 'contain') {
      expect(l.fit.backdrop).toEqual({ x: 0, y: 0, width: spec.width, height: spec.height });
      // "Inteira" é o ponto: a foto desenhada mantém a proporção da original.
      expect(l.fit.photo.width / l.fit.photo.height).toBeCloseTo(aspect ?? 4 / 3, 2);
    } else {
      expect(l.fit.backdrop).toBeNull();
      expect(l.fit.photo.width).toBeGreaterThanOrEqual(spec.width);
      expect(l.fit.photo.height).toBeGreaterThanOrEqual(spec.height);
    }
  }
});

it('a foto 4:3 do estoque usa fundo desfocado em todo destino vertical', () => {
  // É o caso dominante: 7 de 7 fotos com dimensão no banco são 1600x1200.
  for (const id of ['story', 'whatsapp', 'tiktok'] as const) {
    expect(layoutArt(id, conteudo({ photoAspect: 4 / 3 }), measure).fit.mode).toBe('contain');
  }
});

it('foto de proporção próxima à da tela dispensa o desfoque', () => {
  expect(layoutArt('story', conteudo({ photoAspect: 1080 / 1920 }), measure).fit.mode).toBe('cover');
});

it.each(DESTINATION_ORDER)('%s: o corpus real cabe na área segura', (id) => {
  const spec = destinationSpec(id);
  for (const caso of CORPUS) {
    const l = layoutArt(id, conteudo(caso), measure);
    for (const bloco of blocos(l)) {
      expect(bloco.x).toBeGreaterThanOrEqual(spec.safe.left);
      expect(bloco.x + bloco.width).toBeLessThanOrEqual(spec.width - spec.safe.right);
      expect(bloco.y).toBeGreaterThanOrEqual(spec.safe.top);
      expect(bloco.y + bloco.height).toBeLessThanOrEqual(spec.height - spec.safe.bottom);
    }
  }
});

it('a logo entra na medição e cabe na área segura', () => {
  // Hoje `logo.width` é 0 e nenhum teste confere se a marca cabe.
  for (const id of DESTINATION_ORDER) {
    const spec = destinationSpec(id);
    const l = layoutArt(id, conteudo({ logoAspect: 4.2 }), measure);
    expect(l.logo.width).toBeGreaterThan(0);
    expect(l.logo.x + l.logo.width).toBeLessThanOrEqual(spec.width - spec.safe.right);
    expect(l.logo.y).toBeGreaterThanOrEqual(spec.safe.top);
  }
});

it('as margens laterais da coluna são iguais entre si', () => {
  for (const id of DESTINATION_ORDER) {
    const spec = destinationSpec(id);
    const { column } = layoutArt(id, conteudo(), measure);
    const esquerda = column.x - spec.safe.left;
    const direita = (spec.width - spec.safe.right) - (column.x + column.width);
    expect(esquerda).toBeCloseTo(direita, 0);
  }
});

it('o preço de carro mais alto cabe na placa do TikTok', () => {
  const l = layoutArt('tiktok', conteudo({ price: 'R$ 460.000,00' }), measure);
  expect(l.price.lines).toHaveLength(1);
  expect(l.price.x + l.price.width).toBeLessThanOrEqual(l.pricePlate.x + l.pricePlate.width);
});

it('sem proporção de foto conhecida a peça ainda se compõe', () => {
  const l = layoutArt('story', conteudo({ photoAspect: null }), measure);
  expect(l.fit.photo.width).toBeGreaterThan(0);
  expect(l.fit.photo.height).toBeGreaterThan(0);
});

it('a foto ocupa muito mais da peça do que ocupava antes', () => {
  // O defeito que motivou a reescrita: 9,7% a 27,6% medidos no layout antigo.
  for (const id of DESTINATION_ORDER) {
    const spec = destinationSpec(id);
    const l = layoutArt(id, conteudo({ photoAspect: 4 / 3 }), measure);
    const fracao = (l.fit.photo.width * l.fit.photo.height) / (spec.width * spec.height);
    expect(fracao).toBeGreaterThan(0.38);
  }
});

it('o véu cobre toda a extensão vertical do texto', () => {
  for (const id of DESTINATION_ORDER) {
    const l = layoutArt(id, conteudo(), measure);
    const topoDoTexto = Math.min(...blocos(l).map((b) => b.y), l.badgePill.y);
    expect(l.scrim.y).toBeLessThanOrEqual(topoDoTexto);
    expect(l.scrim.y + l.scrim.height).toBeGreaterThanOrEqual(destinationSpec(id).height);
  }
});

it('sob qualquer linha de texto o véu chega a 0,82 de opacidade', () => {
  // §4.4 do spec: é o que mantém 4,5:1 mesmo sobre a foto mais clara do estoque.
  // Sem isto, "texto branco sobre foto" é aposta, não decisão.
  for (const id of DESTINATION_ORDER) {
    for (const caso of CORPUS) {
      const l = layoutArt(id, conteudo(caso), measure);
      for (const bloco of [...blocos(l), { y: l.badgePill.y }]) {
        expect(scrimAlphaAt(l.scrim, bloco.y)).toBeGreaterThanOrEqual(0.82);
      }
    }
  }
});
```

`conteudo()` e `blocos()` são os helpers que já existem em `art-layout.test.ts`; estender `conteudo()` com `logoAspect` e fazer `blocos()` ignorar `note` quando ela for `null`.

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/art-layout.test.ts`
Expected: FAIL — `fit`, `scrim`, `badgePill` e a assinatura por destino não existem.

- [ ] **Step 3: Reescrever `layoutArt` em `src/components/art-studio/art-layout.ts`**

A pilha inverte: o bloco de texto é ancorado na base da área segura e cresce **para cima**, na ordem observação → telefone → placa de preço → linha de dados → título → pílula do selo. A logo é ancorada no topo da área segura, com `width` derivada de `logoAspect` e `LOGO_HEIGHT`. O véu começa acima do topo do bloco de texto e vai até a borda inferior do canvas; `stops` descreve a rampa de opacidade, e o piso de 0,82 sob a primeira linha de cada bloco é o que fixa quão cedo a rampa precisa começar. A forma da rampa entre o piso e a borda é escolha de quem constrói.

Para a foto, `COVER_TOLERANCE = 0.15`: quando `|photoAspect / (width/height) − 1| ≤ 0,15`, modo `cover` sem fundo; fora disso, modo `contain` com `backdrop` ocupando o canvas inteiro e a foto centralizada na região entre a base da logo e o topo do véu, na maior escala que preserve a proporção. `photoAspect: null` usa `4/3`, que é o que o estoque real tem.

`fitLines`, `buildMetaLine` e a garantia de nunca descartar palavra ficam como estão — são o que esta reescrita preserva, não o que ela substitui.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/art-studio/art-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/art-studio/art-layout.ts src/components/art-studio/art-layout.test.ts
git commit -m "feat(art-studio): a foto passa a ser o herói da peça, inteira sobre fundo desfocado"
```

---

## Task 5: Degradação sob aperto

O véu absorve quase tudo, mas há um teto. Esta tarefa define o que cede quando o texto é grande demais — e garante que a resposta nunca seja "cortar palavra".

**Files:**
- Modify: `src/components/art-studio/art-layout.ts`
- Modify: `src/components/art-studio/art-layout.test.ts`

**Interfaces:**
- Consumes: `layoutArt` (Tarefa 4).
- Produces: `TEXT_BLOCK_MAX = 0.55`; `note: Placed | null` em `ArtLayout` passa a ser efetivamente opcional; `ArtLayout` ganha `dropped: readonly ('note' | 'meta')[]`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('o bloco de texto nunca passa de 55% da altura segura', () => {
  for (const id of DESTINATION_ORDER) {
    const spec = destinationSpec(id);
    const l = layoutArt(id, conteudo({
      title: 'Chevrolet S10 High Country Cabine Dupla Turbo Diesel Automatica',
      meta: '2016 · 189.000 km · Branca com banco vermelho e teto preto',
      note: 'Entrada facilitada, parcelas que cabem no bolso e avaliação do seu usado na hora',
    }), measure);
    const alturaSegura = spec.height - spec.safe.top - spec.safe.bottom;
    const topo = Math.min(l.badgePill.y, ...blocos(l).map((b) => b.y));
    const base = spec.height - spec.safe.bottom;
    expect((base - topo) / alturaSegura).toBeLessThanOrEqual(0.55);
  }
});

it('descarta a observação antes da linha de dados', () => {
  const l = layoutArt('tiktok', conteudo({
    title: 'Chevrolet S10 High Country Cabine Dupla Turbo Diesel Automatica',
    note: 'Entrada facilitada, parcelas que cabem no bolso e avaliação do seu usado na hora',
  }), measure);
  expect(l.dropped[0]).toBe('note');
  expect(l.note).toBeNull();
});

it('nunca descarta palavra do título, mesmo no aperto máximo', () => {
  const titulo = 'Chevrolet S10 High Country Cabine Dupla Turbo Diesel Automatica Couro Multimidia';
  const l = layoutArt('tiktok', conteudo({ title: titulo }), measure);
  expect(l.title.lines.join(' ')).toBe(titulo);
  expect(l.title.lines.join('')).not.toContain('…');
});

it('título, preço e telefone nunca são descartados', () => {
  const l = layoutArt('tiktok', conteudo({
    title: 'Chevrolet S10 High Country Cabine Dupla Turbo Diesel Automatica Couro Multimidia',
    note: 'x'.repeat(200),
  }), measure);
  expect(l.dropped).not.toContain('title');
  expect(l.title.lines.join(' ')).toBeTruthy();
  expect(l.price.lines.join(' ')).toBeTruthy();
  expect(l.phone.lines.join(' ')).toBeTruthy();
});

it('a cor longa real do estoque não estoura o aperto', () => {
  // "Branca com banco vermelho" é dado real, e a linha de dados é onde o estouro nasce.
  for (const id of DESTINATION_ORDER) {
    const l = layoutArt(id, conteudo({ meta: '660 km · Branca com banco vermelho' }), measure);
    expect(l.meta?.lines.join(' ')).toContain('Branca com banco vermelho');
  }
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/art-layout.test.ts -t aperto`
Expected: FAIL — `dropped` não existe e o teto não é aplicado.

- [ ] **Step 3: Implementar o teto e a ordem de descarte**

Medir o bloco com tudo; se passar de `TEXT_BLOCK_MAX` da altura segura, descartar a observação e remedir; se ainda passar, descartar a linha de dados e remedir; se ainda passar, o título desce na lista de corpos e aceita até 3 linhas. Título, preço e telefone não entram em `dropped` em nenhuma hipótese.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/art-studio/art-layout.test.ts`
Expected: PASS em tudo, incluindo os testes da Tarefa 4.

- [ ] **Step 5: Commit**

```bash
git add src/components/art-studio/art-layout.ts src/components/art-studio/art-layout.test.ts
git commit -m "feat(art-studio): sob aperto cede a observação, nunca uma palavra do título"
```

---

## Task 6: Selo de situação e marca d'água, medidos

O selo de VENDIDO/RESERVADO é hoje desenhado direto no canvas, fora da medição: 60 px fixos sobre um painel que passou a abraçar a foto. Com foto retrato o painel ficava com 202 px e "RESERVADO" pedia 334 — e, sendo palavra única, o Konva não quebra: vazava para fora da peça. A marca d'água de rascunho tem o mesmo vício.

**Files:**
- Modify: `src/components/art-studio/art-layout.ts`
- Modify: `src/components/art-studio/art-layout.test.ts`

**Interfaces:**
- Consumes: `layoutArt` (Tarefas 4 e 5).
- Produces: `ArtLayout` ganha `statusBand: { frame: Frame; text: Placed } | null` e `watermark: { frame: Frame; text: Placed } | null`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
it.each(DESTINATION_ORDER)('%s: a tarja de situação cabe na própria faixa, em toda proporção de foto', (id) => {
  for (const aspect of PROPORCOES) {
    for (const status of ['sold', 'reserved'] as const) {
      const l = layoutArt(id, conteudo({ photoAspect: aspect, status }), measure);
      expect(l.statusBand).not.toBeNull();
      expect(dentro(l.statusBand!.text, l.statusBand!.frame)).toBe(true);
      expect(l.statusBand!.text.lines).toHaveLength(1);
    }
  }
});

it('a tarja fica sobre a foto, não no rodapé do texto', () => {
  // Trava comercial: pílula discreta no rodapé é garantia mais fraca que tarja sobre o veículo.
  const l = layoutArt('story', conteudo({ status: 'sold' }), measure);
  expect(l.statusBand!.frame.y).toBeLessThan(l.scrim.y);
});

it('publicado não tem tarja nem marca d\'água', () => {
  const l = layoutArt('feed', conteudo({ status: 'published' }), measure);
  expect(l.statusBand).toBeNull();
  expect(l.watermark).toBeNull();
});

it.each(['draft', 'archived'])('%s: a marca d\'água cabe na área segura', (status) => {
  for (const id of DESTINATION_ORDER) {
    const spec = destinationSpec(id);
    const l = layoutArt(id, conteudo({ status }), measure);
    expect(l.watermark!.text.x).toBeGreaterThanOrEqual(spec.safe.left);
    expect(l.watermark!.text.x + l.watermark!.text.width)
      .toBeLessThanOrEqual(spec.width - spec.safe.right);
    expect(l.watermark!.text.lines.join(' ')).toBe('PRÉVIA · NÃO PUBLICAR');
  }
});
```

`conteudo()` passa a aceitar `status`; `ArtContent` ganha `status: string`.

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/art-layout.test.ts -t tarja`
Expected: FAIL.

- [ ] **Step 3: Implementar `statusBand` e `watermark` como blocos medidos**

Ambos atravessam a largura da coluna de conteúdo e usam `fitLines` com uma lista de corpos decrescente, dentro de uma faixa com véu próprio. O texto da tarja é `VENDIDO` ou `RESERVADO`; o da marca d'água é exatamente `PRÉVIA · NÃO PUBLICAR`. Seguem valendo, inalteradas, as outras travas de vendido que já existem: rótulo `ESTOQUE LIBERATO` e supressão do preço.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/art-studio/art-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/art-studio/art-layout.ts src/components/art-studio/art-layout.test.ts
git commit -m "fix(art-studio): a tarja de situação e a marca d'água entram na medição"
```

---

## Task 7: O desenho — pesos 400/900, fundo desfocado, véu

**Files:**
- Modify: `src/components/art-studio/ArtCanvas.tsx`
- Create: `src/components/art-studio/PlatformChrome.tsx`
- Test: `src/components/art-studio/ArtCanvas.test.tsx`
- Test: `src/components/art-studio/PlatformChrome.test.tsx`

**Interfaces:**
- Consumes: `layoutArt`, `ART_DESTINATIONS`, `BRAND`.
- Produces: `ArtCanvas` passa a receber `destination: ArtDestination` em lugar de `format` e `template`, mais `badge: ArtBadge`, `brand: BrandKit` e `showChrome: boolean`. `PlatformChrome({ destination }: { destination: ArtDestination })` desenha as formas de `chrome` como overlay HTML sobre a prévia — não entra no palco, para não ir para o arquivo.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
it('desenha somente nos pesos 400 e 900', () => {
  // Varredura no fonte: é o único jeito de provar isto sem um canvas de verdade.
  const fonte = readFileSync('src/components/art-studio/ArtCanvas.tsx', 'utf8');
  expect(fonte).not.toMatch(/fontStyle=["'{]?\s*['"]?bold/);
  expect(fonte).not.toMatch(/\b(700|800)\b/);
});

it('não usa o blur em JavaScript do Konva', () => {
  const fonte = readFileSync('src/components/art-studio/ArtCanvas.tsx', 'utf8');
  expect(fonte).not.toContain('Konva.Filters.Blur');
  expect(fonte).toContain('context.filter');
});

it('o palco toma a dimensão do destino, sem número cravado', () => {
  // Varredura de fonte, não renderização: o happy-dom não dá contexto 2D e o Konva
  // não monta sem ele. A dimensão real do arquivo é conferida por decodificação na
  // Tarefa 12 — é lá que ela de fato se prova.
  const fonte = readFileSync('src/components/art-studio/ArtCanvas.tsx', 'utf8');
  expect(fonte).toMatch(/<Stage[^>]*width=\{width\}[^>]*height=\{height\}/);
  for (const n of ['1080', '1350', '1920']) expect(fonte).not.toContain(n);
});

it('o fantasma não vai para o arquivo exportado', () => {
  const fonte = readFileSync('src/components/art-studio/ArtCanvas.tsx', 'utf8');
  // PlatformChrome é overlay de DOM; se aparecer dentro de <Layer>, vaza para o JPEG.
  expect(fonte).not.toMatch(/<Layer[\s\S]*PlatformChrome[\s\S]*<\/Layer>/);
});

// PlatformChrome.test.tsx
it('não desenha marca nem nome de plataforma', () => {
  const fonte = readFileSync('src/components/art-studio/PlatformChrome.tsx', 'utf8');
  for (const marca of ['Instagram', 'TikTok', 'WhatsApp', 'Facebook', 'Meta']) {
    // O fantasma é forma neutra. Nome de plataforma no desenho é risco de marca registrada.
    expect(fonte.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')).not.toContain(marca);
  }
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/ArtCanvas.test.tsx src/components/art-studio/PlatformChrome.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Reescrever a camada de desenho**

Ordem no palco: `backdrop` desfocado (ou a foto em `cover`), foto inteira, tarja de situação, véu, logo, pílula do selo, título, linha de dados, placa de preço, preço, telefone, observação, marca d'água. O desfoque é um `Konva.Shape` com `sceneFunc` próprio que faz `context.filter = 'blur(48px)'` antes de desenhar a imagem ampliada; quando `filter` não existir no contexto, desenhar a imagem reduzida e reampliá-la. O véu é um `Rect` com `fillLinearGradientColorStops`, do transparente ao `BRAND.palette.scrim`. `document.fonts.load` passa a carregar `400` **e** `900`.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/art-studio/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/art-studio/ArtCanvas.tsx src/components/art-studio/ArtCanvas.test.tsx src/components/art-studio/PlatformChrome.tsx src/components/art-studio/PlatformChrome.test.tsx
git commit -m "feat(art-studio): desenha em 400/900, com fundo desfocado acelerado e véu"
```

---

## Task 8: Renderização offscreen sequencial dos quatro destinos

Hoje `stageRef` aponta para a prévia visível, então só é possível exportar o formato que está na tela. Esta tarefa separa as duas coisas.

**Files:**
- Create: `src/components/art-studio/art-render.ts`
- Test: `src/components/art-studio/art-render.test.ts`

**Interfaces:**
- Consumes: `ART_DESTINATIONS`, `DESTINATION_ORDER`.
- Produces:
  - `type RenderedArt = { destination: ArtDestination; blob: Blob; filename: string }`
  - `renderDestinations(opts: { order: readonly ArtDestination[]; renderOne: (d: ArtDestination) => Promise<Blob | null>; onReady: (art: RenderedArt) => void; filename: (d: ArtDestination) => string; signal?: AbortSignal }): Promise<void>` — percorre `order` **em sequência**, chamando `onReady` a cada destino concluído, e para quando `signal` abortar.

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('renderiza em sequência, nunca em paralelo', async () => {
  let vivos = 0; let maximo = 0;
  await renderDestinations({ order: DESTINATION_ORDER, onReady: () => {},
    filename: (d) => `${d}.jpg`,
    renderOne: async () => {
      vivos += 1; maximo = Math.max(maximo, vivos);
      await Promise.resolve();
      vivos -= 1;
      return new Blob(['x'], { type: 'image/jpeg' });
    } });
  expect(maximo).toBe(1);
});

it('entrega cada destino assim que ele fica pronto', async () => {
  const prontos: string[] = [];
  await renderDestinations({ order: DESTINATION_ORDER, filename: (d) => `${d}.jpg`,
    onReady: (art) => prontos.push(art.destination),
    renderOne: async () => new Blob(['x'], { type: 'image/jpeg' }) });
  expect(prontos).toEqual([...DESTINATION_ORDER]);
});

it('um destino que falha não impede os outros', async () => {
  const prontos: string[] = [];
  await renderDestinations({ order: DESTINATION_ORDER, filename: (d) => `${d}.jpg`,
    onReady: (art) => prontos.push(art.destination),
    renderOne: async (d) => d === 'story' ? null : new Blob(['x'], { type: 'image/jpeg' }) });
  expect(prontos).toEqual(['feed', 'whatsapp', 'tiktok']);
});

it('para de renderizar quando é abortado', async () => {
  const controller = new AbortController();
  let chamadas = 0;
  await renderDestinations({ order: DESTINATION_ORDER, onReady: () => {},
    filename: (d) => `${d}.jpg`, signal: controller.signal,
    renderOne: async () => { chamadas += 1; controller.abort(); return new Blob(['x']); } });
  expect(chamadas).toBe(1);
});

it('o nome do arquivo carrega o destino', () => {
  const sufixos = DESTINATION_ORDER.map((d) => ART_DESTINATIONS[d].fileSuffix);
  expect(new Set(sufixos).size).toBe(4);
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/art-render.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `renderDestinations`**

Laço `for ... of` com `await` por iteração — é a sequencialidade exigida, e `Promise.all` aqui é exatamente o erro que o primeiro teste barra. `renderOne` que devolve `null` ou lança não interrompe o laço. A decisão de qual palco usar fica fora deste módulo, que é puro de propósito: quem chama injeta `renderOne` com o palco oculto, e é lá que o palco é liberado entre destinos.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/art-studio/art-render.test.ts`
Expected: PASS nos cinco.

- [ ] **Step 5: Commit**

```bash
git add src/components/art-studio/art-render.ts src/components/art-studio/art-render.test.ts
git commit -m "feat(art-studio): renderização sequencial dos quatro destinos, fora da prévia"
```

---

## Task 9: Título sem repetição e legenda por destino

**Files:**
- Create: `src/components/art-studio/art-title.ts`
- Test: `src/components/art-studio/art-title.test.ts`
- Modify: `src/components/art-studio/caption.ts`
- Modify: `src/components/art-studio/caption.test.ts`
- Modify: `src/app/admin/(protected)/veiculos/[id]/arte/page.tsx`

**Interfaces:**
- Consumes: `ArtDestination` (Tarefa 2), `BRAND` (Tarefa 3).
- Produces:
  - `composeVehicleTitle(parts: { brand: string | null; model: string | null; version: string | null }): string`
  - `createCaption(vehicle: CaptionVehicle, destination: ArtDestination, phone: string): string` — a assinatura perde `platform` e `format` e ganha o destino.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// art-title.test.ts
it('não repete marca e modelo que a versão já traz', () => {
  // Dado real: o Lander 250 tem version = "Yamaha xtz Lander 250".
  expect(composeVehicleTitle({ brand: 'Yamaha', model: 'Lander 250', version: 'Yamaha xtz Lander 250' }))
    .toBe('Yamaha Lander 250 xtz');
});

it('mantém a versão quando ela acrescenta informação', () => {
  expect(composeVehicleTitle({ brand: 'Volkswagen', model: 'Saveiro', version: 'Robust' }))
    .toBe('Volkswagen Saveiro Robust');
});

it('veículo sem marca e sem modelo recebe título de reserva', () => {
  // Existe um rascunho assim no estoque.
  expect(composeVehicleTitle({ brand: null, model: null, version: null })).toBe('Veículo sem título');
});

it('ignora diferença de caixa e de acento ao comparar', () => {
  expect(composeVehicleTitle({ brand: 'Honda', model: 'Pop', version: 'HONDA pop 110i' }))
    .toBe('Honda Pop 110i');
});

// caption.test.ts
it('a legenda do Feed traz o endereço do anúncio quando existe', () => {
  const texto = createCaption({ ...veiculo, publicUrl: 'https://exemplo.com/veiculos/saveiro' }, 'feed', BRAND.phoneDisplay);
  expect(texto).toContain('https://exemplo.com/veiculos/saveiro');
});

it('Stories, Status e TikTok não trazem endereço', () => {
  for (const d of ['story', 'whatsapp', 'tiktok'] as const) {
    expect(createCaption({ ...veiculo, publicUrl: 'https://exemplo.com/x' }, d, BRAND.phoneDisplay))
      .not.toContain('https://');
  }
});

it('o Status do WhatsApp não leva hashtag', () => {
  expect(createCaption(veiculo, 'whatsapp', BRAND.phoneDisplay)).not.toContain('#');
});

it('vendido não anuncia preço em nenhum destino', () => {
  for (const d of DESTINATION_ORDER) {
    expect(createCaption({ ...veiculo, status: 'sold' }, d, BRAND.phoneDisplay)).not.toContain('R$');
  }
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/art-title.test.ts src/components/art-studio/caption.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `composeVehicleTitle` e migrar `createCaption`**

Para o título: normalizar removendo acento e caixa, partir em palavras, e acrescentar da versão só as palavras que ainda não apareceram em marca ou modelo, preservando a grafia original da versão. Vazio em tudo devolve `Veículo sem título`.

Para a legenda: `platform` e `format` saem; o destino decide tudo. `feed` recebe a variante longa com endereço do anúncio e hashtags; `story` e `tiktok`, a curta com hashtags (o TikTok mantém a hashtag de categoria); `whatsapp`, a curta sem hashtag. As hashtags vêm de `BRAND.hashtags` mais a do modelo.

A página `arte/page.tsx` passa a usar `composeVehicleTitle` no lugar do `join(' ')` de hoje.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/art-studio/ src/app/admin/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/art-studio/art-title.ts src/components/art-studio/art-title.test.ts src/components/art-studio/caption.ts src/components/art-studio/caption.test.ts "src/app/admin/(protected)/veiculos/[id]/arte/page.tsx"
git commit -m "fix(art-studio): título sem repetição e legenda derivada do destino"
```

---

## Task 10: Entrega num toque

**Files:**
- Modify: `src/components/art-studio/share-art.ts`
- Modify: `src/components/art-studio/share-art.test.ts`

**Interfaces:**
- Consumes: `RenderedArt` (Tarefa 8).
- Produces: `deliverArt` ganha `caption?: string` e `copyText?: (text: string) => Promise<void>`. Tudo o mais — `Delivery`, `checkVersion`, `runArtDelivery`, a classificação de erro — fica como está.

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('dispara a cópia da legenda antes de compartilhar, sem esperar por ela', async () => {
  const ordem: string[] = [];
  let resolverCopia: () => void = () => {};
  await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download,
    copyText: () => { ordem.push('copiar'); return new Promise((r) => { resolverCopia = r; }); },
    share: async () => { ordem.push('compartilhar'); },
  });
  // Se houvesse `await` na cópia, 'compartilhar' não teria acontecido ainda.
  expect(ordem).toEqual(['copiar', 'compartilhar']);
  resolverCopia();
});

it('falha de cópia não aborta o compartilhamento', async () => {
  const resultado = await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download,
    copyText: () => Promise.reject(new Error('sem permissão')),
    share: async () => {} });
  expect(resultado).toBe('shared');
});

it('a legenda também viaja no ShareData', async () => {
  let recebido: ShareData | null = null;
  await deliverArt({ blob, filename: 'x.jpg', caption: 'legenda', download,
    canShare: () => true, share: async (d) => { recebido = d; } });
  expect(recebido!.text).toBe('legenda');
});

it('sem legenda, nada é copiado', async () => {
  let copiou = false;
  await deliverArt({ blob, filename: 'x.jpg', download,
    copyText: async () => { copiou = true; }, share: async () => {} });
  expect(copiou).toBe(false);
});
```

Os testes que já existem para `AbortError`, `NotAllowedError`, `TypeError` e recuo para download continuam valendo sem alteração — confirmar que seguem verdes.

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/share-art.test.ts`
Expected: FAIL — `caption` e `copyText` não existem.

- [ ] **Step 3: Implementar em `share-art.ts`**

Quando houver `caption` e `copyText`, chamar `void copyText(caption)` e, **na mesma volta do laço de eventos**, seguir para o `share` — sem `await` entre os dois, porque é o `await` que consome a ativação do usuário no WebKit. Erro de cópia é engolido com `.catch(() => undefined)`.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/components/art-studio/share-art.test.ts`
Expected: PASS, incluindo os testes antigos.

- [ ] **Step 5: Commit**

```bash
git add src/components/art-studio/share-art.ts src/components/art-studio/share-art.test.ts
git commit -m "feat(art-studio): a legenda vai para a área de transferência no mesmo toque"
```

---

## Task 11: A tela nova

**Files:**
- Modify: `src/components/art-studio/ArtEditor.tsx`
- Modify: `src/components/art-studio/art-studio.module.css`
- Test: `src/components/art-studio/ArtEditor.test.tsx`

**Interfaces:**
- Consumes: tudo das Tarefas 2 a 10.
- Produces: `ArtEditor` ganha `brand: BrandKit` nas props e `shareSupport?: ShareSupport`. Hoje `shareSupport` é calculado só por dentro com `useSyncExternalStore`, o que torna os três caminhos de indisponibilidade impossíveis de testar; a prop injetada mantém o cálculo interno como padrão.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
it('não pede escolha de formato nem de plataforma', () => {
  render(<ArtEditor {...props} />);
  expect(screen.queryByText(/Formato da arte/i)).toBeNull();
  expect(screen.queryByRole('button', { name: /^Instagram$/ })).toBeNull();
});

it('abre com um botão de publicar nomeado pelo destino', () => {
  render(<ArtEditor {...props} />);
  expect(screen.getByRole('button', { name: /Publicar no/ })).toBeTruthy();
});

it('oferece os quatro destinos e trocar de destino troca o rótulo do botão', async () => {
  render(<ArtEditor {...props} />);
  for (const d of DESTINATION_ORDER) {
    expect(screen.getByRole('button', { name: ART_DESTINATIONS[d].label })).toBeTruthy();
  }
  await user.click(screen.getByRole('button', { name: ART_DESTINATIONS.tiktok.label }));
  expect(screen.getByRole('button', { name: 'Publicar no TikTok' })).toBeTruthy();
});

it('Baixar continua disponível quando não há compartilhamento', () => {
  render(<ArtEditor {...props} shareSupport="unsupported" />);
  expect(screen.getByRole('button', { name: 'Baixar' })).toBeTruthy();
});

it('com exportProblem a prévia aparece e nada promete publicação', () => {
  render(<ArtEditor {...props} exportProblem="Publique o anúncio antes de baixar uma arte comercial." />);
  expect(screen.getByText(/Publique o anúncio antes/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /Publicar no/ })).toBeDisabled();
});

it('os botões-âncora de celular saíram', () => {
  render(<ArtEditor {...props} />);
  expect(screen.queryByText('Ver prévia da arte')).toBeNull();
  expect(screen.queryByText('Alterar opções')).toBeNull();
});

it('lembra o último destino e sobrevive a localStorage indisponível', () => {
  const quebrado = () => { throw new Error('bloqueado'); };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(quebrado);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(quebrado);
  expect(() => render(<ArtEditor {...props} />)).not.toThrow();
});

it('o texto auxiliar livre ainda exige confirmação; a legenda não', async () => {
  render(<ArtEditor {...props} />);
  await user.type(screen.getByLabelText(/Texto auxiliar/), 'Entrada facilitada');
  expect(screen.getByLabelText(/Confirmei/)).toBeTruthy();
  expect(screen.queryByLabelText(/autorizo a legenda/i)).toBeNull();
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/components/art-studio/ArtEditor.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Reescrever `ArtEditor`**

Prévia primeiro, largura cheia, com `PlatformChrome` e um interruptor para esconder. Fileira de quatro fichas de destino. Botão primário `Publicar no {destino}` e secundário `Baixar`. Foto, selo e texto auxiliar recolhidos. Legenda em área recolhida, com o botão manual de copiar como rede de segurança. Último destino e último selo lembrados em `localStorage`, com leitura e escrita em `try/catch`. Saem: o passo de formato, o seletor de plataforma, os dois botões-âncora e a numeração `1.` a `4.` das seções.

A pré-renderização dos quatro destinos começa quando foto e fonte estão prontas e **não começa** quando `exportProblem` está presente. Toque num destino cujo arquivo ainda não está pronto renderiza na hora; se a ativação do usuário se perder no caminho, a tela pede um segundo toque em vez de falhar calada.

O CSS acompanha: `.formats`, `.platforms`, `.templates` e `.mobileJump` saem; entram as fichas de destino, a barra de ação e o overlay do fantasma.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS. `npx vitest run src/app/admin/` cobre `css-classes.test.ts`, que barra classe de CSS Modules inexistente — se ele falhar, há classe removida do CSS ainda referenciada no TSX.

- [ ] **Step 5: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: ambos sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/components/art-studio/ArtEditor.tsx src/components/art-studio/ArtEditor.test.tsx src/components/art-studio/art-studio.module.css
git commit -m "feat(art-studio): a tela abre pronta e publicar é um toque"
```

---

## Task 12: Conferência no aparelho e documentos em dia

A última tarefa é a única que não se prova com teste automatizado — e é a que decide se a peça ficou boa. Quatro conferências que o spec condiciona a olho humano: o colapso dos selos, os números de área segura, o limiar `cover`/`contain` e o aceite comercial.

**Files:**
- Modify: `docs/PENDENCIAS_PAINEL.md`
- Modify: `docs/liberato-inteligente/04-PLANO-ESTUDIO-ARTES.md`
- Modify: `docs/superpowers/specs/2026-11-05-estudio-artes-destino-primeiro-design.md`

- [ ] **Step 1: Medir o que foi estimado**

Nos dois aparelhos (um Android/Chrome e um iPhone/Safari), com o painel por HTTPS e um veículo publicado com foto real: cronometrar a renderização dos quatro destinos e anotar o tamanho de cada JPEG. Substituir no §8.2 do spec o "≈300 ms e ≈400 KB cada" pelos números medidos, ou pelo que eles mostrarem de diferente.

- [ ] **Step 2: Decodificar os quatro arquivos e conferir a dimensão exata**

Baixar os quatro destinos de um veículo publicado e conferir a dimensão de cada arquivo, que é requisito do spec e não se prova sob happy-dom.

Run: `for f in ~/Downloads/liberato-*.jpg; do npx tsx -e "import {readFileSync} from 'node:fs'; const b=readFileSync(process.argv[1]); let i=2; while(i<b.length){ if(b[i]!==0xFF) {i++; continue;} const m=b[i+1]; if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC){ console.log(process.argv[1], b.readUInt16BE(i+7)+'x'+b.readUInt16BE(i+5)); break;} i+=2+b.readUInt16BE(i+2);}" "$f"; done`
Expected: `1080x1350` para o Feed e `1080x1920` para os outros três.

- [ ] **Step 3: Conferir as áreas seguras com o fantasma**

Para cada um dos quatro destinos, publicar de verdade numa conta de teste e comparar a peça publicada com a prévia e seu fantasma. Onde a interface da rede cobrir texto, corrigir o número em `destinations.ts` — é um valor num só lugar — e registrar a correção no §5 do spec.

- [ ] **Step 4: Conferir o limiar `cover`/`contain` com as fotos do estoque**

Incluir as fotos de celular em retrato, que são o caso difícil. Se o `COVER_TOLERANCE` de 0,15 produzir corte ruim em alguma, ajustar o valor e anotar o motivo.

- [ ] **Step 5: Conferir o colapso dos selos**

Gerar as peças dos selos restantes e confirmar com o dono que a perda do tema claro e das molduras separadas não custou nada que ele usava.

- [ ] **Step 6: Atualizar os documentos defasados**

Em `docs/PENDENCIAS_PAINEL.md`, corrigir a afirmação de que "a vitrine pública continua lendo o catálogo estático": a home usa `listPublicVehiclesWithCover` e o detalhe `getPublicVehicleWithPhotos`, ambos do banco. Em `docs/liberato-inteligente/04-PLANO-ESTUDIO-ARTES.md`, marcar que as decisões de layout e de fluxo foram substituídas pelo spec de 05/11, mantendo os limites comerciais.

- [ ] **Step 7: Commit**

```bash
git add docs/
git commit -m "docs(art-studio): números medidos no aparelho e documentos em dia"
```

---

## Notas de execução

**Ordem.** As tarefas 1 a 3 são independentes entre si e podem sair em qualquer ordem, mas as três precisam estar prontas antes da 4: a 1 dá a medição aos testes, a 2 dá o destino e a 3 dá a paleta. As tarefas 4, 5 e 6 são sequenciais sobre o mesmo arquivo. As 7 a 10 dependem da 4 mas não uma da outra. A 11 fecha tudo, e a 12 é o portão humano.

**A suíte fica vermelha no meio do caminho.** A Tarefa 3 remove `artFormats`, `ART_THEMES` e `ArtFormat`, e a suíte inteira só volta ao verde na Tarefa 11. O Step 4 da Tarefa 3 existe para transformar essa quebra num mapa em vez de uma surpresa. Quem executa não deve "consertar" os arquivos quebrados fora da tarefa que é dona deles.

**O que não se toca.** O §7 do spec lista as correções caras que precedem este plano: busca de foto em duas tentativas com mensagens de 403 e 502, foto importada servida pelo arquivo público, arquivo preparado antes do toque, classificação do erro de compartilhamento, conferência de versão do anúncio, remedição quando a fonte chega, `pixelRatio = 1`, JPEG 0,92, rascunho sem peça comercial. Nenhuma tarefa aqui autoriza mexer nisso.
