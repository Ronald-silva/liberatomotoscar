# Cadastro guiado de veículo no celular — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O proprietário cadastra e publica um veículo com fotos pelo celular, numa tela só, sem botão de salvar e com uma única ação principal no fim.

**Architecture:** Continuação da branch `painel-cadastro-simples`. O servidor ganha três funções (`setCoverPhoto`, `discardDraft`, `countAdminVehiclesByStatus`), um estado terminal `discarded` e duas correções de comportamento. No cliente, um dono único do rascunho (`useVehicleDraft`) passa a ser a fonte da versão, das pendências e da fila de escrita, alimentando as três seções da tela; `VehicleForms`, `PhotoUpload`, `PhotoGallery` e `StatusActions` deixam de receber `version` por prop renderizada no servidor.

**Tech Stack:** Next 16.4.2 (App Router, server actions), React 19.3, Drizzle + Postgres (Neon), Zod 4, Cloudflare R2 via `@aws-sdk/client-s3`, Vitest 5, Playwright (novo), happy-dom (novo).

**Spec:** `docs/superpowers/specs/2026-10-26-cadastro-mobile-guiado-design.md`

## Global Constraints

- Não regredir nada de `5637c17`: chips, combobox, máscaras, ausência de `capture` no input de galeria, lista de pendências, 4 consultas por tela.
- `requireAdmin()` dentro de toda função nova do serviço. O layout de `(protected)` não é barreira no Next 16.
- Toda escrita exige `expectedVersion` e incrementa `versionNumber`; divergência lança `StaleVehicleError`.
- Exclusão é sempre lógica: nunca `DELETE` em `vehicles` nem em `vehicle_audit`.
- `delete` no R2 só para imagem com `storageProvider === 'r2'`.
- Corpo de server action: 4 MB. Redução no cliente: lado maior 1920 px, JPEG 0,82, teto 3,5 MB.
- Nenhum provedor de credenciais de teste nem desvio de autenticação no código de produção.
- Alvos de toque ≥ 44 px; sem rolagem horizontal; alvo primário 360–430 px.
- Mensagens ao usuário passam por `feedback.ts`; texto novo entra no mapa `KNOWN`.
- Migração roda **só com ordem explícita do proprietário**, antes do deploy.
- `vitest.config.mts` inclui hoje apenas `src/**/*.test.ts`.

## Review Focus

1. **Teclado virtual aberto em 360 px** cobrindo o rodapé fixo ou o campo em foco — o campo e a mensagem de erro têm de permanecer visíveis. (Task 10)
2. **Gravação automática falhando sem rede** — o valor digitado não pode desaparecer e precisa de caminho de "Tentar de novo". (Task 7)
3. **`StaleVehicleError` durante a gravação automática** (duas abas na mesma tela) — mensagem compreensível com link de recarregar, não falha silenciosa. (Task 7)
4. **Foto HEIC/HEIF do Android que `createImageBitmap` recusa** — mensagem clara em vez de nada acontecer. (Task 9)
5. **Rascunho recém-criado, com marca, modelo, preço, ano e cor nulos** — título, resumo e checklist renderizam sem quebrar. (Task 11)

---

### Task 1: Estado terminal `discarded` no modelo

**Files:**
- Modify: `src/server/db/schema.ts:64` (enum de `status`), `src/server/db/schema.ts:76` (check `vehicle_status_valid`)
- Create: `drizzle/0005_vehicle_status_discarded.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/server/vehicles/validation.ts:5` (`vehicleStatus`), `src/server/vehicles/validation.ts:22-28` (`allowedStatusTransitions`)
- Modify: `src/server/vehicles/service.ts:149-175` (`changeVehicleStatus`)
- Modify: `src/app/admin/(protected)/veiculos/status.ts:1`
- Test: `src/server/vehicles/validation.test.ts`

**Interfaces:**
- Produces: `vehicleStatus` aceita `'discarded'`; `statusLabels.discarded === 'Descartado'`; `allowedStatusTransitions` **não** contém `'discarded'` em nenhuma lista; `changeVehicleStatus` rejeita `'discarded'`.

- [ ] **Step 1: Write the failing tests** em `validation.test.ts`

