# Cadastro guiado de veículo no celular — desenho

Data: 2026-10-26. Branch de partida: `painel-cadastro-simples` (`e5a8004`).

## 1. Intenção e o porquê

O Liberato é o dono da loja e o único usuário do painel. Ele tem pouco domínio de tecnologia,
usa um Android, e fotografa o veículo no pátio antes de sentar para cadastrar. O critério de
aceitação é dele, não nosso: **cadastrar e publicar um veículo pelo celular, com fotos, sem
treinamento e sem ter que descobrir como o sistema funciona.**

### O que descobrimos antes de desenhar (e muda o escopo)

O que está publicado na Vercel é `main` (`34bd73a`). A branch `painel-cadastro-simples` está
**4 commits à frente e nunca foi mesclada**. O commit `5637c17` já resolveu cinco dos sete
problemas relatados. As capturas de tela do Android mostram o código antigo, não o atual:

| Relato | `main` (no ar) | Branch (pronto, não publicado) |
|---|---|---|
| Publicar no topo | `StatusActions` antes das fotos e do formulário | virou a seção 3, no fim |
| Dois botões de salvar | "Salvar dados" + "Salvar preço" | um `Salvar`, uma transação |
| Seletor só abre a câmera | `capture="environment"` no input | removido; `multiple` adicionado |
| Campos manuais demais | tudo digitado | chips de marca/cor, sugestão de modelo, ano em lista, máscara de R$ e km |
| Sem orientação à conclusão | nada | etapas numeradas, lista do que falta, Publicar bloqueado com motivo |

**Decisão do dono do produto:** não publicar a branch isolada. Entregar tudo de uma vez.

Portanto este desenho **não é um redesenho do zero**: é a continuação da branch, somada ao que
ninguém resolveu ainda. Refazer o que `5637c17` já fez seria regressão.

## 2. Objetivos

1. Uma única ação principal visível na tela de cadastro.
2. O Android oferecer, de forma explícita e separada, câmera **e** galeria — com várias fotos.
3. Publicar só existir no fim, e nunca habilitado com anúncio incompleto.
4. Nada do que foi digitado se perder por erro, navegação, recarregamento ou teclado.
5. Rascunho indesejado sair da frente com um toque, sem destruir histórico.
6. A lista do estoque ser legível com dezenas de veículos em estados diferentes.
7. Funcionar bem de 360 px a 1440 px, com teclado virtual aberto e por leitor de tela.

## 3. Não-objetivos

- Câmera própria dentro da aplicação. O `<input type="file">` nativo resolve.
- Upload direto do navegador para o R2 (presigned PUT). O caminho atual pela server action, com
  redução da imagem no cliente, já cabe no limite de 4 MB e mantém a validação no servidor.
- Troca da vitrine pública para ler do banco. Ela segue no catálogo estático.
- Reordenar fotos arrastando. Definir a capa resolve o que importa agora.
- Edição em massa, importação, relatórios.

## 4. Anti-objetivos (o que torna isto um fracasso mesmo funcionando)

- **Regredir o que `5637c17` resolveu.** Chips, combobox, máscaras, "Salvar" único, ausência de
  `capture`, lista de pendências e as 4 consultas por tela ficam. Qualquer item deste documento
  que pareça pedir o contrário está errado e deve ser questionado.
- Etapa ou tela nova que não reduza esforço real.
- Apagar linha de veículo, foto ou auditoria de forma irreversível.
- Botão que fica desabilitado sem dizer por quê.
- Rodapé fixo cobrindo o campo em foco com o teclado aberto.
- Salvamento automático silencioso: se grava sozinho, tem que dizer que gravou.

## 5. Restrições do sistema (verificadas no código, não supostas)

1. **Apagar veículo é impossível por desenho.** `vehicle_audit` tem gatilho `BEFORE UPDATE OR
   DELETE` que lança exceção (`drizzle/0003_audit_append_only.sql`), e `vehicle_audit.vehicle_id`
   e `vehicle_images.vehicle_id` referenciam `vehicles.id` com `onDelete: 'restrict'`.
   `createDraft` já grava auditoria `created`. Logo: **exclusão é sempre lógica.**
2. **Concorrência otimista.** Toda escrita exige `expectedVersion` e incrementa
   `versionNumber`; divergência lança `StaleVehicleError`. Salvamento automático tem que
   acompanhar a versão devolvida — é o padrão que `PhotoUpload` já usa.
3. **Uma capa por veículo**, garantida por índice único parcial
   `vehicle_images_one_cover_uidx (vehicle_id) where is_cover = true`. Trocar a capa exige
   limpar a antiga na mesma transação.
4. **Corpo da server action: 4 MB** (`next.config.ts`); a Vercel corta em 4,5 MB. O cliente
   reduz para o lado maior de 1920 px, JPEG 0,82, teto de 3,5 MB.
