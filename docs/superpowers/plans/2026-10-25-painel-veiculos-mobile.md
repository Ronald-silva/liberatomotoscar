# Painel de veículos no celular — plano de implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar task por task. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** entregar hoje um painel administrativo mobile em HTTPS público onde o Liberato, do próprio celular, entra com a conta Google dele, vê o estoque real, cadastra veículo, tira foto, altera preço e marca publicado/reservado/vendido.

**Arquitetura:** o trabalho de servidor **já está pronto e testado** — `src/server/vehicles/service.ts` expõe todas as operações com `requireAdmin()` dentro de cada mutação, trava otimista por `versionNumber` e auditoria transacional. Este plano quase não escreve regra de negócio: ele adiciona (a) a infraestrutura pública que a apresentação exige e (b) as telas Server Component + Server Action que chamam o serviço existente. Nenhuma Server Action repete verificação de permissão: ela já acontece dentro do serviço.

**Stack:** Next.js 16 (App Router, runtime Node), React 19, Auth.js 5 (Google), Drizzle + postgres.js, Neon branch `development`, Cloudflare R2, deploy Vercel.

**Spec:** o briefing de continuidade da conversa de 2026-10-25 e `docs/AUTENTICACAO_ADMIN_FASE2_1.md`.

## Autorizações concedidas hoje (suspendem restrições do briefing original)

O briefing de transferência proibia deploy/push e a importação dos veículos. Nesta data o proprietário do projeto autorizou expressamente:

- **Deploy e push autorizados**, para a Vercel, em produção.
- **Importação do catálogo autorizada**, para a branch Neon `development`.

Continuam valendo, sem exceção: não alterar a branch Neon `production`; não alterar o design do site público; não expor segredos; não criar cadastro público de administrador; não criar credencial fixa ou usuário fictício.

## Global Constraints

- Banco da apresentação: branch Neon `development`, ID `br-dry-star-b6ma37vq`. A branch `production` não pode ser tocada, nem por migração, nem por script.
- Toda operação administrativa passa por `src/server/vehicles/service.ts`, que já chama `requireAdmin()`. Nenhuma rota, action ou componente pode ler ou escrever `vehicles`/`vehicle_images` direto.
- Toda tela administrativa fica sob `src/app/admin/(protected)/`, que já aplica `requireAdmin()` no servidor. Nada administrativo fora desse grupo.
- Nenhuma variável de segredo com prefixo `NEXT_PUBLIC_`. Nenhum valor real de segredo em documentação, commit, log ou mensagem de erro.
- Interface mobile-first, em português, reaproveitando `src/app/admin/admin.module.css`. Alvo: telefone em retrato, toque mínimo de 44px.
- Mutações usam o `versionNumber` lido na renderização; `StaleVehicleError` vira "Este anúncio foi alterado. Recarregue antes de salvar." na tela, nunca um erro 500.
- Limite de corpo de requisição da Vercel: **4,5 MB**. Foto de câmera de celular passa disso. Ver Task 7.
- `npm run typecheck`, `npm run lint`, `npm run build` e `npx vitest run` passam ao fim de cada task.
- Commits em português, no padrão do repositório (`feat:`, `fix:`, `style:`), terminando com a linha de co-autoria.

## Review Focus

Cinco modos de falha que a spec implica, nenhum coberto pelos testes atuais, em ordem de probabilidade de atrapalhar a apresentação. Cada linha tem o teste apontado na task dona.