```ts
it('aceita discarded como estado válido', () => {
  expect(vehicleStatus.parse('discarded')).toBe('discarded');
});

it('não oferece discarded como transição de nenhum estado', () => {
  for (const targets of Object.values(allowedStatusTransitions)) {
    expect(targets).not.toContain('discarded');
  }
});

it('não permite transição a partir de discarded', () => {
  expect(allowedStatusTransitions.discarded).toEqual([]);
  expect(() => assertStatusTransition('discarded', 'draft')).toThrow('Mudança de estado não permitida.');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/vehicles/validation.test.ts`
Expected: FAIL — `'discarded'` não está no enum.

- [ ] **Step 3: Adicionar `'discarded'`** ao enum de `status` em `schema.ts`, ao check `vehicle_status_valid`, a `vehicleStatus` em `validation.ts`, a `allowedStatusTransitions` como `discarded: []`, e `discarded: 'Descartado'` a `statusLabels`. `actionLabels` **não** ganha entrada: não existe botão que leve a `discarded` por transição de estado.

- [ ] **Step 4: Rejeitar `'discarded'` em `changeVehicleStatus`** (`service.ts`), antes da transação: `if (status === 'discarded') throw new Error('Use a exclusão do rascunho.')`. Registrar a mensagem em `feedback.ts`.

- [ ] **Step 5: Escrever a migração** `drizzle/0005_vehicle_status_discarded.sql` como SQL manual (drizzle-kit não gera `ALTER` de check constraint de forma confiável), e acrescentar a entrada `idx: 5`, `tag: "0005_vehicle_status_discarded"` em `_journal.json`:

```sql
ALTER TABLE vehicles DROP CONSTRAINT vehicle_status_valid;--> statement-breakpoint
ALTER TABLE vehicles ADD CONSTRAINT vehicle_status_valid
  CHECK (status IN ('draft', 'published', 'reserved', 'sold', 'archived', 'discarded'));
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/server/vehicles/validation.test.ts && npm run typecheck`
Expected: PASS. **Não rodar `db:migrate`** nesta task.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/schema.ts src/server/vehicles/validation.ts src/server/vehicles/service.ts \
  src/app/admin/\(protected\)/veiculos/status.ts src/app/admin/\(protected\)/veiculos/feedback.ts \
  drizzle/0005_vehicle_status_discarded.sql drizzle/meta/_journal.json src/server/vehicles/validation.test.ts
git commit -m "feat: adicionar o estado terminal Descartado ao modelo de veículo"
```

---

### Task 2: `discardDraft` no serviço

**Files:**
- Modify: `src/server/vehicles/service.ts` (função nova ao fim)
- Modify: `src/server/vehicles/validation.ts` (`isDiscardable`)
- Test: `src/server/vehicles/validation.test.ts`, `src/server/vehicles/service.integration.test.ts`

**Interfaces:**
- Consumes: `discarded` e `statusLabels` da Task 1.
- Produces: `isDiscardable(vehicle: { status: string; publishedAt: Date | null }): boolean`; `discardDraft(vehicleId: string, expectedVersion: number, storage?: PhotoStorage): Promise<{ status: 'discarded'; versionNumber: number }>`

- [ ] **Step 1: Write the failing tests**

Em `validation.test.ts`:

```ts
it('só permite excluir rascunho que nunca foi publicado', () => {
  expect(isDiscardable({ status: 'draft', publishedAt: null })).toBe(true);
  expect(isDiscardable({ status: 'draft', publishedAt: new Date() })).toBe(false);
  expect(isDiscardable({ status: 'published', publishedAt: new Date() })).toBe(false);
  expect(isDiscardable({ status: 'archived', publishedAt: null })).toBe(false);
});
```

Em `service.integration.test.ts` (seguindo o padrão de `TEST_DATABASE_URL` já usado no arquivo, com `PhotoStorage` dublê):

```ts
it('descarta o rascunho, apaga as linhas de imagem e os objetos r2, e mantém a auditoria', …);
it('não apaga objeto de imagem com provedor legacy_public', …);
it('recusa descartar um veículo que já foi publicado', …);   // espera 'Não é possível excluir um anúncio que já foi publicado.'
it('recusa descartar com versão velha', …);                   // espera StaleVehicleError
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/vehicles/validation.test.ts src/server/vehicles/service.integration.test.ts`
Expected: FAIL — `isDiscardable` e `discardDraft` não existem.

- [ ] **Step 3: Implementar `isDiscardable`** em `validation.ts`: verdadeiro só com `status === 'draft'` e `publishedAt === null`.

- [ ] **Step 4: Implementar `discardDraft`** em `service.ts`, no padrão de `removePhoto`: `requireAdmin()`, `idSchema`/`versionInput`, transação com `.for('update')`, checagem de versão, `isDiscardable` (senão lança `'Não é possível excluir um anúncio que já foi publicado.'`), `delete` das linhas de `vehicle_images`, `update` do veículo para `status: 'discarded'` com `versionNumber` incrementado, `audit(..., 'discarded', before)`. Os objetos do R2 são apagados **depois do commit**, só os de provedor `r2`, com `try/catch` por chave como em `removePhoto`. Registrar a mensagem nova em `feedback.ts`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/server/vehicles && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: excluir rascunho de veículo sem destruir o histórico"
```

