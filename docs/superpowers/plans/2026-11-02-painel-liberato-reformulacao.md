# Reformulação do painel + agenda da Dayse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o painel apresentável, dar-lhe a agenda de visitas, e remover o chat do site — sem redesenhar o visual nem somar dívida ao gerador de artes.

**Architecture:** Etapa 1 conserta retorno de ação, corte de texto na arte e hierarquia; remove o chat do site; acrescenta a barra de quatro destinos e a agenda alimentada à mão. Etapa 2 persiste nome, telefone e tenant do cliente, entrega a resposta do vendedor, e faz a Dayse resolver dia e hora. Toda escrita passa por `requireAdmin()` no serviço e, no editor, pela fila de `useVehicleDraft.enqueue`.

**Tech Stack:** Next.js 16.4.2 (App Router), React 19.3, TypeScript, Drizzle ORM + Postgres (Neon), NextAuth 5 beta, Konva/react-konva, Vitest + happy-dom + @testing-library/react, AI SDK 7.

**Spec:** `docs/superpowers/specs/2026-11-02-painel-liberato-reformulacao-design.md`

**Decisões de execução (2 de novembro de 2026, do proprietário):** escopo inteiro mantido — as 9
tasks da Etapa 1 e as 4 da Etapa 2, sem corte. A apresentação ao Elton fica para a semana seguinte,
em vez de esta, porque o portão custa ≈6,75 dias (§10 do design). Execução por subagente: um
implementa cada task e um revisor novo confere antes de a seguinte começar.

## Global Constraints

- **Ler `node_modules/next/dist/docs/` antes de escrever código.** `AGENTS.md` do repositório determina isso.
- **`requireAdmin()` em toda operação administrativa nova**, no serviço — não no layout.
- **Toda escrita em veículo exige a versão esperada e a incrementa.** No editor, a única porta é `useVehicleDraft.enqueue`.
- **Nenhuma mudança pode aumentar as condicionais de geometria de `src/components/art-studio/ArtCanvas.tsx`** (hoje 43 em 156 linhas; `grep -c "?"` = 56).
- **Migração aditiva**, gerada por `drizzle-kit generate`. Última existente: `drizzle/0009_aspiring_human_robot.sql`.
- **Toda coluna ou tabela nova de atendimento precisa de DOIS caminhos:** o schema Drizzle (+ migração) e o DDL equivalente em `src/server/attendance/ensure-schema.ts`. Precedente: `ensure-schema.ts:89-93`.
- **O enum `channel` continua `['site','whatsapp']`.** Não estreitar: tocaria 4 tabelas e 4 check constraints.
- **Fuso America/Fortaleza** para toda data exibida ou resolvida. Precedente: `atendimento/page.tsx:44-48`.
- **Horário da loja vem de `STORE_POLICY.horarioEstruturado`** (`src/data/store-policy.ts:57-63`): seg a sáb, 9h–18h, domingo fechado. **Nenhum literal `9` ou `18` em código novo.**
- **Retenção:** `RETENTION_NO_LEAD_DAYS = 30`, `RETENTION_LEAD_DAYS = 180` (`conversation-repository.ts:15-16`). Visita marcada é lead.
- **`conversations.facts` é limitado a 7 itens** (`conversation-repository.ts:133`). Agendamento não vive em `facts`.
- **Testes de componente e hook pedem `// @vitest-environment happy-dom`** no docblock do arquivo. Padrão é `node`.
- **A suíte atual deve continuar verde:** 482 testes, 52 arquivos. `npx vitest run`.
- **Três decisões deliberadas que não se desfazem:** área segura dos formatos verticais (`04-PLANO-ESTUDIO-ARTES.md:13`), `Combobox` não ser `<datalist>` (`Combobox.tsx:18-26`), ausência de `capture` no input de galeria (`PhotoUpload.tsx:65-66`).

## Review Focus

1. **Nome de perfil do WhatsApp em caixa alta, com emoji, ou longo.** O cliente controla esse texto e ele vai ao cartão da agenda. Esperado: tratado como `semGritar` trata a ficha (`ficha.ts:29-39`) e truncado, sem quebrar o cartão. → Task 10.
2. **Data resolvida no passado, no domingo, ou fora de 9h–18h.** O modelo vai errar. Esperado: não vira horário; vira agendamento sem hora com a frase preservada. → Task 12.
3. **Cliente remarca na mesma conversa.** Esperado: uma visita por conversa, atualizada — não duas contraditórias na tela. → Task 6.
4. **Pessoa cancela a folha de compartilhamento.** `navigator.share` rejeita com `AbortError`. Esperado: silêncio, não erro. → Task 8.
5. **Conversa antiga sem telefone/tenant, e janela de 24h fechada.** Esperado: caixa de resposta ausente ou com alternativa `wa.me`, nunca sucesso falso nem exceção. → Task 11.

---

## File Structure

**Etapa 1**

| Arquivo | Responsabilidade |
|---|---|
| `src/components/art-studio/title-fit.ts` *(novo)* | Corpo e quebra do título, medindo. Puro, testável em `node`. |
| `src/components/art-studio/share-art.ts` *(novo)* | Folha de compartilhamento ou download. Puro, `navigator` injetado. |
| `src/app/admin/(protected)/AdminTabBar.tsx` *(novo)* | Barra fixa de quatro destinos com contadores. |
| `src/app/admin/(protected)/agenda/` *(novo)* | Agenda: página, cartão, formulário manual, actions. |
| `src/app/admin/(protected)/divulgar/page.tsx` *(novo)* | Porta de divulgação: publicados → estúdio. |
| `src/app/admin/(protected)/ajustes/page.tsx` *(novo)* | Meta + controle do canal WhatsApp. |
| `src/server/attendance/appointments.ts` *(novo)* | Repositório e leitura agrupada da agenda. |
| `src/server/attendance/visit-slot.ts` *(novo)* | Resolver dia+hora contra o horário da loja. Puro. |
| `.../useVehicleDraft.ts`, `VehicleEditor.tsx`, `StatusActions.tsx`, `DangerActions.tsx` | Motivo da falha junto ao botão tocado. |
| `src/components/art-studio/ArtCanvas.tsx`, `ArtEditor.tsx` | `title-fit`; `ellipsis`; família com fallback; ordem de operações do iOS. |
| `src/app/admin/admin.module.css` | Borda com contraste; ação primária e destrutiva; barra. |