1. **Foto de câmera de celular estoura o limite de 4,5 MB da Vercel** e o upload falha em cima da hora. A foto precisa ser reduzida no navegador antes de subir. → Task 7.
2. **Duas abas / dois toques no mesmo botão** disparam a mesma mutação com o mesmo `versionNumber`: a segunda precisa dizer "recarregue", não quebrar. → Task 6.
3. **Publicar um veículo incompleto** (sem marca, modelo, preço > 0 ou ao menos uma foto) precisa explicar o que falta, não mostrar um erro cru. → Task 8.
4. **Transição de estado não permitida** (ex.: `draft` → `sold`) não pode aparecer como botão na tela nem derrubar o servidor se chegar por POST. → Task 8.
5. **Arquivo que não é imagem**, renomeado para `.jpg`, chega no upload: `checkPhoto` valida os bytes mágicos e o erro precisa virar mensagem legível. → Task 7.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/app/admin/(protected)/page.tsx` | **Modificar.** Deixa de ser placeholder e vira a lista do estoque. |
| `src/app/admin/(protected)/veiculos/actions.ts` | **Criar.** Server Actions do painel; só traduz formulário → serviço → mensagem. |
| `src/app/admin/(protected)/veiculos/feedback.ts` | **Criar.** `toFormMessage(error)`: mapeia erro do serviço para texto ao usuário. Puro, testável sem banco. |
| `src/app/admin/(protected)/veiculos/novo/page.tsx` | **Criar.** Cadastro em poucos passos. |
| `src/app/admin/(protected)/veiculos/[id]/page.tsx` | **Criar.** Edição: dados, preço, fotos, estado. |
| `src/app/admin/(protected)/veiculos/PhotoUpload.tsx` | **Criar.** Client Component: câmera do celular + redução da imagem antes de enviar. |
| `src/app/admin/(protected)/veiculos/SubmitButton.tsx` | **Criar.** Client Component: botão com `useFormStatus`, evita toque duplo. |
| `src/app/admin/admin.module.css` | **Modificar.** Classes de lista, formulário e etiqueta de estado. |
| `scripts/import-legacy.ts` | **Modificar.** Ganha modo `--execute-development <branch-id>` com a mesma verificação de branch do `grant-admin-development.ts`. |
| `docs/APRESENTACAO_LIBERATO.md` | **Criar.** Roteiro da demo e plano B. |

---

### Task 1: Site público em HTTPS na Vercel com login Google funcionando

Sem isto, não há apresentação: o celular do Liberato não alcança o `localhost`. É a task de maior risco e precisa ser a primeira.

**Arquivos:**
- Modificar: `.env.example` (comentário sobre a URL de produção; nenhum valor real)
- Criar: nada de código

- [ ] **Passo 1: Conectar o repositório na Vercel e fazer o primeiro deploy de produção**

O build já passa localmente. Confirmar que o projeto é detectado como Next.js e anotar a URL de produção estável.

- [ ] **Passo 2: Definir as variáveis de ambiente de produção na Vercel**

`DATABASE_URL` (branch **development**, com pooling), `DATABASE_URL_DIRECT` (direta), `AUTH_SECRET` (novo valor aleatório ≥ 32 caracteres, diferente do local), `AUTH_URL` (a URL de produção), `AUTH_TRUST_HOST=true`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_GOOGLE_EMAIL` (o e-mail Google real do Liberato).
Apontar a produção para a branch `development` é **deliberado** para esta apresentação. Registrar isso no commit de documentação.

- [ ] **Passo 3: Cadastrar o redirect no Google Cloud**

No cliente OAuth, adicionar exatamente `https://<url-de-producao>/api/auth/callback/google`, mantendo o `http://localhost:3000/...` para o desenvolvimento. Sem isso o Google recusa o login com `redirect_uri_mismatch`.

- [ ] **Passo 4: Verificar no próprio celular**

Abrir `https://<url-de-producao>/admin/login` no telefone. Esperado: a tela de login aparece **sem** o aviso "O acesso ainda está em preparação" — esse aviso significa que falta variável. Tocar em "Entrar com Google", concluir, e cair na mensagem "Esta conta ainda não tem acesso ao painel". Essa mensagem é o **sucesso** desta task: o login funcionou e a autorização ainda não foi dada.

- [ ] **Passo 5: Verificar que o site público não regrediu**

Abrir a home e uma página de veículo na URL de produção. O catálogo e o visual precisam estar idênticos aos de hoje.

- [ ] **Passo 6: Commit**

```bash
git add .env.example docs/
git commit -m "docs: registrar o ambiente de produção da apresentação"
```

---

### Task 2: Primeiro administrador real

**Arquivos:**
- Modificar: nenhum (o script já existe)

**Interfaces:**
- Consome: `scripts/grant-admin-development.ts`, que exige `--execute-development br-dry-star-b6ma37vq`, confere `neon.branch_id` no próprio PostgreSQL e exige exatamente um usuário Auth.js com conta Google e e-mail igual a `ADMIN_GOOGLE_EMAIL`.

- [ ] **Passo 1: Confirmar que o login da Task 1 criou o usuário**