---

### Task 3: `setCoverPhoto` no serviço

**Files:**
- Modify: `src/server/vehicles/service.ts`
- Test: `src/server/vehicles/service.integration.test.ts`

**Interfaces:**
- Produces: `setCoverPhoto(vehicleId: string, imageId: string, expectedVersion: number): Promise<{ vehicleVersion: number }>`

- [ ] **Step 1: Write the failing tests**

```ts
it('marca a foto escolhida como capa e desmarca a anterior', …);
it('devolve a versão nova do veículo', …);         // vehicleVersion === before + 1
it('recusa imagem de outro veículo', …);           // VehicleNotFoundError
it('recusa com versão velha', …);                  // StaleVehicleError
it('não falha ao definir como capa a foto que já é capa', …);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/vehicles/service.integration.test.ts`
Expected: FAIL — `setCoverPhoto` não existe.

- [ ] **Step 3: Implementar `setCoverPhoto`** em `service.ts`. O índice único parcial `vehicle_images_one_cover_uidx` impede duas capas, então na mesma transação: desmarcar a capa atual **antes** de marcar a nova. Auditoria `cover_changed` com `{ imageId }`. Devolve `{ vehicleVersion }` no mesmo formato que `addPhoto`, para o cliente encadear a versão.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/server/vehicles && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: definir a foto de capa do anúncio"
```

---

### Task 4: `updateVehicle` sem auditoria redundante

**Files:**
- Modify: `src/server/vehicles/service.ts:143`
- Test: `src/server/vehicles/service.integration.test.ts`

**Interfaces:**
- Produces: comportamento — `updateVehicle` não grava `details_updated` quando nenhum campo de detalhe mudou de valor. `versionNumber` continua incrementando em toda chamada.

- [ ] **Step 1: Write the failing tests**

```ts
it('não grava auditoria de detalhes quando nada mudou de valor', …);  // conta linhas de vehicle_audit antes/depois
it('grava auditoria de detalhes quando um campo muda', …);
it('ainda incrementa a versão quando nada mudou', …);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/vehicles/service.integration.test.ts`
Expected: FAIL — a auditoria é gravada hoje sempre que `data` tem chaves.

- [ ] **Step 3: Trocar a condição** em `service.ts:143`: gravar `details_updated` só quando alguma chave de `data` tiver valor diferente do mesmo campo em `before`. Comentar o porquê (gravação automática geraria dezenas de linhas idênticas numa tabela append-only).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/server/vehicles && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix: não registrar auditoria de detalhes quando nada mudou"
```

---

### Task 5: Estoque por estado no serviço

**Files:**
- Modify: `src/server/vehicles/service.ts:91-99`
- Test: `src/server/vehicles/service.integration.test.ts`

**Interfaces:**
- Produces: `listAdminVehiclesWithCover(options?: { status?: VehicleStatus; storage?: PhotoStorage })` — sem `status`, exclui `discarded`; `countAdminVehiclesByStatus(): Promise<Record<VehicleStatus, number>>`

- [ ] **Step 1: Write the failing tests**

```ts
it('exclui descartados da listagem sem filtro', …);
it('lista apenas o estado pedido', …);
it('conta os veículos por estado, com zero nos estados sem veículo', …);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/vehicles/service.integration.test.ts`
Expected: FAIL — assinatura antiga e `countAdminVehiclesByStatus` inexistente.