**Etapa 2**

| Arquivo | Responsabilidade |
|---|---|
| `src/server/db/schema.ts` | `conversations.customerName`, `.customerPhone`, `.tenantId`; tabela `visitAppointments`. |
| `src/server/attendance/customer-name.ts` *(novo)* | Limpeza do nome vindo do WhatsApp. |
| `src/server/attendance/reply-window.ts` *(novo)* | Janela de 24h da Meta. Puro. |
| `src/server/agent/incoming.ts`, `src/server/whatsapp/webhook-handler.ts` | Persistir identidade e tenant. |
| `src/server/attendance/inbox.ts` | Resposta do vendedor entregue de verdade. |
| `src/server/agent/tools.ts`, `prompt.ts`, `run.ts` | `marcar_visita`; data de hoje no system prompt; contraproposta. |

---

# ETAPA 1 — Portão da demonstração

## Task 1: Retorno das quatro ações principais

**Files:**
- Modify: `.../veiculos/[id]/useVehicleDraft.ts:203-227`, `VehicleEditor.tsx:60-83`, `StatusActions.tsx:23-40`, `DangerActions.tsx:20-36`
- Test: `.../useVehicleDraft.test.tsx`, `.../VehicleEditor.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `saveBeforeAction: () => Promise<{ ok: boolean; message: string | null }>` em `VehicleDraft`, substituindo o `Promise<boolean>` atual. Todo chamador lê `.ok` e exibe `.message` localmente.

- [ ] **Step 1: Escrever o teste que falha em `useVehicleDraft.test.tsx`**

```tsx
it('saveBeforeAction devolve o motivo quando a gravação falha', async () => {
  // saveVehicle mockado: { message: 'Este anúncio foi alterado. Recarregue antes de salvar.' }, sem version
  const outcome = await result.current.saveBeforeAction();
  expect(outcome).toEqual({ ok: false, message: 'Este anúncio foi alterado. Recarregue antes de salvar.' });
});
it('saveBeforeAction devolve ok sem motivo quando grava', async () => {
  expect(await result.current.saveBeforeAction()).toEqual({ ok: true, message: null });
});
```

- [ ] **Step 2: Rodar e verificar que falha** — `npx vitest run src/app/admin/\(protected\)/veiculos/\[id\]/useVehicleDraft.test.tsx` → FAIL (`outcome.ok` é `undefined`).

- [ ] **Step 3: Alterar `saveBeforeAction` para devolver `{ ok, message }`**

O corpo (`:203-227`) já calcula as duas coisas: o sucesso é `result.version !== undefined && !differs(...)` e a mensagem já vai para `setMessage`. Devolver ambas. O `catch` devolve `{ ok: false, message: toFormMessage(error) }`.

- [ ] **Step 4: Rodar e verificar que passa** — mesmo comando → PASS.

- [ ] **Step 5: Escrever os quatro testes de tela que falham em `VehicleEditor.test.tsx`**

Cada um monta o editor com `saveBeforeAction` devolvendo `{ ok: false, message: 'Não foi possível salvar agora. Tente de novo.' }` e afirma que o texto aparece **dentro** do elemento que contém o botão tocado:

```tsx
it('publicar com gravação falhando explica no rodapé de publicação', async () => {});
it('criar arte com gravação falhando explica ao lado do botão e não navega', async () => {});
it('mudar situação com gravação falhando explica na seção de situação', async () => {});
it('arquivar com gravação falhando explica dentro da caixa, que continua aberta', async () => {});
```

- [ ] **Step 6: Rodar e verificar que falham** — `npx vitest run .../VehicleEditor.test.tsx` → FAIL nos quatro.

- [ ] **Step 7: Exibir o motivo nos quatro caminhos**

`publish()` chama `setPublishMessage(outcome.message)` antes de retornar. `openArt()` ganha estado de mensagem próprio, exibido junto ao botão "Criar arte". `StatusActions.change()` chama `setMessage(outcome.message)`. `DangerActions.execute()` chama `setMessage(outcome.message)` e **mantém** `confirming`.

- [ ] **Step 8: Rodar a suíte** — `npx vitest run` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/admin/\(protected\)/veiculos/\[id\]/
git commit -m "fix(painel): acoes principais deixam de falhar em silencio"
```

---

## Task 2: Título da arte — medir em vez de contar

**Files:**
- Create: `src/components/art-studio/title-fit.ts`, `.../title-fit.test.ts`
- Modify: `ArtCanvas.tsx:76-77` (sai), `:129-131`, e as 8 ocorrências de `fontFamily="Archivo, Arial"`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `fitTitle(input: FitTitleInput): { size: number; lines: readonly string[] }`
  - `type FitTitleInput = { text: string; maxWidth: number; maxHeight: number; lineHeight: number; candidates: readonly number[]; measure: (text: string, size: number) => number }`
  - `ART_FONT_FAMILY = '"Archivo", "Archivo Fallback"'` — usada por todo `Text` do canvas.

`candidates` vem do maior para o menor; devolve o primeiro cujas linhas caibam em `maxHeight`, ou o menor se nenhum couber.

- [ ] **Step 1: Escrever o teste que falha**

`measure` injetada como largura por caractere, para não depender de fonte: `const medida = (porChar: number) => (t: string, s: number) => t.length * porChar * (s / 100);`