O registro só existe depois que o Liberato entrou uma vez. Sem isso o script aborta dizendo que a conta não foi encontrada — e não cria nada, por desenho.

- [ ] **Passo 2: Executar a concessão**

Com `NEON_DEVELOPMENT_BRANCH_ID=br-dry-star-b6ma37vq`, `ADMIN_GOOGLE_EMAIL` e `DATABASE_URL_DIRECT` no ambiente local:

```bash
npm run auth:grant-development -- --execute-development br-dry-star-b6ma37vq
```

Esperado: `Acesso administrativo concedido à conta Google previamente autenticada.`

- [ ] **Passo 3: Verificar o acesso e a negação, no celular**

Entrar de novo: `/admin` precisa abrir. Abrir `/api/admin/health`: precisa responder `{"status":"ok"}`. Em uma aba anônima, sem sessão, a mesma rota precisa responder 403. Tocar "Sair do painel" e confirmar que `/admin` volta a redirecionar para o login.

- [ ] **Passo 4: Sem commit**

Esta task não muda código. Nada a commitar.

---

### Task 3: Armazenamento de fotos (R2) provisionado e comprovado

**Arquivos:**
- Criar: `scripts/check-r2-connection.ts`

**Interfaces:**
- Consome: `createR2Storage(): PhotoStorage` de `src/server/storage/r2.ts`, com `put(vehicleId, body, mimeType)`, `delete(key)`, `signedReadUrl(key)`.

- [ ] **Passo 1: Criar o bucket privado na Cloudflare e definir as quatro variáveis**

`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, no `.env` local **e** na Vercel. O bucket fica privado: a leitura é por URL assinada de 60 segundos, que o código já faz.

- [ ] **Passo 2: Escrever `scripts/check-r2-connection.ts`**

Espelha o estilo de `scripts/check-neon-connection.ts`. Sem argumento de execução destrutiva: ele grava um PNG mínimo válido gerado em memória sob um UUID descartável, assina a leitura, apaga a chave e imprime um JSON de diagnóstico **sem segredo nenhum** — por exemplo `{"put":true,"signedRead":true,"delete":true}`. Qualquer falha sai com código 1 e mensagem curta.

- [ ] **Passo 3: Executar**

Run: `npx tsx scripts/check-r2-connection.ts`
Esperado: as três chaves `true`, e nenhuma credencial impressa.

- [ ] **Passo 4: Commit**

```bash
git add scripts/check-r2-connection.ts
git commit -m "feat: adicionar verificação de ida e volta do armazenamento de fotos"
```

---

### Task 4: Importar o catálogo para a branch development

Hoje `scripts/import-legacy.ts` só aceita `DATABASE_URL` em `localhost`. O módulo lê os PNGs de `public/images/`, então a importação roda **da sua máquina**, escrevendo no Neon.

**Arquivos:**
- Modificar: `scripts/import-legacy.ts`
- Teste: `src/server/vehicles/import-legacy.integration.test.ts` (já existe; continua pulado sem `TEST_DATABASE_URL`)

**Interfaces:**
- Consome: `importLegacyVehicles(): Promise<{ source, total, created, skipped, slugs }>` de `src/server/vehicles/import-legacy.ts`. É idempotente por `(source, sourceReference)`: rodar duas vezes não duplica, apenas soma em `skipped`.
- Produz: veículos com `status: 'draft'`, cada um já com uma imagem de capa `legacy_public` — portanto **publicáveis** assim que tiverem marca, modelo e preço, que o import já preenche.

- [ ] **Passo 1: Adicionar o modo de branch ao script**

Replicar a guarda de `scripts/grant-admin-development.ts`: aceitar `--execute-development <branch-id>`, exigir que o argumento seja igual a `NEON_DEVELOPMENT_BRANCH_ID` **e** a `br-dry-star-b6ma37vq`, e confirmar `SELECT current_setting('neon.branch_id', true)` antes de qualquer escrita, abortando se divergir. O modo `--execute-local` continua existindo, inalterado.

Diferença em relação ao `grant-admin-development.ts`, e é proposital: aquele script monta o próprio cliente com `DATABASE_URL_DIRECT`, mas `importLegacyVehicles()` usa `getDb()` por dentro, que lê `DATABASE_URL`. Então aqui a verificação de branch roda **pelo mesmo `getDb()`** que a importação vai usar — conferir uma conexão e escrever por outra não prova nada. Exigir host `.neon.tech` em `DATABASE_URL` e não tocar em `DATABASE_URL_DIRECT`. A conexão com pooling suporta a transação, conforme o comentário em `src/server/db/client.ts`.

- [ ] **Passo 2: Executar**

```bash
npx tsx scripts/import-legacy.ts --execute-development br-dry-star-b6ma37vq
```
Esperado: um JSON com `created` igual ao total do catálogo e `skipped: 0`.

- [ ] **Passo 3: Executar de novo, para provar a idempotência**

Esperado: `created: 0`, `skipped` igual ao total. Nenhum veículo duplicado.

- [ ] **Passo 4: Verificação completa**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`
Esperado: tudo passa; o site público segue gerando as mesmas páginas estáticas.