- [ ] **Step 3: Mudar a assinatura de `listAdminVehiclesWithCover`** para o objeto de opções, mantendo a consulta única com `leftJoin` (sem N+1) e o `photoUrlResolver`. Adicionar `countAdminVehiclesByStatus` com um `group by status` e `count(*)::int`, preenchendo com zero os estados ausentes. Atualizar a chamada em `src/app/admin/(protected)/page.tsx` para a assinatura nova.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/server && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: listar e contar o estoque por estado"
```

---

### Task 6: Server actions do cliente

**Files:**
- Modify: `src/app/admin/(protected)/veiculos/actions.ts`
- Test: `src/app/admin/(protected)/veiculos/actions.test.ts`

**Interfaces:**
- Consumes: `discardDraft`, `setCoverPhoto` (Tasks 2–3); `publishRequirements`.
- Produces: `type FormState = { message: string | null; version?: number; missing?: readonly string[] }`;
  `saveVehicle(state, formData)` devolve `version` e `missing` em caso de sucesso;
  `setVehicleCover(state, formData)` — campos `id`, `version`, `imageId`;
  `discardVehicleDraft(state, formData)` — campos `id`, `version`; redireciona para `/admin` em caso de sucesso.

- [ ] **Step 1: Write the failing tests** em `actions.test.ts`, no padrão de mock já usado no arquivo

```ts
it('saveVehicle devolve a versão nova e o que falta para publicar', …);
it('saveVehicle não revalida a rota de detalhe', …);        // revalidatePath chamado só com '/admin'
it('setVehicleCover repassa imageId e versão ao serviço', …);
it('discardVehicleDraft redireciona ao estoque após excluir', …);
it('discardVehicleDraft devolve mensagem própria quando o anúncio já foi publicado', …);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/admin/\(protected\)/veiculos/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Estender `FormState` com `missing`** e fazer `saveVehicle` devolver `version` e `missing`. A lista vem de `publishRequirements(after, imageCount)` — `updateVehicle` precisa devolver a contagem de imagens junto, ou a action a consulta; escolher o caminho que mantenha as 4 consultas por tela. `revalidatePath` da rota de detalhe sai de `saveVehicle` (o cliente é o dono da versão e das pendências); `revalidatePath('/admin')` fica.

- [ ] **Step 4: Implementar `setVehicleCover` e `discardVehicleDraft`** reusando o helper `run`. `discardVehicleDraft` redireciona com `redirect('/admin')` **fora** do `try`, como `createVehicle` já faz.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/app && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: actions de capa, exclusão de rascunho e pendências no retorno do salvamento"
```

---

### Task 7: Dono único do rascunho no cliente

**Files:**
- Create: `src/app/admin/(protected)/veiculos/[id]/useVehicleDraft.ts`
- Create: `src/app/admin/(protected)/veiculos/[id]/useVehicleDraft.test.tsx`
- Modify: `vitest.config.mts` (incluir `src/**/*.test.tsx`, ambiente `happy-dom` para `.tsx`)
- Modify: `package.json` (devDependency `happy-dom`)

**Interfaces:**
- Consumes: `saveVehicle`, `setVehicleCover`, `addVehiclePhoto`, `removeVehiclePhoto` (Task 6 e existentes).
- Produces: `useVehicleDraft({ vehicleId, initialVersion, initialFields, initialMissing })` devolvendo
  `{ fields, set(name, value), flush(), saveState: 'idle' | 'saving' | 'saved' | 'error', retry(), missing, version, enqueue<T>(job: (version: number) => Promise<{ version?: number; message: string | null }>) }`

- [ ] **Step 1: Instalar `happy-dom`** e habilitar `.test.tsx` em `vitest.config.mts` com `environmentMatchGlobs` (ou `environment: 'happy-dom'` por arquivo via comentário de docblock).

- [ ] **Step 2: Write the failing tests**

```tsx
it('grava 800 ms depois da última digitação, uma vez só', …);     // timers falsos; saveVehicle chamado 1x
it('grava imediatamente quando o campo perde o foco', …);
it('mantém o valor digitado quando a gravação falha e expõe retry', …);
it('avança a versão com a que a action devolveu', …);
it('serializa: a segunda escrita espera a primeira terminar', …); // enqueue durante saving
it('não perde a fila de fotos quando uma gravação entra no meio', …);
it('mostra a mensagem de anúncio alterado quando a action devolve StaleVehicleError', …);
it('atualiza missing com o que a action devolveu', …);
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/app/admin/\(protected\)/veiculos/\[id\]/useVehicleDraft.test.tsx`
Expected: FAIL — hook não existe.

- [ ] **Step 4: Implementar `useVehicleDraft`.** Fila com uma escrita em voo: uma `Promise` encadeada guardada em `useRef`, e `version` num `useRef` mais `useState` (o ref para a próxima escrita ler sem esperar re-render). `enqueue` é o que `PhotoUpload` e `PhotoGallery` usam, para que foto e gravação nunca invalidem a versão uma da outra. Debounce de 800 ms com `setTimeout` em ref, cancelado por `flush()`. Falha preserva `fields` e deixa `saveState: 'error'`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/app && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: dono único da versão, das pendências e da fila de escrita do rascunho"
```