5. **`requireAdmin()` é a barreira real de segurança**, dentro do serviço. O layout do grupo
   `(protected)` não é barreira no Next 16. Função nova = `requireAdmin()` dentro dela.
6. **Check constraint de estado** lista os cinco estados atuais; um estado novo exige migração.
7. `vehicle_public_fields` exige marca, modelo, preço > 0, `availability_confirmed_at` e
   `published_at` para `published`/`reserved`/`sold`.

## 6. O fluxo novo

### 6.1 Forma: uma tela só, rolando (escolhida pelo dono do produto)

Três seções numeradas numa rota só, não três telas. Avaliamos wizard de três telas e etapas
empilhadas; a tela única venceu porque ele vê tudo, nunca se perde, e é a menor construção
sobre o que já existe.

**A ordem muda** para seguir o brief — hoje a branch começa pelas fotos:

1. **O veículo** — marca, modelo, ano, cor, km, preço.
2. **Fotos** — câmera ou galeria, capa, excluir.
3. **Conferir e publicar** — resumo, pendências, publicar.

Razão: o título da tela passa a ser "Honda CG 160" em vez de "Veículo sem título" antes de ele
esperar qualquer upload, e a espera do upload cai quando o anúncio já está quase pronto.

### 6.2 Uma ação principal: grava sozinho, rodapé só publica (escolhida pelo dono do produto)

Hoje a tela tem duas ações principais concorrentes: `Salvar` fixo no rodapé e `Publicar` na
seção 3. O brief pede uma só.

- **Não existe mais botão `Salvar`.** A seção 1 grava sozinha: ao sair de um campo, e após uma
  pausa na digitação. Indicador discreto de estado — `Salvando...` / `✓ salvo` / falha com
  `Tentar de novo`.
- **O rodapé fixo tem um botão: `Publicar anúncio`**, desabilitado enquanto faltar algo, com o
  que falta escrito logo abaixo dele. Confirmação de disponibilidade continua existindo.
- **`Arquivar` e `Excluir rascunho`** ficam no fim da página, fora do rodapé, como secundárias.

Cada gravação leva o formulário inteiro numa chamada e avança a versão uma vez — `updateVehicle`
já grava detalhes e preço na mesma transação. Nada no servidor muda para isto funcionar.

### 6.3 Fotos: duas ações explícitas

A causa do "não dá para fazer upload pelo mobile" é `capture="environment"` no input em `main`:
o Android obedece e abre só a câmera, sem caminho para a galeria. A branch já removeu. O que
falta é tornar as duas intenções visíveis em vez de uma só:

- `📷 Tirar foto` — `accept="image/*" capture="environment"`, um arquivo.
- `🖼 Escolher da galeria` — `accept="image/*" multiple`, **sem** `capture`.

Dois inputs ocultos distintos, dois rótulos. A fila de envio, a redução no cliente, o progresso
"Enviando foto 2 de 6", o avanço de versão entre fotos e o tratamento de falha por foto já
existem em `PhotoUpload` e permanecem.

**Definir capa não existe no servidor** e o brief pede. Precisa de função nova.

### 6.4 Excluir rascunho e qualificador de estado

Recomendação aplicada, com autorização explícita para a migração:

- **Estado novo `discarded` ("Descartado")**, terminal, alcançável **só de `draft`**. Apaga de
  fato os objetos no R2 (libera espaço), mantém linha e auditoria, sai da lista.
- **Anúncio que já foi publicado nunca se exclui**, só `Arquivar`. Teve endereço público,
  preço e histórico. Essa é a linha divisória. O discriminador é
  **`status === 'draft' && publishedAt === null`**, não só o estado: `allowedStatusTransitions`
  permite `archived → draft`, então um ex-publicado pode voltar a rascunho. Ele recebe o rodapé
  de publicar (a transição é legítima) e **não** recebe "Excluir rascunho".
- **Sem exceção para os 7 veículos importados do catálogo antigo** (decisão do dono do
  produto, contra a recomendação deste documento). Eles são rascunhos de origem
  `legacy_static_2026_10_23` e são o estoque real; a regra vale para eles como para qualquer
  outro rascunho. Consequência aceita, registrada em §12: excluir um deles apaga as linhas de
  `vehicle_images` que ligam o veículo às fotos do catálogo estático, e
  `npm run db:import-legacy` **não** recupera, porque o importador ignora veículo que já existe
  por `source` + `source_reference`. A confirmação antes de excluir é a única proteção.
- O `delete` no R2 só vale para imagem com `storageProvider === 'r2'`. Chave `legacy_public` é
  caminho público do site e `createR2Storage().delete` lança "Chave de foto inválida." em
  qualquer coisa fora de `drafts/<uuid>/<uuid>.ext` — `removePhoto` já faz essa distinção.