- [ ] **Passo 5: Commit**

```bash
git add scripts/import-legacy.ts
git commit -m "feat: permitir a importação do catálogo na branch de desenvolvimento"
```

---

### Task 5: Lista do estoque no painel

Primeira tela de verdade. Ao fim dela o Liberato já abre o celular e vê o estoque dele.

**Arquivos:**
- Modificar: `src/app/admin/(protected)/page.tsx`, `src/app/admin/admin.module.css`
- Criar: `src/app/admin/(protected)/veiculos/feedback.ts`
- Teste: `src/app/admin/(protected)/veiculos/feedback.test.ts`

**Interfaces:**
- Consome: `listAdminVehicles()` de `src/server/vehicles/service.ts` → `Promise<Vehicle[]>`, já ordenado por `updatedAt` decrescente, já com `requireAdmin()` dentro.
- Produz: `toFormMessage(error: unknown): string` em `feedback.ts`, usado por todas as tasks seguintes.

- [ ] **Passo 1: Escrever o teste que falha**

```ts
// src/app/admin/(protected)/veiculos/feedback.test.ts
describe('mensagem de formulário', () => {
  it('explica conflito de edição simultânea', () => {
    expect(toFormMessage(new StaleVehicleError()))
      .toBe('Este anúncio foi alterado. Recarregue antes de salvar.');
  });
  it('explica anúncio inexistente', () => {
    expect(toFormMessage(new VehicleNotFoundError())).toBe('Veículo não encontrado.');
  });
  it('repassa a exigência de publicação ao usuário', () => {
    const message = 'Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto.';
    expect(toFormMessage(new Error(message))).toBe(message);
  });
  it('não vaza detalhe interno de falha inesperada', () => {
    expect(toFormMessage(new Error('connect ECONNREFUSED 10.0.0.1:5432')))
      .toBe('Não foi possível salvar agora. Tente de novo.');
  });
});
```