---

### Task 8: Seção 1 — o veículo, sem botão de salvar

**Files:**
- Modify: `src/app/admin/(protected)/veiculos/[id]/VehicleForms.tsx`
- Create: `src/app/admin/(protected)/veiculos/[id]/SaveIndicator.tsx`
- Create: `src/app/admin/(protected)/veiculos/[id]/VehicleForms.test.tsx`
- Modify: `src/app/admin/admin.module.css`

**Interfaces:**
- Consumes: `useVehicleDraft` (Task 7); `ChipPicker`, `Combobox`, `masks.ts` inalterados.
- Produces: `VehicleForms({ draft, type, currentYear })` onde `draft` é o retorno de `useVehicleDraft`; `SaveIndicator({ state, onRetry })`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('não renderiza nenhum botão de salvar', …);
it('mantém o valor digitado depois de uma gravação com erro', …);
it('anuncia o estado da gravação em região aria-live', …);
it('mostra Tentar de novo quando a gravação falhou', …);
it('continua oferecendo os chips de marca e as sugestões de modelo', …);  // guarda anti-regressão de 5637c17
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/admin/\(protected\)/veiculos/\[id\]/VehicleForms.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Converter `VehicleForms`** para consumir `draft` em vez de `useActionState` próprio: o `<form>` e os campos ocultos saem, `onBlur` chama `draft.flush()`, cada `onChange` chama `draft.set`. `SubmitButton` e `styles.formSticky` saem deste componente. Os campos, ordens, máscaras, `details` de opcionais e textos de ajuda ficam exatamente como estão.

- [ ] **Step 4: Implementar `SaveIndicator`** com `role="status"` e `aria-live="polite"`: `Salvando...`, `✓ salvo`, ou a mensagem de erro com botão `Tentar de novo`. Classes novas em `admin.module.css`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/app && npm run lint`
Expected: PASS — inclusive `css-classes.test.ts`, que acusa classe inexistente.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: seção do veículo grava sozinha, sem botão de salvar"
```

---

### Task 9: Seção 2 — câmera, galeria e capa

**Files:**
- Modify: `src/app/admin/(protected)/veiculos/PhotoUpload.tsx`, `src/app/admin/(protected)/veiculos/PhotoGallery.tsx`
- Create: `src/app/admin/(protected)/veiculos/PhotoUpload.test.tsx`, `src/app/admin/(protected)/veiculos/PhotoGallery.test.tsx`
- Modify: `src/app/admin/admin.module.css`

**Interfaces:**
- Consumes: `draft.enqueue` (Task 7); `setVehicleCover` (Task 6).
- Produces: `PhotoUpload({ vehicleId, draft })`; `PhotoGallery({ vehicleId, draft, photos })` com `GalleryPhoto` inalterado.

- [ ] **Step 1: Write the failing tests**

```tsx
it('oferece dois botões: tirar foto e escolher da galeria', …);
it('o input da câmera usa capture environment e aceita um arquivo', …);
it('o input da galeria não usa capture e aceita múltiplos', …);
it('mostra o progresso foto a foto', …);                       // 'Enviando foto 2 de 6'
it('mensagem clara quando a foto não pode ser preparada', …);   // decode/HEIC falhando → BAD_FILE
it('oferece Definir como capa só nas fotos que não são capa', …);
it('pede confirmação antes de remover a foto', …);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/admin/\(protected\)/veiculos/Photo`
Expected: FAIL.