- **Filtro por estado na lista do estoque**, por toque, com contagem:
  `Tudo · Rascunhos · Publicados · Reservados · Vendidos · Arquivados`. Descartados ficam fora
  de `Tudo`; alcançáveis por um filtro próprio apenas se houver algum.
- Criar o rascunho ao tocar em "Moto"/"Carro" **continua** como está: o progresso fica salvo
  desde o primeiro toque, e o rascunho indesejado sai com um toque.

### 6.5 Cadastro novo × edição

Mesma rota, dois enquadramentos:

- **Rascunho nunca publicado:** título "Cadastrar moto" / "Cadastrar carro" até haver marca e
  modelo; seções numeradas; rodapé `Publicar anúncio`.
- **Anúncio já publicado:** título é o nome do veículo; sem numeração de etapas (não é um
  caminho a percorrer); rodapé fixo deixa de existir; a seção de situação traz
  `Reservar` / `Marcar vendido` / `Arquivar`.

## 7. Qualidade visual e acessibilidade

- Alvo primário 360–430 px; verificar 360, 390, 430, 768, 1440.
- Rodapé fixo com `padding-bottom: env(safe-area-inset-bottom)`; o conteúdo recebe espaçamento
  equivalente à altura do rodapé para o último campo nunca ficar coberto.
- Teclado aberto não pode esconder o campo em foco nem a mensagem de erro. Se o rodapé fixo
  atrapalhar com o teclado aberto, ele cede — a mensagem de estado fica acima dele.
- Alvos de toque ≥ 44 px, sem rolagem horizontal, sem sobreposição.
- Seções com `h2` reais; estado do salvamento em região `aria-live`; cada input com rótulo;
  navegação completa por teclado. `ChipPicker` e `Combobox` já tratam `aria-pressed`,
  `role="combobox"` e `aria-activedescendant` — manter.

## 8. Validação

Obrigatório, com evidência no fim: `npm run test`, `npm run lint`, `npm run typecheck`,
`npm run build`.

### 8.1 Ambiente de teste (decisão do dono do produto)

Hoje existe **uma** branch no Neon e **um** bucket no R2, e são os de produção: os 7 veículos
reais e as fotos reais. O único seam de teste é `TEST_DATABASE_URL`, que as suítes de
integração do vitest pulam quando ausente. Então, antes dos testes de tela:

- **Branch de teste no Neon**, criada a partir da de produção (cópia isolada e instantânea).
- **Bucket de teste no R2**, separado do real.
- Credenciais num `.env.test` fora do git, com `DATABASE_URL` e `R2_*` apontando para eles.
  `.env.example` ganha as entradas correspondentes, sem valores.

É o único caminho que exercita o upload ponta a ponta sem tocar nas fotos reais. A suíte
**falha em vez de rodar** se `.env.test` apontar para a branch ou o bucket de produção — a
verificação é parte da entrega, não uma recomendação.

### 8.2 Sessão autenticada no Playwright

`requireAdmin()` é a única barreira, e o único login é Google OAuth com sessão em banco. O
Playwright **não** dirige o Google. Caminho adotado: semear uma linha em `session` (mais
`user` e `admin_grants`) no banco de teste e injetar o cookie de sessão do Auth.js no contexto
do navegador. **Nenhum provedor de credenciais de teste e nenhum desvio de autenticação entram
no código de produção** — um desvio desses é exatamente o que §5.5 proíbe, e valeria mais que
qualquer teste que ele permitisse escrever.

### 8.3 Lista de testes

Testes de tela com Playwright (dependência nova, pedida pelo brief), contra o `next dev` local,
com o banco e o bucket de teste de §8.1 — **nunca produção**:

cadastro completo de moto; cadastro completo de carro; escolher fotos existentes; captura por
câmera; várias imagens de uma vez; falha de upload e recuperação; campos inválidos; progresso
preservado ao recarregar no meio; publicar; editar anúncio publicado; arquivar; excluir
rascunho; filtro por estado; uso com teclado virtual aberto; layout em 360/390/430/768/1440.

Sem regressão de autenticação, Neon, R2 e publicação. As 4 consultas por tela de `5637c17` são
teto, não meta a reconquistar.

## 9. Reaproveitamento (nada disto se reescreve)

`ChipPicker`, `Combobox`, `masks.ts`, `SubmitButton`, `FormNotice`, `feedback.ts`,
`PhotoGallery`, `status.ts`, `publishRequirements`, `admin.module.css` e o serviço inteiro.

**Servidor — só o que falta:**

1. `setCoverPhoto(vehicleId, imageId, expectedVersion)` — limpa a capa antiga e marca a nova na
   mesma transação (índice único parcial), auditoria `cover_changed`.