A quarta asserção é a que importa: mensagem de erro do serviço só chega ao usuário se for uma das mensagens conhecidas do domínio. Use uma lista explícita das mensagens de `validation.ts` e `service.ts`; qualquer outra coisa vira o texto genérico.

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/app/admin/\(protected\)/veiculos/feedback.test.ts`
Esperado: FALHA, módulo não encontrado.

- [ ] **Passo 3: Implementar `toFormMessage(error: unknown): string`**

- [ ] **Passo 4: Rodar e ver passar**

- [ ] **Passo 5: Trocar o placeholder de `/admin` pela lista**

Server Component. Para cada veículo: foto de capa, marca + modelo, ano, preço em BRL, etiqueta de estado (Rascunho / Publicado / Reservado / Vendido / Arquivado) e link para `/admin/veiculos/<id>`. Um botão fixo "Cadastrar veículo" apontando para `/admin/veiculos/novo`. Estado vazio com uma frase e o mesmo botão. Manter o cabeçalho com logo e o botão "Sair do painel" que já existem.

- [ ] **Passo 6: Verificação completa**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

- [ ] **Passo 7: Conferir no celular e commitar**

```bash
git add src/app/admin
git commit -m "feat: listar o estoque no painel do celular"
```

---

### Task 6: Editar dados e preço

**Arquivos:**
- Criar: `src/app/admin/(protected)/veiculos/[id]/page.tsx`, `src/app/admin/(protected)/veiculos/actions.ts`, `src/app/admin/(protected)/veiculos/SubmitButton.tsx`
- Teste: `src/app/admin/(protected)/veiculos/actions.test.ts`

**Interfaces:**
- Consome: `getAdminVehicle(id)` → `{ vehicle, images }`; `updateDetails(id, expectedVersion, input)`; `updatePrice(id, expectedVersion, priceCents)`; `toFormMessage` da Task 5.
- Produz: o tipo de estado de formulário `type FormState = { message: string | null }`, e as actions `saveDetails(state, formData)` e `savePrice(state, formData)` no formato de `useActionState`. As tasks 7, 8 e 9 usam o mesmo `FormState`.

- [ ] **Passo 1: Escrever o teste que falha**

Com o serviço mockado (o padrão de `src/app/admin/access-denied.test.ts`), cobrindo o item 2 do Review Focus:

```ts
it('pede recarga quando a versão enviada está velha', async () => {
  service.updateDetails = async () => { throw new StaleVehicleError(); };
  const state = await saveDetails({ message: null }, formDataOf({ id, version: '1', brand: 'Honda' }));
  expect(state.message).toBe('Este anúncio foi alterado. Recarregue antes de salvar.');
});
it('converte o preço digitado em reais para centavos', async () => { /* '18.500,00' -> 1850000 */ });
it('recusa preço não numérico sem chamar o serviço', async () => { /* message preenchida, serviço não chamado */ });
```

- [ ] **Passo 2: Rodar e ver falhar**

- [ ] **Passo 3: Implementar as actions e a tela**

`actions.ts` começa com `'use server'`. Cada action lê `id` e `version` de campos ocultos do formulário, chama o serviço e devolve `{ message }`, usando `revalidatePath('/admin')` e `revalidatePath('/admin/veiculos/' + id)` no sucesso. **Nenhuma verificação de permissão aqui** — ela está dentro do serviço.
A tela é um Server Component que lê `getAdminVehicle`, renderiza os campos (marca, modelo, versão, ano, quilometragem, cor, descrição) e o preço em um formulário próprio, com o `versionNumber` atual em campo oculto. Entradas numéricas usam `inputMode="numeric"` para abrir o teclado certo no celular.
`SubmitButton.tsx` usa `useFormStatus` para desabilitar durante o envio — é a defesa de primeira linha contra o toque duplo.

- [ ] **Passo 4: Rodar e ver passar**

- [ ] **Passo 5: Verificação completa e commit**

```bash
git add src/app/admin
git commit -m "feat: editar dados e preço do veículo pelo celular"
```

---

### Task 7: Fotos pela câmera do celular

A task de maior risco técnico do painel. Ver itens 1 e 5 do Review Focus.

**Arquivos:**
- Criar: `src/app/admin/(protected)/veiculos/PhotoUpload.tsx`
- Modificar: `src/app/admin/(protected)/veiculos/actions.ts`, `src/app/admin/(protected)/veiculos/[id]/page.tsx`
- Teste: `src/app/admin/(protected)/veiculos/actions.test.ts`

**Interfaces:**
- Consome: `addPhoto(id, expectedVersion, body: Uint8Array, mimeType, storage?)`; `removePhoto(vehicleId, imageId, expectedVersion, storage?)`; `getAdminPhotoReadUrl(vehicleId, imageId, storage?)`, que devolve a chave direta para `legacy_public` e uma URL assinada de 60 s para `r2`.
- Produz: actions `addVehiclePhoto(state, formData)` e `removeVehiclePhoto(state, formData)`, mesmo `FormState`.

- [ ] **Passo 1: Escrever o teste que falha**

```ts
it('traduz arquivo que não é imagem de verdade', async () => {
  service.addPhoto = async () => { throw new Error('Formato de foto inválido.'); };
  const state = await addVehiclePhoto({ message: null }, formDataWithFile(fakeJpeg));
  expect(state.message).toBe('Formato de foto inválido.');
});
it('impede remover a última foto de anúncio publicado', async () => {
  service.removePhoto = async () => { throw new Error('O anúncio precisa manter uma foto.'); };
  expect((await removeVehiclePhoto({ message: null }, fd)).message)
    .toBe('O anúncio precisa manter uma foto.');
});
```

Acrescente as duas mensagens à lista conhecida de `toFormMessage`.

- [ ] **Passo 2: Rodar e ver falhar**

- [ ] **Passo 3: Implementar a redução da imagem no navegador**

`PhotoUpload.tsx` é Client Component. O campo é `<input type="file" accept="image/*" capture="environment">`, que abre a câmera no celular. **Antes de enviar**, desenha a imagem em um `<canvas>` com o maior lado limitado a 1920px e exporta com `toBlob(..., 'image/jpeg', 0.82)`, substituindo o arquivo no `FormData`. Isso resolve o item 1 do Review Focus: uma foto de 6 MB da câmera chega ao servidor com menos de 1 MB, bem abaixo dos 4,5 MB da Vercel. Mostrar o progresso e desabilitar o botão durante o envio.

- [ ] **Passo 4: Implementar as actions e a galeria na tela de edição**

A action converte o arquivo com `new Uint8Array(await file.arrayBuffer())` e repassa ao serviço, que revalida os bytes com `checkPhoto`. A galeria mostra as fotos por `position`, marca a capa e dá um botão de remover por foto. **`addPhoto` e `removePhoto` incrementam o `versionNumber`** — depois de cada upload a página precisa ser revalidada, senão o próximo salvamento cai em `StaleVehicleError`.

- [ ] **Passo 5: Rodar e ver passar**

- [ ] **Passo 6: Testar com o celular de verdade, não com o emulador**

Tirar uma foto pelo painel e confirmar que ela aparece na galeria. Esta é a prova; o teste automatizado não cobre a câmera.

- [ ] **Passo 7: Verificação completa e commit**

```bash
git add src/app/admin
git commit -m "feat: adicionar e remover fotos do veículo pela câmera do celular"
```

---

### Task 8: Publicar, reservar, vender e arquivar

**Arquivos:**
- Modificar: `src/app/admin/(protected)/veiculos/actions.ts`, `src/app/admin/(protected)/veiculos/[id]/page.tsx`, `src/app/admin/admin.module.css`
- Teste: `src/app/admin/(protected)/veiculos/actions.test.ts`

**Interfaces:**
- Consome: `changeVehicleStatus(id, expectedVersion, nextStatus, { confirmAvailability })`; `allowedStatusTransitions` de `src/server/vehicles/validation.ts`, que é a **única** fonte de quais botões aparecem.
- Produz: action `changeStatus(state, formData)`, mesmo `FormState`.

- [ ] **Passo 1: Escrever o teste que falha**

Cobre os itens 3 e 4 do Review Focus:

```ts
it('explica o que falta para publicar', async () => {
  service.changeVehicleStatus = async () => { throw new Error('Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto.'); };
  expect((await changeStatus({ message: null }, fd)).message)
    .toBe('Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto.');
});
it('recusa transição não permitida que chegue por POST', async () => {
  service.changeVehicleStatus = async () => { throw new Error('Mudança de estado não permitida.'); };
  expect((await changeStatus({ message: null }, fdOf('draft->sold'))).message)
    .toBe('Mudança de estado não permitida.');
});
```

- [ ] **Passo 2: Rodar e ver falhar**

- [ ] **Passo 3: Implementar**

A tela deriva os botões de `allowedStatusTransitions[vehicle.status]` — nada de lista escrita à mão, para a tela nunca oferecer o que o servidor recusa. Rótulos em português: Publicar, Reservar, Marcar vendido, Arquivar, Voltar para rascunho.
Publicar exige `confirmAvailability: true`: a tela mostra um passo explícito de confirmação ("Este veículo está disponível para venda?") antes de enviar. **Não usar `confirm()` do navegador**: use um segundo botão na própria página.

- [ ] **Passo 4: Rodar e ver passar**

- [ ] **Passo 5: Verificação completa e commit**

```bash
git add src/app/admin
git commit -m "feat: publicar, reservar, vender e arquivar veículo pelo painel"
```

---

### Task 9: Cadastrar veículo em poucos passos

Última peça do fluxo que o proprietário pediu. Fica por último de propósito: depende da tela de edição, e é a mais fácil de cortar se o tempo apertar.

**Arquivos:**
- Criar: `src/app/admin/(protected)/veiculos/novo/page.tsx`
- Modificar: `src/app/admin/(protected)/veiculos/actions.ts`
- Teste: `src/app/admin/(protected)/veiculos/actions.test.ts`

**Interfaces:**
- Consome: `createDraft({ type })` → `Vehicle`, que gera um slug provisório `veiculo-<uuid>` quando nenhum é informado.
- Produz: action `createVehicle(state, formData)`, que no sucesso redireciona para `/admin/veiculos/<id>`.

- [ ] **Passo 1: Escrever o teste que falha**

```ts
it('cria rascunho de moto e leva para a edição', async () => { /* redirectUrl === `/admin/veiculos/${id}` */ });
it('recusa tipo de veículo desconhecido sem chamar o serviço', async () => { /* 'caminhao' */ });
```

- [ ] **Passo 2: Rodar e ver falhar**

- [ ] **Passo 3: Implementar**

A tela faz **uma** pergunta — moto ou carro — com dois botões grandes. Tocar cria o rascunho e cai direto na tela de edição da Task 6, onde ele preenche o resto e publica. São esses os "poucos passos".

- [ ] **Passo 4: Rodar e ver passar**

- [ ] **Passo 5: Verificação completa e commit**

```bash
git add src/app/admin
git commit -m "feat: cadastrar veículo em poucos passos pelo celular"
```

---

### Task 10: Ensaio no celular e roteiro

Não é burocracia: é a única task que prova que as nove anteriores funcionam juntas, no aparelho, na rede dele.

**Arquivos:**
- Criar: `docs/APRESENTACAO_LIBERATO.md`

- [ ] **Passo 1: Deploy final e percurso completo em um celular de verdade**

Na URL de produção, em dados de 4G e não só no Wi-Fi: entrar com o Google → ver o estoque → cadastrar uma moto → tirar uma foto → preencher preço → publicar → marcar reservada → marcar vendida → sair. Anotar cada tropeço.

- [ ] **Passo 2: Arquivar o veículo de ensaio**

Para o painel não começar a apresentação com lixo. Arquivar, não apagar: a auditoria é append-only.

- [ ] **Passo 3: Escrever o roteiro**

Em `docs/APRESENTACAO_LIBERATO.md`: a sequência da demo, o que dizer, e as duas limitações a declarar de frente em vez de deixar aparecer sozinhas — (a) **o site público ainda lê o catálogo estático**, então publicar no painel ainda não muda a vitrine; é a próxima fase; (b) os dados estão na branch de desenvolvimento, então o estoque da demo não é o sistema definitivo.

- [ ] **Passo 4: Plano B**

Gravar um vídeo curto do percurso completo pelo celular. Se a rede da loja falhar na hora, você ainda apresenta.

- [ ] **Passo 5: Commit**

```bash
git add docs/APRESENTACAO_LIBERATO.md
git commit -m "docs: roteiro da apresentação do painel"
```

---

## Fora de escopo, deliberadamente

**Cutover do site público para o banco.** `listPublicVehicles()` e `getPublicVehicleBySlug()` já existem em `service.ts` esperando esse momento, mas trocar a vitrine hoje significaria: perder a geração estática das páginas de veículo, remapear `src/data/inventory-vehicles.ts` (que carrega visualizador 360°, galeria e textos que o banco ainda não guarda) e arriscar uma regressão visual no site público na véspera da apresentação. O ganho — marcar "vendido" refletir na vitrine — não paga esse risco hoje. É a Fase 3, e o roteiro da Task 10 declara isso ao Liberato.

## Ordem, corte e o que realmente cabe no dia

As tasks 1 a 4 são de configuração e dependem de terceiros (Google Cloud, Cloudflare, Vercel): são as que podem atrasar sem que o código tenha culpa. **Faça-as primeiro e todas juntas**, porque uma credencial faltando descoberta às 22h custa a apresentação.

As tasks 5 a 9 são o painel. Se o tempo apertar, a ordem de corte é: **9 primeiro** (ele pode cadastrar um veículo novo depois; os importados já enchem a tela), depois **7** (a demo sobrevive com as fotos importadas, mas perde muito). As tasks 5, 6 e 8 são o mínimo que ainda é uma demonstração honesta de um painel.

Dez tasks em um dia é agressivo. Se eu tivesse que apostar onde o dia estoura, aposto na Task 1 — e é exatamente por isso que ela é a primeira.