- [ ] **Step 3: Dois inputs em `PhotoUpload`**, cada um com seu rótulo: `📷 Tirar foto` (`accept="image/*" capture="environment"`, um arquivo) e `🖼 Escolher da galeria` (`accept="image/*" multiple`, **sem** `capture`). `onChange` compartilhado. A fila, `shrink`, `decode`, o progresso e o tratamento de falha por foto ficam como estão; o que muda é que a versão vem de `draft.enqueue` em vez da prop.

- [ ] **Step 4: Botão `Definir como capa`** em `PhotoGallery` para foto sem a etiqueta `Capa`, chamando `setVehicleCover` por `draft.enqueue`. `RemoveForm` passa a usar `draft.enqueue` também. Classes novas em `admin.module.css`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/app && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: câmera e galeria separadas e definição de capa nas fotos"
```

---

### Task 10: Seção 3, rodapé único e ações secundárias

**Files:**
- Create: `src/app/admin/(protected)/veiculos/[id]/VehicleEditor.tsx`, `src/app/admin/(protected)/veiculos/[id]/DangerActions.tsx`
- Create: `src/app/admin/(protected)/veiculos/[id]/VehicleEditor.test.tsx`
- Modify: `src/app/admin/(protected)/veiculos/[id]/page.tsx`, `src/app/admin/(protected)/veiculos/[id]/StatusActions.tsx`
- Modify: `src/app/admin/admin.module.css`

**Interfaces:**
- Consumes: Tasks 7–9; `publishRequirements`, `isDiscardable`, `allowedStatusTransitions`.
- Produces: `VehicleEditor({ vehicle, photos, currentYear })` — client component que chama `useVehicleDraft` e compõe as três seções; `DangerActions({ vehicleId, draft, canDiscard, archiveTargetAvailable })`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('ordena as seções: o veículo, fotos, conferir e publicar', …);
it('tem exatamente uma ação principal no rodapé', …);
it('desabilita Publicar anúncio e diz o que falta', …);
it('habilita Publicar anúncio quando nada falta', …);
it('pede confirmação de disponibilidade antes de publicar', …);
it('reflete no checklist a pendência que a gravação acabou de resolver', …);  // missing vindo do draft
it('rascunho novo: título Cadastrar moto e etapas numeradas', …);
it('anúncio publicado: título é o nome, sem numeração e sem rodapé fixo', …);
it('oferece Excluir rascunho só quando isDiscardable', …);
it('pede confirmação antes de excluir o rascunho', …);
it('o rodapé fixo reserva espaço no conteúdo para não cobrir o último campo', …);  // classe de espaçamento presente
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/admin/\(protected\)/veiculos/\[id\]/VehicleEditor.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Criar `VehicleEditor`** como o único client component da tela: chama `useVehicleDraft` com os valores iniciais vindos do servidor e passa `draft` para `VehicleForms`, `PhotoUpload`, `PhotoGallery` e `StatusActions`. A seção 3 mostra o resumo, o checklist de `draft.missing` e nada mais. `page.tsx` fica server component: busca, calcula `publishRequirements` inicial, decide `isNew = status === 'draft' && publishedAt === null` e renderiza `VehicleEditor`.

- [ ] **Step 4: Rodapé único.** `StatusActions` deixa de ter `Publicar` entre os botões de transição; o `Publicar anúncio` vive no rodapé fixo de `VehicleEditor`, desabilitado com `aria-describedby` apontando o que falta, e abre a confirmação de disponibilidade. Para anúncio publicado o rodapé não é renderizado e `StatusActions` mostra `Reservar`/`Marcar vendido`/`Arquivar`.

- [ ] **Step 5: `DangerActions`** no fim da página, fora do rodapé: `Arquivar` (quando a transição existe) e `Excluir rascunho` (quando `canDiscard`), ambos com confirmação, ambos secundários.

- [ ] **Step 6: CSS do rodapé fixo.** `padding-bottom: env(safe-area-inset-bottom)` no rodapé e espaçamento equivalente à sua altura no fim do conteúdo, para o último campo e as mensagens nunca ficarem cobertos com o teclado aberto.

- [ ] **Step 7: Run tests**

Run: `npm run test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git commit -am "feat: rodapé com uma ação só, conferência no fim e arquivar/excluir como secundárias"
```

---

### Task 11: Filtro de estado no estoque

**Files:**
- Create: `src/app/admin/(protected)/StatusFilter.tsx`, `src/app/admin/(protected)/page.test.tsx`
- Modify: `src/app/admin/(protected)/page.tsx`
- Modify: `src/app/admin/admin.module.css`

**Interfaces:**
- Consumes: `listAdminVehiclesWithCover`, `countAdminVehiclesByStatus` (Task 5).
- Produces: `StatusFilter({ counts, active })` — links para `?estado=<slug>`; `page.tsx` lê `searchParams`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('mostra Tudo e um filtro por estado com a contagem', …);
it('o filtro ativo vem do parâmetro estado da URL', …);
it('não oferece Descartados quando não há nenhum', …);
it('renderiza veículo sem marca, modelo, preço, ano e cor sem quebrar', …);  // 'Sem título', 'Sem preço'
it('cada filtro é um link, navegável por teclado', …);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/admin/\(protected\)/page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `StatusFilter`** como `<nav>` de `<Link>`s (estado na URL sobrevive a recarregamento e a voltar), com `aria-current="page"` no ativo e a contagem em cada rótulo. `Descartados` só aparece com contagem maior que zero.

- [ ] **Step 4: Ler `searchParams`** em `page.tsx` (`Promise<{ estado?: string }>` no Next 16), mapear o slug para `VehicleStatus`, passar como `status` à listagem e manter o fallback que já existe para falha do R2.

- [ ] **Step 5: Run tests**

Run: `npm run test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: filtrar o estoque por estado com contagem"
```

---

### Task 12: Ambiente de teste ponta a ponta

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/fixtures/admin-session.ts`, `tests/e2e/smoke.spec.ts`
- Create: `scripts/seed-e2e.ts`
- Modify: `package.json` (devDependency `@playwright/test`; scripts `test:e2e`, `db:seed-e2e`)
- Modify: `.env.example`, `.gitignore`