```ts
it('escolhe o maior corpo cujas linhas caibam na altura', () => {
  expect(fitTitle({ text: 'VOLKSWAGEN SAVEIRO ROBUST', maxWidth: 940, maxHeight: 120,
    lineHeight: 1.02, candidates: [66, 55, 48], measure: medida(62) }).size).toBe(55);
});
it('nunca devolve mais linhas do que cabem na altura', () => {
  const r = fitTitle({ text: 'CHEVROLET S10 HIGH COUNTRY 2.8 TURBO DIESEL 4X4 AUTOMATICA COURO',
    maxWidth: 940, maxHeight: 120, lineHeight: 1.02, candidates: [66, 55, 48], measure: medida(62) });
  expect(r.lines.length * r.size * 1.02).toBeLessThanOrEqual(120);
});
it('mantém o título inteiro quando ele cabe', () => {
  expect(fitTitle({ text: 'FIAT STRADA', maxWidth: 940, maxHeight: 120,
    lineHeight: 1.02, candidates: [66, 55, 48], measure: medida(62) }).lines.join(' ')).toBe('FIAT STRADA');
});
it('rejeita 66px quando ele só permite uma linha e o texto precisa de duas', () => {
  // o defeito P0-2: a 66px cabe 1 linha (67,32 x 2 = 134,6 > 120)
  const r = fitTitle({ text: 'SUZUKI BOULEVARD M800', maxWidth: 940, maxHeight: 120,
    lineHeight: 1.02, candidates: [66, 55, 48], measure: medida(70) });
  expect(r.size).toBeLessThan(66);
  expect(r.lines.join(' ')).toBe('SUZUKI BOULEVARD M800');
});
```

- [ ] **Step 2: Rodar e verificar que falha** — `npx vitest run src/components/art-studio/title-fit.test.ts` → FAIL.

- [ ] **Step 3: Implementar `fitTitle` em `title-fit.ts`** — quebra por palavra com `measure`; por candidato, compara `linhas * size * lineHeight` com `maxHeight`. Sem DOM, sem canvas.

- [ ] **Step 4: Rodar e verificar que passa** — PASS.

- [ ] **Step 5: Ligar no canvas**

Apagar o `titleSize` de `:76-77`; chamar `fitTitle` com `measure` apoiada em `measureText` de um contexto 2D e `ART_FONT_FAMILY`; passar `ellipsis` ao `Text` do título; trocar as 8 ocorrências de `"Archivo, Arial"` por `ART_FONT_FAMILY`. **Este passo remove duas condicionais; não acrescenta nenhuma.**

- [ ] **Step 6: Rodar e conferir a dívida** — `npx vitest run src/components/art-studio/` → PASS; `grep -c "?" src/components/art-studio/ArtCanvas.tsx` ≤ 56.

- [ ] **Step 7: Commit**

```bash
git add src/components/art-studio/
git commit -m "fix(arte): medir o titulo em vez de contar caracteres, e nao descartar texto"
```

---

## Task 3: Hierarquia e contraste da borda

**Files:**
- Modify: `admin.module.css:6` (`--admin-line`), `:47-73`
- Modify: `VehicleEditor.tsx:105-106` ("Criar arte" → primário), `DangerActions.tsx:51-54`
- Test: `src/app/admin/contraste.test.ts` *(novo)*

**Interfaces:** nada consumido ou produzido por outra task.

- [ ] **Step 1: Escrever o teste que falha**

No espírito do guarda que já existe em `src/app/admin/css-classes.test.ts`:

```ts
it('a borda do painel tem 3:1 contra o fundo e contra a superficie', () => {
  const css = readFileSync('src/app/admin/admin.module.css', 'utf8');
  const token = (n: string) => css.match(new RegExp(`--admin-${n}:\\s*(#[0-9a-f]{6})`, 'i'))![1];
  expect(contraste(token('line'), token('bg'))).toBeGreaterThanOrEqual(3);
  expect(contraste(token('line'), token('surface'))).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Rodar e verificar que falha** — → FAIL (hoje 2,51:1 e 2,21:1).

- [ ] **Step 3: Subir `--admin-line` e separar os pesos de botão** — valor novo que satisfaça os dois limites; classe de ação destrutiva distinta de `buttonSecondary`; botão primário em "Criar arte". Alvos de toque (52px/44px) não mudam.

- [ ] **Step 4: Rodar** — `npx vitest run src/app/admin/` → PASS, incluindo `css-classes.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/
git commit -m "feat(painel): uma acao primaria por secao e borda com contraste conforme"
```

---

## Task 4: Exclusão do chat do site e controle real do WhatsApp

**Files:**
- Delete: `src/components/attendance/site-chat.module.css`, `atendimento/SiteModeForm.tsx`
- Modify: `src/server/attendance/settings.ts` (sai `defaultSiteMode`, `readSiteSetting`, `readAdminSiteSetting`, `listAdminSiteModeChanges`, `setSiteMode`; entra `setWhatsappMode`)
- Modify: `limits.ts:43,72,76`; `conversation-repository.ts:36`; `ensure-schema.ts:130-134`; `atendimento/actions.ts` (sai `changeSiteMode`, entra `changeWhatsappMode`)
- Create: `src/server/attendance/settings-whatsapp.test.ts`
- Create: `scripts/limpar-conversas-site.ts`

**Interfaces:**
- Consumes: `readWhatsappSetting()` já existente (`settings.ts:37`).
- Produces: `setWhatsappMode(requestedMode: unknown, expectedVersion: number): Promise<ChannelSettingRow>` — mesma concorrência otimista de `setSiteMode`, com `channel: 'whatsapp'`; `changeWhatsappMode(state, formData): Promise<ModeFormState>`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
it('cria a linha whatsapp quando ela nao existe e aplica o modo', async () => {});
it('recusa versao obsoleta com StaleAttendanceSettingError', async () => {});
it('registra a mudanca em channel_settings_audit com o canal whatsapp', async () => {});
it('a Dayse respeita o modo disabled', async () => { /* readWhatsappSetting devolve disabled */ });
```

O último é o que importa: hoje **não existe linha `whatsapp`** e a Dayse roda no padrão, sem freio.

- [ ] **Step 2: Rodar e verificar que falha** — `npx vitest run src/server/attendance/settings-whatsapp.test.ts` → FAIL.

- [ ] **Step 3: Implementar `setWhatsappMode` e a action** — espelhando `setSiteMode`, que sai no passo seguinte. Confirmação explícita de verdade: **não** repetir o `confirm: 'yes'` fixo que tornava a trava do servidor inalcançável (`SiteModeForm.tsx:145,155`).

- [ ] **Step 4: Remover o chat do site**

Apagar os arquivos listados; retirar de `settings.ts` as funções do canal `site`; retirar de `limits.ts` as três cotas de IA do site; retirar de `conversation-repository.ts:36` a criação de conversa `site`; retirar de `ensure-schema.ts:130-134` o `UPDATE` que reacende o modo. **Manter** `attendanceModeSchema`, `readWhatsappSetting`, `StaleAttendanceSettingError`, o enum `channel` e as tabelas.

- [ ] **Step 5: Rodar a suíte e remover os testes que cobriam o que saiu** — `npx vitest run` → PASS. Testes de `setSiteMode` saem junto com a função.

- [ ] **Step 6: Esconder conversa sem mensagem na caixa de entrada**

Teste primeiro, em `src/server/attendance/inbox.test.ts`:

```ts
it('nao lista conversa sem nenhuma mensagem', async () => { /* visitorTurns = 0 e 0 mensagens */ });
```

Depois o filtro em `listInbox` e `countInbox` (`inbox.ts:15-41`). Isto impede que a próxima conversa vazia apareça, independentemente da limpeza do passo 7.

- [ ] **Step 7: Apagar as 12 conversas vazias do canal `site`**

Script `scripts/limpar-conversas-site.ts`, no padrão de `scripts/grant-admin.ts` (exige `--execute-local` para escrever). Ele **conta e imprime antes de apagar**, e só apaga `channel = 'site' AND visitor_turns = 0` sem nenhuma linha em `conversation_messages`. Autorização do proprietário é item-a-item e cobre **apenas** estas conversas: a linha `site` de `channel_settings`, as 34 de `channel_settings_audit` e a tabela `demo_ai_usage` **ficam**.

Rodar: `npx tsx scripts/limpar-conversas-site.ts` (seco) e conferir que relata 12; depois com `--execute-local`.

- [ ] **Step 8: Commit**

```bash
git add src/server/ src/app/admin/ scripts/
git rm src/components/attendance/site-chat.module.css "src/app/admin/(protected)/atendimento/SiteModeForm.tsx"
git commit -m "feat(atendimento): remover o chat do site e dar um freio real na Dayse"
```

---

## Task 5: Barra de navegação e Ajustes

**Files:**
- Create: `.../AdminTabBar.tsx`, `.../AdminTabBar.test.tsx`, `.../ajustes/page.tsx`
- Modify: `(protected)/layout.tsx`, `atendimento/page.tsx:118-131`, `(protected)/page.tsx:44`, `admin.module.css`

**Interfaces:**
- Consumes: `countInbox()` (já filtrado na Task 4); `listAgenda` chega na Task 6 — até lá o contador da Agenda é `null`.
- Produces: `<AdminTabBar active="estoque" | "agenda" | "divulgar" | "conversas" counts={{ agenda: number | null; conversas: number | null }} />`. `null` renderiza o destino sem número.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
it('mostra os quatro destinos e marca o ativo', () => {
  render(<AdminTabBar active="agenda" counts={{ agenda: 2, conversas: 1 }} />);
  for (const n of ['Estoque', 'Agenda', 'Divulgar', 'Conversas']) {
    expect(screen.getByRole('link', { name: new RegExp(n) })).toBeTruthy();
  }
  expect(screen.getByRole('link', { name: /Agenda/ }).getAttribute('aria-current')).toBe('page');
});
it('renderiza sem numero quando a contagem falhou', () => {
  render(<AdminTabBar active="estoque" counts={{ agenda: null, conversas: null }} />);
  expect(screen.getByRole('link', { name: /Agenda/ }).textContent).not.toMatch(/\d/);
});
```

- [ ] **Step 2: Rodar e verificar que falha** — → FAIL.

- [ ] **Step 3: Implementar e montar no layout**

`<nav aria-label="Seções do painel">`, alvos de 44px, `env(safe-area-inset-bottom)` como `.stickyAction` já faz (`admin.module.css:114`). Contadores com tolerância a falha: console e `null`, nunca derrubar a tela — padrão de `(protected)/page.tsx:22-37`. **Reservar espaço no rodapé das telas**, que é o defeito P1-6 da auditoria (`.editorWithFooter` existe e nunca foi aplicada).

- [ ] **Step 4: Criar `/admin/ajustes` e mover a configuração da Meta**

`WhatsAppOnboardingCard` e `MetaTestNumberForm` saem de `atendimento/page.tsx` e vão para Ajustes, junto com o controle de modo do WhatsApp da Task 4. Os IDs codificados em `atendimento/page.tsx:94-96,106` viajam sem alteração de comportamento.

- [ ] **Step 5: Rodar a suíte** — `npx vitest run` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/
git commit -m "feat(painel): barra de quatro destinos e tela de ajustes"
```

---

## Task 6: Tabela de agendamentos

**Files:**
- Modify: `src/server/db/schema.ts`; `ensure-schema.ts`
- Create: `drizzle/0010_*.sql` via `npx drizzle-kit generate`
- Create: `src/server/attendance/appointments.ts`, `.../appointments.test.ts`
- Create: `src/server/attendance/visit-slot.ts`, `.../visit-slot.test.ts`

**Interfaces:**
- Consumes: `STORE_POLICY.horarioEstruturado`.
- Produces:
  - Tabela `visit_appointments`: `id uuid pk`, `conversationId uuid null references conversations(id) on delete cascade`, `vehicleId uuid null references vehicles(id) on delete set null`, `customerName text null`, `customerPhone text null`, `scheduledFor timestamptz null`, `quote text not null`, `source text not null` (`'agent' | 'manual'`), `createdBy text null references "user"(id)`, `createdAt`, `updatedAt`. Índice único parcial em `conversation_id where conversation_id is not null`.
  - `resolveVisitSlot(input: { data?: string; hora?: string; now: Date }): { scheduledFor: Date | null; reason: 'ok' | 'sem-data' | 'sem-hora' | 'fechado' | 'passado' | 'invalido' }`
  - `listAgenda(now: Date): Promise<{ hoje: Row[]; amanha: Row[]; semana: Row[]; depois: Row[]; semHora: Row[] }>`
  - `upsertAgentAppointment(input: { conversationId: string; vehicleId: string | null; scheduledFor: Date | null; quote: string; customerName: string | null; customerPhone: string | null }, tx?: Transaction): Promise<AppointmentRow>` — o `tx` opcional existe porque a Task 12 a chama **dentro** da transação de `commitAutomatedReply`.
  - `createManualAppointment`, `updateAppointment`, `deleteAppointment` — assinaturas na Task 7.

Nome e telefone ficam **na linha do agendamento**, porque o manual não tem conversa.

- [ ] **Step 1: Escrever o teste de `resolveVisitSlot` que falha**

Item 2 do Review Focus. `const now = new Date('2026-11-02T12:00:00-03:00'); // domingo`

```ts
it('resolve dia e hora dentro do horario da loja', () => {
  expect(resolveVisitSlot({ data: '2026-11-07', hora: '14:00', now }).reason).toBe('ok');
});
it('recusa domingo, porque a loja fecha', () => {
  expect(resolveVisitSlot({ data: '2026-11-08', hora: '10:00', now }).reason).toBe('fechado');
});
it('recusa fora de 9h as 18h', () => {
  expect(resolveVisitSlot({ data: '2026-11-07', hora: '20:30', now }).reason).toBe('fechado');
});
it('recusa data no passado', () => {
  expect(resolveVisitSlot({ data: '2026-10-30', hora: '10:00', now }).reason).toBe('passado');
});
it('sem hora devolve agendamento sem horario, nao um palpite', () => {
  const r = resolveVisitSlot({ data: '2026-11-07', now });
  expect(r.scheduledFor).toBeNull();
  expect(r.reason).toBe('sem-hora');
});
it('sem data devolve sem-data', () => { expect(resolveVisitSlot({ now }).reason).toBe('sem-data'); });
it('data impossivel nao estoura', () => {
  expect(resolveVisitSlot({ data: '2026-02-31', hora: '10:00', now }).reason).toBe('invalido');
});
```

Dias e limites de hora vêm de `STORE_POLICY.horarioEstruturado`. Qualquer `reason` diferente de `'ok'` dá `scheduledFor: null`.

- [ ] **Step 2: Rodar e verificar que falha** — `npx vitest run src/server/attendance/visit-slot.test.ts` → FAIL.

- [ ] **Step 3: Implementar `resolveVisitSlot`** — fuso America/Fortaleza.

- [ ] **Step 4: Escrever o teste de `appointments` que falha**

Item 3 do Review Focus:

```ts
it('remarcar na mesma conversa atualiza, nao duplica', async () => {
  await upsertAgentAppointment({ conversationId: c, scheduledFor: sabado14h, /* ... */ });
  await upsertAgentAppointment({ conversationId: c, scheduledFor: segunda10h, /* ... */ });
  expect(await contarDaConversa(c)).toBe(1);
});
it('agrupa em hoje, amanha, esta semana, depois e sem hora', async () => {});
it('esta semana termina no sabado; o que passa disso cai em depois', async () => {});
it('visita ja passada sai dos grupos futuros', async () => {});
```

- [ ] **Step 5: Rodar e verificar que falha** — → FAIL.

- [ ] **Step 6: Criar a tabela, gerar a migração, espelhar no ensure-schema**

`npx drizzle-kit generate`. O `ensure-schema.ts` ganha `CREATE TABLE IF NOT EXISTS` e `CREATE UNIQUE INDEX IF NOT EXISTS` equivalentes.

- [ ] **Step 7: Implementar `upsertAgentAppointment` e `listAgenda`** — `requireAdmin()` na leitura; agrupamento no fuso da loja.

- [ ] **Step 8: Rodar** — `npx vitest run src/server/attendance/` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/server/ drizzle/
git commit -m "feat(agenda): tabela de agendamentos e resolucao de horario da loja"
```

---

## Task 7: A agenda, alimentada à mão

É esta task que satisfaz o portão de §8.4: a aba nasce com conteúdo que o proprietário cria.

**Files:**
- Create: `.../agenda/page.tsx`, `.../agenda/VisitCard.tsx`, `.../agenda/ManualVisitForm.tsx`, `.../agenda/actions.ts`, mais `VisitCard.test.tsx` e `ManualVisitForm.test.tsx`
- Modify: `src/server/attendance/appointments.ts`; `(protected)/layout.tsx` (contador da Agenda passa a vir de `listAgenda`)

**Interfaces:**
- Consumes: `listAgenda`, `resolveVisitSlot` da Task 6; `AdminTabBar` da Task 5; `listAdminVehiclesWithCover` para escolher veículo.
- Produces:
  - `createManualAppointment(input: { customerName: string; customerPhone: string; vehicleId: string | null; data: string; hora: string }): Promise<AppointmentRow>` — `requireAdmin()`, `source: 'manual'`, `createdBy` com o id do administrador.
  - `updateAppointment(id: string, input: { data: string; hora: string; vehicleId: string | null }): Promise<AppointmentRow>`
  - `deleteAppointment(id: string): Promise<void>`
  - Actions `marcarVisita`, `corrigirVisita`, `cancelarVisita`, no padrão `FormState` de `veiculos/actions.ts:13`.

- [ ] **Step 1: Escrever o teste do repositório que falha**

```ts
it('cria agendamento manual com quem atendeu registrado', async () => { /* createdBy preenchido */ });
it('recusa horario fora do funcionamento com a mesma regra do agente', async () => { /* reusa resolveVisitSlot */ });
it('recusa telefone vazio', async () => {});
it('corrigir altera o horario sem criar outra linha', async () => {});
it('cancelar remove a linha', async () => {});
```

A segunda asserção é o ponto: a regra de horário é **uma só** para a Dayse e para o formulário.

- [ ] **Step 2: Rodar e verificar que falha** — → FAIL.

- [ ] **Step 3: Implementar as três funções e as três actions**

- [ ] **Step 4: Escrever os testes de tela que falham**

```tsx
it('mostra hora, nome, telefone, veiculo e a frase do cliente', () => {});
it('sem veiculo vinculado, o cartao nao inventa veiculo', () => {});
it('sem telefone, nao oferece o botao de WhatsApp', () => {});
it('pede nome, telefone, dia e hora, e permite escolher veiculo do estoque', () => {});
it('mostra o motivo quando a gravacao falha', () => {});
it('cancelar pede confirmacao em linha antes de remover', () => {});
```

O penúltimo repete a lição da Task 1. O último segue o padrão do painel: confirmação em linha, nunca modal.

- [ ] **Step 5: Rodar e verificar que falham** — → FAIL.

- [ ] **Step 6: Implementar a página, o cartão e o formulário**

Grupos nesta ordem: `Hoje`, `Amanhã`, `Esta semana`, `Depois`, `Combinado, sem hora certa`. Cartão com hora em destaque, nome, telefone, veículo com ano e preço, a frase, e ações WhatsApp / Ver conversa / Corrigir / Cancelar. Visitas de hoje já passadas aparecem apagadas até o fim do dia. Vazia, a tela convida a marcar a primeira visita — **não** finge ter conteúdo.

- [ ] **Step 7: Rodar a suíte** — `npx vitest run` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/\(protected\)/agenda/ src/server/attendance/ src/app/admin/\(protected\)/layout.tsx
git commit -m "feat(agenda): marcar, corrigir e cancelar visita pelo painel"
```

---

## Task 8: Divulgar e compartilhamento nativo

**Files:**
- Create: `.../divulgar/page.tsx`, `.../divulgar/page.test.tsx`
- Create: `src/components/art-studio/share-art.ts`, `.../share-art.test.ts`
- Modify: `ArtEditor.tsx:38-63, 124-128`

**Interfaces:**
- Consumes: `listAdminVehiclesWithCover({ status: 'published' })`; o `Blob` de `ArtEditor.tsx:49`.
- Produces: `deliverArt(params: { blob: Blob; filename: string; share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean; download: (b: Blob, n: string) => void }): Promise<'shared' | 'cancelled' | 'downloaded'>`

- [ ] **Step 1: Escrever o teste de `deliverArt` que falha**

Item 4 do Review Focus:

```ts
it('compartilha quando o aparelho aceita arquivos', async () => {
  const share = vi.fn().mockResolvedValue(undefined); const download = vi.fn();
  await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => true, download })).resolves.toBe('shared');
  expect(download).not.toHaveBeenCalled();
});
it('baixa quando o aparelho nao compartilha arquivo', async () => {
  const download = vi.fn();
  await expect(deliverArt({ blob, filename: 'arte.jpg', canShare: () => false, download })).resolves.toBe('downloaded');
});
it('cancelar a folha do sistema nao e erro', async () => {
  const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
  const download = vi.fn();
  await expect(deliverArt({ blob, filename: 'arte.jpg', share, canShare: () => true, download })).resolves.toBe('cancelled');
  expect(download).not.toHaveBeenCalled();
});
it('falha que nao e cancelamento cai no download', async () => { /* name: 'NotAllowedError' */ });
```

- [ ] **Step 2: Rodar e verificar que falha** — → FAIL.

- [ ] **Step 3: Implementar `deliverArt`** — `AbortError` devolve `'cancelled'` sem efeito; qualquer outra falha cai no download.

- [ ] **Step 4: Reordenar o fluxo do estúdio para o iOS**

Hoje `download()` faz `await fetch('/art-check')` **antes** de gerar o blob (`ArtEditor.tsx:44-49`). No Safari do iOS esse `await` consome a ativação do usuário e `navigator.share` é recusado. Gerar o blob dentro do mesmo toque e conferir a versão sem perder a ativação. **A trava de versão não pode ser abandonada**: existe para a arte não sair com preço velho.

- [ ] **Step 5: Trocar os dois botões por uma ação de envio e uma de download**

"Baixar PNG" / "Baixar JPEG" (`:124-128`) dão lugar a "Enviar para…" (primário) e "Baixar" (secundário). O formato de arquivo passa a ser decisão do código.

- [ ] **Step 6: Criar `/admin/divulgar`**

Teste primeiro: lista os publicados com atalho para o estúdio; **e explica o que fazer quando não há veículo publicado**, porque `artExportProblem` (`policy.ts:6`) recusa arte de não publicado. `metadata` com `robots: { index: false, follow: false }`.

- [ ] **Step 7: Rodar a suíte** — `npx vitest run` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/art-studio/ src/app/admin/\(protected\)/divulgar/
git commit -m "feat(arte): enviar pelo compartilhamento do aparelho e porta de divulgacao"
```

---

## Task 9: Roteiro de apresentação

**Files:** Create: `docs/ROTEIRO_APRESENTACAO.md`

- [ ] **Step 1: Escrever o roteiro**

Ordem de telas no celular, uma seção por aba. Precisa cobrir: marcar uma visita ao vivo na agenda (é o que dá conteúdo à tela); o que dizer se um envio de arte falhar; a diferença a apontar em relação ao Vapo — marca, modelo, ano e preço vindo do cadastro em vez de digitados; e **o aviso de §8.5**: o número conectado é de teste, então demonstração ao vivo do atendimento exige telefone autorizado na Meta.

- [ ] **Step 2: Percorrer o roteiro no `npm run dev`**, em viewport de celular, confirmando que cada tela citada existe e a ordem não tem beco.

- [ ] **Step 3: Commit**

```bash
git add docs/ROTEIRO_APRESENTACAO.md
git commit -m "docs: roteiro de apresentacao do painel"
```

> **PORTÃO DA DEMONSTRAÇÃO.** Ao fim da Task 9 o sistema é apresentável e a agenda tem conteúdo real. A Etapa 2 pode ser interrompida sem deixar o painel incoerente.

---

# ETAPA 2 — A agenda se alimenta sozinha

## Task 10: Nome, telefone e tenant do cliente

**Files:**
- Modify: `schema.ts:190-217`; `ensure-schema.ts:36-54` e após `:93`; `incoming.ts:24-73`; `webhook-handler.ts:138-142`
- Create: `drizzle/0011_*.sql`; `src/server/attendance/customer-name.ts`, `.../customer-name.test.ts`, `src/server/agent/incoming.test.ts`

**Interfaces:**
- Produces:
  - `conversations.customerName: text | null`, `.customerPhone: text | null`, `.tenantId: text | null`
  - `IncomingWhatsappMessage` ganha `customerName?: string | null`
  - `ensureWhatsappConversation(token: string, identity?: { tenantId: string; phone: string; name: string | null }, now?: Date)`
  - `cleanCustomerName(raw: string | null): string | null` — aplica `semGritar` e corta em 40 caracteres

- [ ] **Step 1: Escrever o teste de `cleanCustomerName` que falha**

Item 1 do Review Focus:

```ts
it('nao grita o nome escrito em caixa alta', () => {
  expect(cleanCustomerName('MARCOS ANDRADE DA SILVA')).toBe('Marcos andrade da silva');
});
it('preserva nome curto e sigla', () => {
  expect(cleanCustomerName('Ana')).toBe('Ana');
  expect(cleanCustomerName('JR')).toBe('JR');
});
it('corta nome longo demais para o cartao', () => {
  expect(cleanCustomerName('x'.repeat(80))!.length).toBeLessThanOrEqual(40);
});
it('devolve null para vazio, espacos e null', () => {
  expect(cleanCustomerName('   ')).toBeNull();
  expect(cleanCustomerName(null)).toBeNull();
});
```

- [ ] **Step 2: Rodar e verificar que falha** — → FAIL.

- [ ] **Step 3: Implementar, reusando `semGritar`** — vive em `ficha.ts:29`; importar de lá ou mover para módulo compartilhado. **O comportamento de `semGritar` não muda**, e `ficha.test.ts` prova.

- [ ] **Step 4: Acrescentar as três colunas e gerar a migração** — `npx drizzle-kit generate`; esperado: aditiva, três `ADD COLUMN`, sem `DROP` nem `NOT NULL` sem default.

- [ ] **Step 5: Espelhar em `ensure-schema.ts`** — três `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` no estilo de `:90-93`, **e** as colunas no `CREATE TABLE IF NOT EXISTS` de `:37-54`.

- [ ] **Step 6: Escrever o teste de persistência que falha**

```ts
it('guarda telefone, nome e tenant na criacao da conversa', async () => {});
it('atualiza o nome quando o cliente troca o perfil, sem mexer no telefone', async () => {});
it('conversa antiga sem telefone continua recebendo mensagem sem erro', async () => { /* item 5 */ });
```

- [ ] **Step 7: Rodar e verificar que falha** — → FAIL.

- [ ] **Step 8: Persistir a identidade**

`ensureWhatsappConversation` grava telefone e `tenantId` na criação; `recordIncomingWhatsappMessage` passa `customerName` adiante e atualiza o nome quando mudou. `webhook-handler.ts:138-142` passa a incluir `customerName`, que hoje morre ali.

- [ ] **Step 9: Rodar a suíte** — `npx vitest run` → PASS.

- [ ] **Step 10: Commit**

```bash
git add src/server/ drizzle/
git commit -m "feat(atendimento): guardar nome, telefone e tenant que a Meta ja envia"
```

---

## Task 11: A resposta do vendedor chega, ou diz por que não

**Files:**
- Create: `src/server/attendance/reply-window.ts`, `.../reply-window.test.ts`, `.../operator-reply.test.ts`
- Modify: `inbox.ts:71-74`; `atendimento/actions.ts:118-122`; `InboxOperatorControls.tsx:51-84`

**Interfaces:**
- Consumes: `customerPhone`, `tenantId`, `channel` da Task 10; `sendWhatsAppTextMessage` (`outbound.ts:26`); `findActiveTenantByPhoneNumberId`, `decryptAccessToken`.
- Produces:
  - `replyWindowState(lastVisitorMessageAt: Date | null, now: Date): 'open' | 'closed' | 'unknown'` — 24h a partir da última mensagem com `sender = 'visitor'`
  - `replyToInboxConversation(id, body)` passa a devolver `{ message: MessageRow; delivered: boolean; reason: string | null }`

- [ ] **Step 1: Escrever o teste de `replyWindowState` que falha**

```ts
it('aberta dentro de 24h da ultima mensagem do cliente', () => {});
it('fechada passadas 24h', () => {});
it('desconhecida quando nunca houve mensagem do cliente', () => {
  expect(replyWindowState(null, now)).toBe('unknown');
});
```

- [ ] **Step 2: Rodar e verificar que falha** — → FAIL.

- [ ] **Step 3: Implementar `replyWindowState`**

- [ ] **Step 4: Escrever o teste de entrega que falha**

Item 5 do Review Focus:

```ts
it('entrega no WhatsApp a resposta do vendedor', async () => { /* espera envio com telefone e tenant guardados */ });
it('nao declara entrega quando a Meta recusa', async () => {
  const r = await replyToInboxConversation(id, 'texto');
  expect(r.delivered).toBe(false);
  expect(r.reason).toBeTruthy();
});
it('conversa antiga sem telefone ou tenant explica em vez de estourar', async () => {
  expect((await replyToInboxConversation(idAntigo, 'texto')).delivered).toBe(false);
});
it('fora da janela de 24h nao tenta enviar', async () => { /* envio nao chamado */ });
```

- [ ] **Step 5: Rodar e verificar que falha** — → FAIL (hoje `appendHumanReplyAs` só grava).

- [ ] **Step 6: Entregar de verdade**

Enviar pela Cloud API depois de gravar, resolvendo `phoneNumberId` e token por `tenantId`. O registro da falha segue o padrão `envio_falhou` de `run.ts`; há precedente de teste em `src/server/agent/send-failure.test.ts`.

- [ ] **Step 7: A tela parar de mentir**

`atendimento/actions.ts:118-122` devolve "Resposta enviada." sempre; passa a refletir `delivered`. Em `InboxOperatorControls`: janela fechada esconde a caixa e oferece link `wa.me`; conversa sem telefone ou tenant esconde a caixa e explica que é anterior ao registro de contato. **Nunca** uma caixa que aceita texto e o descarta.

- [ ] **Step 8: Rodar a suíte** — `npx vitest run` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/server/attendance/ src/app/admin/\(protected\)/atendimento/
git commit -m "fix(atendimento): resposta do vendedor chega ao cliente, ou diz por que nao"
```

---

## Task 12: A Dayse resolve dia e hora

**Files:**
- Modify: `tools.ts:33-36, 213-217, 255-261`; `prompt.ts:14, 23, 88`; `run.ts:203`; `conversation-repository.ts:118-148`; `evals/corpus.jsonl`; `src/server/agent/eval-corpus.test.ts`

**Interfaces:**
- Consumes: `resolveVisitSlot` e `upsertAgentAppointment` da Task 6; identidade da Task 10.
- Produces:
  - `marcarVisitaSchema = z.object({ data: z.string().optional(), hora: z.string().optional(), frase: z.string().trim().min(1).max(60), veiculoId: z.string().optional() })`, ferramenta `marcar_visita`
  - `AgentTurnState` ganha `appointment: { scheduledFor: Date | null; quote: string; vehicleId: string | null } | null`

- [ ] **Step 1: Dar a data de hoje ao modelo**

`AGENT_SYSTEM_PROMPT` é hoje constante estática usada em `run.ts:203`. **Sem a data corrente o modelo não tem como resolver "sábado" para `2026-11-07`.** Passa a receber data e dia da semana do turno, em America/Fortaleza. Os testes de `prompt.test.ts` devem continuar valendo.

- [ ] **Step 2: Escrever o teste da ferramenta que falha**

```ts
it('marcar_visita anota dia, hora e a frase do cliente', async () => { /* state.appointment preenchido */ });
it('marcar_visita sem dia anota a frase sem horario', async () => { /* scheduledFor null */ });
it('marcar_visita nao inventa data quando o cliente nao deu', async () => {});
it('marcar_visita com pedido fora do horario nao grava horario', async () => { /* reason fechado */ });
```

- [ ] **Step 3: Rodar e verificar que falha** — `npx vitest run src/server/agent/tools.test.ts` → FAIL.

- [ ] **Step 4: Acrescentar a ferramenta e persistir na transação do turno**

`marcar_visita` registra em `AgentTurnState`. `commitAutomatedReply` (`conversation-repository.ts:118`) persiste o agendamento **na mesma transação** da mensagem e dos `facts`, e aplica `retentionFrom(now, true)` — visita marcada é lead, logo 180 dias, que hoje só acontece em handoff (`:141`). O campo `visit` de `registrar_lead` **permanece** para a ficha do vendedor.

- [ ] **Step 5: Fazer a Dayse contrapropor fora do horário**

Instrução no prompt: a loja atende de segunda a sábado, 9h–18h; pedido fora disso recebe uma alternativa próxima, não um "não". Valores vindos de `STORE_POLICY`, nunca redigitados no texto.

- [ ] **Step 6: Cobrir no corpus de avaliação**

Casos novos em `evals/corpus.jsonl`: cliente que dá dia e hora; só o dia; pede domingo; pede 21h. Guarda em `guards.ts` se a saída puder afirmar horário que não foi agendado — a Dayse não pode dizer "marquei" sem agendamento, nem anunciar horário que a loja não atende.

- [ ] **Step 7: Rodar a suíte** — `npx vitest run` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/ evals/
git commit -m "feat(agente): Dayse resolve dia e hora e contrapropoe fora do horario"
```

---

## Task 13: A agenda com o cartão completo

**Files:**
- Modify: `.../agenda/page.tsx`, `.../agenda/VisitCard.tsx` e seus testes; `src/server/attendance/appointments.ts`

**Interfaces:**
- Consumes: identidade da Task 10; agendamentos da Dayse da Task 12; `organizarFicha` (`ficha.ts:41`) para orçamento e troca.
- Produces: nada.

- [ ] **Step 1: Escrever os testes que falham**

```tsx
it('mostra o que a ficha apurou de orcamento e troca', () => {});
it('mostra a frase do cliente sobre a visita, tratada por semGritar', () => {});
it('nome em caixa alta aparece tratado, ponta a ponta', () => { /* item 1 do Review Focus */ });
it('agendamento da Dayse e agendamento manual aparecem no mesmo grupo, ordenados por hora', () => {});
```

- [ ] **Step 2: Rodar e verificar que falha** — → FAIL.

- [ ] **Step 3: Completar o cartão** — nome e telefone vindos da conversa quando `source = 'agent'`, da própria linha quando `'manual'`; orçamento e troca da ficha; link "Ver conversa" só quando há conversa.

- [ ] **Step 4: Rodar a suíte** — `npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/\(protected\)/agenda/ src/server/attendance/
git commit -m "feat(agenda): cartao completo com o que a Dayse apurou"
```

---

## Verificação final

- [ ] `npx vitest run` — verde, contagem ≥ 482
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npx drizzle-kit generate` não produz migração nova (schema e migrações em acordo)
- [ ] `grep -c "?" src/components/art-studio/ArtCanvas.tsx` ≤ 56
- [ ] `grep -rn "readSiteSetting\|setSiteMode\|SiteModeForm\|site-chat" src/` não encontra nada
- [ ] Percorrer `docs/ROTEIRO_APRESENTACAO.md` no celular, de ponta a ponta