2. `discardDraft(vehicleId, expectedVersion)` — exige `status === 'draft'` **e**
   `publishedAt === null`; apaga as linhas de `vehicle_images`, leva o veículo a `discarded`,
   auditoria `discarded`; apaga os objetos do R2 **depois** do commit e só os de provedor `r2`,
   como `removePhoto` já faz.
3. `countAdminVehiclesByStatus()` para as contagens do filtro.
4. Migração: `discarded` no enum Drizzle, no `check` `vehicle_status_valid`, em
   `vehicleStatus` (zod) e em `statusLabels`. `ALTER TABLE` de constraint; não apaga dado.
   **`discarded` não entra em `allowedStatusTransitions`** e `changeVehicleStatus` recusa esse
   destino: `discardDraft` é o único caminho. Dois caminhos para um estado terminal com efeitos
   colaterais diferentes deixariam objeto órfão no R2 e um "Descartado" com fotos — a tela
   deriva os botões direto daquela tabela, então basta não colocá-lo lá.
5. `updateVehicle` passa a não gravar auditoria `details_updated` quando nenhum campo de
   detalhe mudou de fato. Hoje ela grava sempre que o formulário chega com chaves, e a tela
   sempre manda as sete; com gravação automática isso viraria dezenas de linhas idênticas por
   cadastro, numa tabela que o gatilho torna impossível de limpar. Mudança de comportamento numa
   função auditada, deliberada: preserva a serventia do histórico.

## 10. Decisões tomadas pelo autor deste documento

- `discarded` é terminal: não volta a rascunho, porque as fotos já foram apagadas do R2 e o
  retorno entregaria um rascunho vazio. Protegido por confirmação antes de descartar.
- Pausa de 800 ms após a última digitação, mais gravação imediata ao sair do campo; uma
  gravação em voo por vez, enfileirando a seguinte.
- Descartados não aparecem em `Tudo`.
- Filtro por estado em parâmetro de busca na URL (`?estado=rascunho`), não em estado de
  componente: sobrevive a recarregamento e a voltar do navegador.
- Rótulo "Excluir rascunho", não "Descartar": é a palavra que ele usou.
- **Quem é dono da versão e da lista de pendências: o cliente, não o servidor.** Com a gravação
  automática, cada gravação incrementa `versionNumber`. Hoje `version` é prop renderizada no
  servidor e entregue em três lugares (`PhotoUpload`, cada `RemoveForm` da `PhotoGallery`,
  `StatusActions`), e `publishRequirements` é calculada na página. Revalidar a cada pausa de
  800 ms reassinaria toda URL de foto e faria a galeria inteira baixar de novo enquanto ele
  digita; não revalidar deixaria as três cópias da versão velhas e a próxima foto falharia com
  "anúncio alterado". Saída: `saveVehicle` devolve a versão nova **e** as pendências
  recalculadas, um único dono em estado elevado alimenta os quatro componentes, e a gravação
  automática não revalida a rota de detalhe. `revalidatePath('/admin')` continua, para a lista
  do estoque não ficar velha.
- **Uma escrita em voo por vez, compartilhada entre gravação e fotos.** `PhotoUpload` encadeia
  versões localmente ao enviar seis fotos em fila; uma gravação automática no meio da fila
  invalidaria o encadeamento e as fotos restantes falhariam. O mesmo dono serializa as duas.
- Migração antes do deploy, como último passo do plano, e **só com a sua ordem explícita** —
  roda contra a única branch de produção, e `.env.example` traz a regra de nunca migrar em
  produção sem revisão e autorização.

## 11. O que fica a cargo de quem implementa

- Onde exatamente mora o indicador de salvamento e seu texto.
- Se o resumo da seção 3 é cartão com a capa ou lista de linhas.
- Estrutura dos arquivos de teste Playwright e como semear o veículo de teste.
- Se o filtro de estado é rolagem horizontal de chips ou duas linhas em 360 px.
- Nomes de classes CSS novas, seguindo os tokens `--admin-*` existentes.

## 12. Limites conhecidos que vão permanecer

- Upload passa pela server action: fotos muito grandes dependem da redução no cliente.
- URL assinada de leitura vale 15 minutos; tela aberta muito tempo precisa de recarregamento.
- Vitrine pública continua lendo o catálogo estático: publicar no painel não muda o site
  público ainda.
- Limpeza de objeto órfão no R2, quando o `delete` falha, segue registrada como pendência.
- **Excluir um dos 7 veículos importados apaga sem volta o vínculo com as fotos do catálogo
  estático.** A reimportação não repara. Por decisão do dono do produto não há exceção para
  eles; a confirmação antes de excluir é a única proteção.
- Descartar não volta atrás: as fotos já saíram do R2.
- Exclusão é sempre lógica. A linha do veículo e sua auditoria permanecem no banco para sempre,
  por desenho — é o preço do histórico à prova de alteração.