**Interfaces:**
- Produces: `seedAdminSession(): Promise<{ sessionToken: string; userId: string; vehicleId: string }>`; fixture `adminPage` que injeta o cookie de sessão do Auth.js.

- [ ] **Step 1: Provisionar** a branch de teste no Neon e o bucket de teste no R2, e gravar as credenciais em `.env.test` (fora do git). Acrescentar as entradas correspondentes a `.env.example`, sem valores, e `.env.test` a `.gitignore`.

- [ ] **Step 2: Write the failing test** `tests/e2e/smoke.spec.ts`

```ts
test('abre o estoque autenticado e chega à tela de cadastro', async ({ adminPage }) => {
  await adminPage.goto('/admin');
  await expect(adminPage.getByRole('heading', { name: 'Estoque' })).toBeVisible();
  await adminPage.getByRole('link', { name: 'Cadastrar veículo' }).click();
  await expect(adminPage.getByRole('heading', { name: 'O que você vai cadastrar?' })).toBeVisible();
});
```

- [ ] **Step 3: Guarda contra apontar para produção.** `scripts/seed-e2e.ts` recusa rodar se `DATABASE_URL` ou `R2_BUCKET` do `.env.test` coincidirem com os de `.env`/`.env.local`. Teste unitário dessa guarda em `src/server/env.test.ts` ou arquivo próprio.

- [ ] **Step 4: Implementar `seedAdminSession`**: insere `user`, `admin_grants` e uma linha em `session` com token conhecido e validade futura, usando o Drizzle já existente. Nada disso toca código de produção.

- [ ] **Step 5: Fixture `adminPage`**: `browser.newContext()` com o cookie de sessão do Auth.js (nome conforme `src/server/auth.ts`, `secure` conforme a URL local) e `baseURL` do `playwright.config.ts`, que sobe `next dev` com `.env.test` via `webServer`.

- [ ] **Step 6: Run**

Run: `npm run db:seed-e2e && npm run test:e2e -- smoke`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git commit -am "test: ambiente ponta a ponta com banco e bucket isolados"
```

---

### Task 13: Suíte ponta a ponta do cadastro

**Files:**
- Create: `tests/e2e/cadastro.spec.ts`, `tests/e2e/fotos.spec.ts`, `tests/e2e/publicacao.spec.ts`, `tests/e2e/layout.spec.ts`

**Interfaces:**
- Consumes: fixture `adminPage` e `seedAdminSession` (Task 12).

- [ ] **Step 1: `cadastro.spec.ts`** — cadastro completo de moto; cadastro completo de carro; campos inválidos (preço com letra, km absurda); progresso preservado ao recarregar no meio; **contar e registrar o número de toques até publicar**, que entra no relatório final.

- [ ] **Step 2: `fotos.spec.ts`** — escolher fotos existentes (`setInputFiles` no input da galeria, várias de uma vez); captura por câmera (`setInputFiles` no input de `capture`); falha de upload e recuperação (interceptar a rota e devolver erro); definir capa; remover foto.

- [ ] **Step 3: `publicacao.spec.ts`** — `Publicar anúncio` desabilitado com o motivo; publicar; editar anúncio publicado; arquivar; excluir rascunho; filtro por estado; `Excluir rascunho` ausente em anúncio publicado.

- [ ] **Step 4: `layout.spec.ts`** — 360, 390, 430, 768 e 1440 px: sem rolagem horizontal (`scrollWidth <= clientWidth`), rodapé não cobre o último campo, nenhum alvo de toque abaixo de 44 px. Com teclado virtual aberto, simulado por foco em campo com a viewport reduzida em altura: o campo em foco e a mensagem de estado seguem visíveis.

- [ ] **Step 5: Run**

Run: `npm run test:e2e`
Expected: PASS. Falha real vira correção na task que a causou, não ajuste do teste.

- [ ] **Step 6: Commit**

```bash
git commit -am "test: cobertura ponta a ponta do cadastro, fotos, publicação e layout"
```

---

### Task 14: Verificação final e migração

**Files:**
- Modify: `docs/PENDENCIAS_PAINEL.md`
- Create: `docs/RELATORIO_CADASTRO_MOBILE.md`

- [ ] **Step 1: Rodar tudo**

Run: `npm run test && npm run lint && npm run typecheck && npm run build && npm run test:e2e`
Expected: PASS em todos. Colar a saída real no relatório.

- [ ] **Step 2: Escrever `docs/RELATORIO_CADASTRO_MOBILE.md`**: evidência dos testes, comparação do fluxo anterior e do novo, número de toques para publicar um veículo (medido na Task 13, não estimado), e as limitações que permanecem, copiadas de §12 do desenho.

- [ ] **Step 3: Atualizar `PENDENCIAS_PAINEL.md`**: riscar o que esta entrega resolveu (rótulo de foto no Android, "Publicando..." sem feedback, teste de montagem de `VehicleForms`, dois botões com "Criando..."), e registrar o que ficou.

- [ ] **Step 4: Commit**

```bash
git commit -am "docs: relatório da entrega do cadastro mobile e pendências atualizadas"
```

- [ ] **Step 5: PARAR e pedir autorização.** Não rodar `npm run db:migrate` e não fazer deploy. Apresentar ao proprietário: o relatório, o comando de migração e o fato de que a constraint tem de existir **antes** do deploy. A migração e a publicação acontecem só com ordem explícita dele.

---

## Self-Review

**Cobertura do desenho:** §6.1 ordem das seções → Task 10; §6.2 gravação automática e rodapé único → Tasks 6–8, 10; §6.3 câmera/galeria/capa → Tasks 3, 9; §6.4 exclusão e filtro → Tasks 1, 2, 5, 11; §6.5 novo × edição → Task 10; §7 acessibilidade e safe area → Tasks 8, 10, 13; §8 validação → Tasks 12–14; §9 servidor → Tasks 1–5; §10 decisões → Tasks 1, 4, 6, 7, 12, 14; §12 limites → Task 14 Step 2.

**Consistência de tipos:** `draft` (retorno de `useVehicleDraft`) é o nome usado nas Tasks 8–10; `enqueue` é o único caminho de escrita das Tasks 9 e 10; `FormState.missing` definido na Task 6 é consumido na 7 e exibido na 10; `isDiscardable` da Task 2 é consumido na 10; `countAdminVehiclesByStatus` da Task 5 na 11.

**Review Focus:** cada um dos cinco tem teste na task indicada (teclado/safe area em 10 e 13; falha de gravação em 7 e 8; `StaleVehicleError` em 7; foto indecodificável em 9; rascunho vazio em 11).

**Proporção:** 14 tasks, assinaturas e nomes de teste sem corpos de implementação. Uma única migração em bloco de código, porque o SQL exato é decisão do plano.
