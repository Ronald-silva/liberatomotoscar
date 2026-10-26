# Ajustes de desempenho e simplificação do cadastro

Análise feita em 2026-10-25 sobre o código em `main` (34bd73a), com medição real de latência
do banco a partir desta máquina. Dois assuntos: por que o painel está lento e como deixar o
cadastro de veículo simples para quem tem pouco domínio de tecnologia.

## 1. Diagnóstico da lentidão

### Medição

Latência medida contra o Neon (`ep-dark-mountain-...sa-east-1`, pooler), a partir do notebook:

| Medida | Valor |
|---|---|
| Primeira conexão (TLS + possível acordar o compute) | 1.155 ms |
| Round-trip de uma consulta trivial (`select 1`), média de 10 | **52,6 ms** |
| `count(*)` em `vehicles` | 69 ms |

Páginas públicas no servidor de desenvolvimento: 0,81 s na primeira vez (compilação),
0,10 s depois. Ou seja: **o HTML não é o problema. O problema é a quantidade de idas ao
banco por tela, multiplicada por 53 ms.**

### A causa real: consultas repetidas, não o servidor

`requireAdmin()` (`src/server/authz.ts`) faz **2 consultas** a cada chamada — a sessão pelo
adaptador do Auth.js e a concessão em `admin_grants`. Ele é chamado várias vezes na mesma
requisição, porque cada função do serviço o chama por si (o que está certo por segurança,
conforme a nota de arquitetura em `PENDENCIAS_PAINEL.md`) e nada memoriza o resultado.

Pior: em `src/app/admin/(protected)/veiculos/[id]/page.tsx`, `getAdminVehicle()` **já devolve
as imagens com `storageKey` e `storageProvider`**, e logo depois a página chama
`getAdminPhotoReadUrl()` uma vez por foto — e cada chamada refaz `requireAdmin()` (2 consultas)
mais um `select` da imagem que já estava em memória, e constrói um `S3Client` novo.

Contagem de consultas para abrir a edição de um veículo com 6 fotos:

| Trecho | Consultas |
|---|---|
| `layout.tsx` → `requireAdmin()` | 2 |
| `getAdminVehicle()` → `requireAdmin()` + veículo + imagens | 4 |
| 6 × `getAdminPhotoReadUrl()` → 6 × (`requireAdmin()` + imagem) | 18 |
| **Total** | **24** |

24 × 53 ms ≈ **1,2 s de espera só de banco** (menos na prática, porque o pool tem 5 conexões
e parte vai em paralelo — algo entre 0,5 s e 1,2 s). Depois de salvar, `revalidatePath` força
a re-renderização e a tela paga essa conta outra vez. Salvar um campo hoje custa duas vezes:
`saveDetails` são 2 consultas de autorização + 5 da transação, e aí vem o recarregamento.

A assinatura das URLs do R2 **não** é culpada: `getSignedUrl` é cálculo local, sem rede.

### Correções de maior efeito, em ordem de retorno

1. **Memorizar a autorização por requisição.** Envolver `getAdminIdentity()` com `cache()` do
   React. A barreira de segurança continua idêntica (toda função do serviço ainda chama
   `requireAdmin()`), mas as 2 consultas acontecem uma vez por requisição em vez de 8.
   *Uma linha de mudança; derruba a maior parte do custo.*
2. **Assinar as fotos sem reconsultar.** Trocar o laço de `getAdminPhotoReadUrl()` por uma
   função que recebe a lista de imagens que `getAdminVehicle()` já carregou e só assina as
   chaves. Elimina 3 consultas por foto.
3. **Um `S3Client` por processo.** `createR2Storage()` cria cliente novo a cada chamada;
   memorizar em módulo.
4. **Um único botão “Salvar”.** Hoje são dois formulários (dados e preço) = duas transações,
   duas revalidações e dúvida sobre o que foi salvo. Unificar resolve desempenho e usabilidade
   no mesmo movimento.

Resultado esperado: de **24 consultas para 4** na tela de edição, e de 5 para 3 no estoque.
Sem trocar de hospedagem, sem trocar de banco.

### Armazenamento de fotos: verificado

> **Correção de 2026-10-25.** Uma versão anterior deste documento afirmava que as variáveis
> `R2_*` não estavam configuradas. Era falso: a verificação usou um padrão de busca sem dígitos
> (`[A-Z_]+`), que descartou em silêncio justamente os nomes começados em `R2_`. As quatro
> chaves estão no `.env`, preenchidas, e também na Vercel.

`npx tsx scripts/check-r2-connection.ts` devolve `{"put":true,"signedRead":true,"delete":true}`:
envio, leitura assinada e remoção funcionam contra o bucket real. Não há nada a destravar aqui.

### Um ponto que vale para a demonstração

- **Demonstração nunca em `next dev`.** O modo de desenvolvimento compila sob demanda (foi o
  que gerou os 0,81 s da primeira visita). Para mostrar à loja: `npm run build && npm start`.

## 2. Hospedar o backend no Render: não recomendo

Primeiro, um ajuste de premissa: **não existe um backend separado neste projeto.** É um único
app Next.js 16 — as telas são Server Components e as gravações são Server Actions, no mesmo
processo. "Hospedar o backend" aqui significa hospedar o app inteiro.

### Por que o Render pioraria o que se quer melhorar

| Critério | Render | Vercel (já configurado) |
|---|---|---|
| Região na América do Sul | **Não tem.** Oregon, Ohio, Virginia, Frankfurt, Singapura | `gru1` = São Paulo (`sa-east-1`) |
| Distância até o Neon (`sa-east-1`) | ~120–160 ms por consulta | ~1–5 ms (mesma região) |
| Plano gratuito | Hiberna após 15 min; volta em ~1 min | Sem hibernação |
| Plano pago mínimo | Starter US$ 7/mês | Pro US$ 20/mês |
| Estado atual do projeto | Começar do zero | Projeto `liberatomotoscar` já vinculado em `.vercel/` |

O ponto decisivo: o banco está em **São Paulo** e o Render não tem região no Brasil. Rodar o
app na Virgínia com o banco em São Paulo troca 53 ms por ~140 ms em cada consulta — com o
código de hoje (24 consultas por tela), isso vira 2 a 3 segundos. Seria mais lento que agora.
Mover o banco para o Render junto resolveria a conversa app↔banco, mas colocaria os dados fora
do Brasil e deixaria o próprio navegador do dono a ~140 ms de cada clique.

### O que recomendo

**Vercel na região `gru1`, com o Neon onde já está.** `vercel.json` (ou `vercel.ts`) com
`regions: ["gru1"]` põe as Server Actions na mesma região do banco: as consultas caem de 53 ms
para a casa de 1 a 5 ms. É a mesma mudança de ~3 linhas que elimina a latência inteira.

Custo, sem rodeio: o site é de uma loja, ou seja **uso comercial**, e as diretrizes de uso
justo da Vercel restringem o plano Hobby a uso pessoal não comercial — portanto **Pro, US$ 20
por mês**. A tabela de preços da região `gru1` também é descrita como exclusiva do Pro. O
Render a US$ 7 é mais barato de verdade; só não entrega o que se pediu (desempenho), porque
não tem região no Brasil.

Observação sobre o plano: a documentação diz que Hobby permite **uma única região**, sem
afirmar quais. Se a intenção for testar `gru1` no Hobby antes de assinar, dá para verificar em
Settings → Functions → Function Regions no painel do projeto.

### Ordem correta das decisões

A lentidão de hoje é **do código, não do hospedeiro**. Fazer os 4 ajustes da seção 1 custa uma
tarde e vale mais que qualquer troca de plataforma. Só depois disso vale decidir sobre os
US$ 20 — e nesse ponto a conta é fácil, porque `gru1` + Neon em São Paulo deixa o painel
praticamente instantâneo.

## 3. Simplificar o cadastro de veículo

### O que o dono enfrenta hoje

Fluxo: `/admin/veiculos/novo` → toca em Moto ou Carro → cai na edição com **8 campos de texto
livre** (Marca, Modelo, Versão, Ano, Quilometragem, Cor, Descrição, Preço), **dois botões de
salvar** e o botão Publicar.

Problemas concretos para quem tem pouco domínio de tecnologia:

- Tudo é digitado. Nenhuma sugestão, nenhuma lista.
- Nada indica que só Marca, Modelo, Preço e 1 foto são obrigatórios para publicar. Isso só
  aparece como erro **depois** de tentar publicar (`assertPublishable`).
- Formatos são adivinhados e corrigidos por expressão regular no servidor: o campo Ano aceita
  "2.024" e salva 2024 (já registrado em `PENDENCIAS_PAINEL.md`); o preço só é validado depois
  de enviar.
- Dois botões de salvar ⇒ dúvida sobre o que ficou salvo.
- As fotos sobem **uma por vez**, cada uma com envio e recarregamento da página. Seis fotos =
  seis esperas.

### Mudanças propostas, da maior para a menor economia de digitação

| Campo | Hoje | Proposta | Digitação |
|---|---|---|---|
| Marca | texto livre | **Botões** das marcas frequentes, filtrados por moto/carro, + "Outra marca" que revela o campo | 1 toque |
| Modelo | texto livre | **Autocompletar** com sugestões visíveis conforme digita, filtradas pela marca escolhida; texto livre sempre aceito | 2–3 letras |
| Ano | texto livre | **Lista** dos últimos 30 anos, ano atual no topo | 1 toque |
| Cor | texto livre | **Botões** das ~12 cores comuns + "Outra" | 1 toque |
| Quilometragem | texto livre | **Máscara** que insere o ponto de milhar enquanto digita, só aceita dígitos | só números |
| Preço | texto livre | **Máscara de moeda** `R$ 18.500,00` formatada ao digitar, teclado numérico | só números |
| Versão, Descrição | campos iguais aos outros | Recolhidos em **"Detalhes opcionais"**, com exemplo no placeholder | opcional |
| Salvar | 2 botões | **1 botão** fixo no rodapé: "Salvar" | 1 toque |
| Fotos | 1 por envio | `multiple` no seletor: escolhe várias e sobem em sequência | 1 toque |

Mais duas coisas que reduzem erro sem custar campo nenhum:

- **"O que falta para publicar"**: um quadro com a lista marcada — Marca ✓, Modelo ✓, Preço ✓,
  1 foto ✓ — e o botão Publicar habilitado só quando completa. Hoje a regra existe no servidor
  (`assertPublishable`) e é invisível na tela.
- **Ordem na tela seguindo a vida real**: fotos primeiro (o celular está na mão), depois marca,
  modelo, ano, km, preço.

### Como fazer a lista de marcas e modelos

Lista **estática no próprio código** (`src/data/catalogo-marcas-modelos.ts`), não API externa:

- Zero latência e funciona sem internet — o oposto do problema que se quer resolver. Consultar
  FIPE/Brasil API a cada letra digitada acrescentaria 3 requisições encadeadas por campo.
- A loja é de motos com alguns carros. Honda, Yamaha, Suzuki, Shineray e Dafra cobrem quase
  todo o estoque de motos; VW, Fiat, Chevrolet, Ford, Hyundai, Toyota e Renault cobrem os
  carros. São dezenas de linhas de dados, não milhares.
- **Nenhuma migração de banco.** `brand`, `model`, `version` e `color` já são texto livre no
  schema; a lista é só sugestão na interface. Quem precisar de um modelo fora da lista digita.

Sobre o componente: `<datalist>` nativo é o caminho mais curto, mas o comportamento varia entre
Android e iOS e as sugestões podem não aparecer. Como "sugestões conforme digita" é requisito,
vale um combobox próprio de ~60 linhas, sem dependência nova — sugestões visíveis logo abaixo
do campo, navegáveis por toque.

Observe que o campo Ano virando lista **elimina** o defeito do "2.024" em vez de remendá-lo, e
a máscara de moeda torna impossível o preço mal formatado que hoje só é recusado no servidor.

## 4. Plano de ação

### Etapa A — Desempenho (uma tarde, risco baixo, sem mudar comportamento) — FEITA

1. `cache()` em `getAdminIdentity()`.
2. Assinar as fotos a partir das imagens já carregadas; apagar o laço de
   `getAdminPhotoReadUrl()` por foto na página de edição.
3. Memorizar o `S3Client` em `createR2Storage()`.
4. Medir antes e depois, com o servidor em `npm start` (não em `dev`), e registrar os números.

### Etapa A — concluída em 2026-10-25

Aplicada em `src/server/authz.ts`, `src/server/vehicles/service.ts`,
`src/server/storage/r2.ts` e `src/app/admin/(protected)/veiculos/[id]/page.tsx`:

1. `getAdminIdentity()` envolvido em `cache()` do React. A barreira não mudou — toda função do
   serviço continua chamando `requireAdmin()` —, mas as duas consultas de autorização passaram a
   acontecer uma vez por renderização. Fora de uma renderização (Server Action, rota, script,
   teste) `cache` é passagem direta, confirmado no código do React instalado
   (`react/cjs/react.development.js`: `if (!dispatcher) return fn.apply(null, arguments)`), então
   a autorização nunca fica presa a um resultado velho.
2. `getAdminVehicle()` agora devolve `{ vehicle, photos }` com as URLs já resolvidas a partir das
   imagens que ele mesmo carregou, e faz as duas consultas em paralelo. O laço por foto saiu da
   página e `getAdminPhotoReadUrl()` foi removido — nada mais o usava. Resolve três pendências
   da Task 7 de uma vez (consulta por imagem, URL com falha derrubando a página e a lógica de
   URL duplicada entre o estoque e a edição, agora em `photoUrlResolver`).
3. `createR2Storage()` reaproveita um `S3Client` por processo, com chave de conta e credencial.
4. Teste novo `src/server/vehicles/vehicle-photos.test.ts` (8 casos) fixa o comportamento e o
   custo: prova 1 autorização e 2 consultas independente do número de fotos, a ordem e a capa,
   caminho público sem assinatura, falha de assinatura virando foto vazia, 404 e acesso negado.

**Medição contra o banco real** (mesma sequência de idas e vindas que cada versão da página
dispara, mesmo pool `max: 5`, mediana de 5 execuções após descartar a primeira):

| Tela | Antes | Depois | Ganho |
|---|---|---|---|
| Edição, 1 foto | 9 consultas, 916 ms | 4 consultas, 301 ms | **3,0×** |
| Edição, 6 fotos | 24 consultas, 988 ms | 4 consultas, 304 ms | **3,3×** |
| Estoque | 5 consultas, 444 ms | 3 consultas, 248 ms | 1,8× |

O custo da edição deixou de crescer com a quantidade de fotos: 4 consultas com 1 ou com 20.

Verificação: `npm run typecheck`, `npm run lint` e `npm test` (107 testes, 3 arquivos de
integração pulados por falta de `TEST_DATABASE_URL`) passam; `npm run build` compila; o servidor
de produção responde `/admin/login` 200, `/admin` 307 e `/` 200.

Observação registrada durante a verificação: com `npm start`, uma visita anônima a `/admin`
grava dois `⨯ Error: Acesso negado` no log do servidor antes de redirecionar. É a nota de
arquitetura em `PENDENCIAS_PAINEL.md` em ação — o layout não impede o segmento de executar, então
a página também tenta carregar o estoque e falha na autorização. O redirecionamento funciona; o
log é ruído. Não é efeito desta etapa.

### Etapa B — Ambiente (meia hora)

5. ~~Preencher as variáveis `R2_*`~~ — já estavam configuradas; verificado com
   `scripts/check-r2-connection.ts`.
6. Decidir a hospedagem com os números da Etapa A em mãos. Se for Vercel: `regions: ["gru1"]`,
   variáveis no projeto, `AUTH_URL` e `AUTH_TRUST_HOST` do domínio, e o redirect do Google
   apontando para ele.

### Etapa C — Cadastro simples (o maior ganho percebido pelo dono) — FEITA

7. `src/data/catalogo-marcas-modelos.ts` com marcas e modelos por tipo.
8. Botões de marca, combobox de modelo, lista de ano, botões de cor.
9. Máscaras de quilometragem e preço, formatando enquanto digita.
10. Unificar os dois formulários em um "Salvar"; recolher Versão e Descrição em opcionais.
11. Quadro "O que falta para publicar" e Publicar habilitado por essa lista.
12. `multiple` no seletor de fotos.

### Etapa C — concluída em 2026-10-25

O cadastro passou de oito campos digitados para quase tudo por toque.

| Campo | Antes | Agora |
|---|---|---|
| Marca | texto livre | botões das marcas do tipo escolhido + "Outra marca" |
| Modelo | texto livre | autocompletar com sugestões visíveis, filtradas pela marca |
| Ano | texto livre | lista do ano seguinte para trás (45 anos) |
| Cor | texto livre | botões de 12 cores + "Outra cor" |
| Quilometragem | texto livre | máscara de milhar enquanto digita, só dígitos |
| Preço | texto livre | máscara em reais: digita 18500, aparece 18.500 |
| Versão, Descrição | campos iguais aos outros | recolhidos em "Detalhes opcionais" |
| Salvar | 2 botões, 2 transações | 1 botão fixo, 1 transação |
| Fotos | 1 por envio | várias de uma vez, com "Enviando foto 2 de 6..." |
| Publicar | erro depois do toque | lista do que falta, botão desabilitado com o motivo |

Arquivos novos: `src/data/catalogo-marcas-modelos.ts` (marcas e modelos),
`src/app/admin/(protected)/veiculos/masks.ts` (máscaras),
`ChipPicker.tsx` (escolha por toque) e `Combobox.tsx` (sugestões).

Decisões que vale registrar:

- **Lista local, não API.** Consultar FIPE a cada letra traria rede para dentro do campo, que é
  justamente o problema que estamos resolvendo. A lista é só sugestão: marca, modelo e cor
  continuam texto livre no banco, e quem tiver um veículo fora dela digita. **Nenhuma migração.**
  Para incluir um modelo, acrescenta-se uma linha no arquivo.
- **Combobox próprio em vez de `<datalist>`.** O nativo não mostra as sugestões de forma
  previsível no Android e no iOS, e sugestão que não aparece não economiza digitação.
- **Preço em reais inteiros.** Anúncio de veículo não tem centavos, e a máscara clássica de
  centavos obrigaria a digitar 1850000 para R$ 18.500,00. A vírgula é preservada quando já existe
  (preço importado do catálogo antigo), senão editar "18.500,50" viraria R$ 1.850.050.
- **Ano como lista** elimina o defeito do "2.024" virando 2024 em vez de remendá-lo.
- **Sem `capture` no seletor de fotos.** Forçar a câmera impedia escolher fotos já tiradas, que é
  o caso comum. Resolve também o rótulo que enganava no Android.
- **A versão do veículo volta na resposta do envio de foto.** Sem isso a segunda foto de uma
  seleção múltipla seria recusada por "anúncio alterado", porque cada foto incrementa a versão.
- **`publishRequirements` é fonte única.** A tela mostra a mesma lista que `assertPublishable`
  usa para recusar; um teste prova que as duas concordam em todos os casos testados.

Verificação: typecheck, lint e `npm test` (174 testes) passam; `npm run build` compila. A tela foi
aberta no navegador numa página de prévia temporária — já removida — e conferida de ponta a ponta:
chips de marca, sugestões aparecendo ao digitar "cg", seleção preenchendo o campo, máscaras
formatando "25.000" e "18.500" enquanto se digita, detalhes opcionais recolhidos e a lista do que
falta para publicar. Nenhuma mensagem no console. **Conferido em largura de desktop; a tela foi
escrita para telefone (quebra de linha nos chips, alvos de 44 px), mas não consegui reduzir a
janela do navegador para confirmar.**

Testes novos: `masks.test.ts` (22), `catalogo-marcas-modelos.test.ts` (22),
`css-classes.test.ts` (7), mais os blocos de `saveVehicle`, requisitos de publicação e
encadeamento de versão da foto. O teste de classes de CSS Modules é a **pendência nº 1 da lista
do projeto**: CSS Modules devolve `undefined` em silêncio para classe inexistente, e agora um
teste compara o que as telas referenciam com o que a folha define — verificado inventando uma
classe falsa e vendo o teste apontá-la pelo nome do arquivo.

Pendências de `PENDENCIAS_PAINEL.md` resolvidas de passagem: campo Ano aceitando "2.024";
rótulo "Tirar ou escolher foto" enganando no Android; guarda contra classe de CSS inexistente;
e as três da Task 7 já fechadas na Etapa A.

### Etapa B6 — preparada em 2026-10-25, falta você decidir e implantar

**`vercel.json` criado** na raiz, com a única chave que importa:

```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "regions": ["gru1"] }
```

`gru1` é São Paulo (`sa-east-1`), a mesma região do Neon. É o que derruba os 53 ms por consulta
para a casa de 1 a 5 ms.

> Não dá para fazer isso por rota: `preferredRegion` está **depreciado** nesta versão do Next, e
> na Vercel ele só aceita `auto`, `global` ou `home` — passar `gru1` lança erro
> (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/preferredRegion.md`).
> Região é configuração de projeto: `vercel.json`, painel ou CLI.

#### O plano atual é Hobby — e isso decide duas coisas de uma vez

`vercel teams ls` mostra `ronalds-projects … hobby`. Daí:

1. **Uso comercial.** As diretrizes de uso justo restringem o Hobby a uso pessoal não comercial, e
   listam "anunciar um produto ou serviço" como uso comercial. O site de uma loja de veículos é
   isso. Para ficar em conformidade: **Pro, US$ 20/mês**.
2. **A região.** O Hobby permite uma única região, e a documentação não diz quais. Mas a página de
   preços de `gru1` diz que aquele preço é "available only to Pro plan users". Então é provável que
   o deploy com `regions: ["gru1"]` seja recusado no Hobby.

As duas levam ao mesmo lugar, o que simplifica: **assinar o Pro resolve a conformidade e libera
São Paulo**. Se preferir testar antes de assinar, implante assim mesmo — o build falha com erro
claro antes de ir para produção, e o plano B é apagar o `vercel.json` (volta para `iad1`,
Washington, com os ~120 ms por consulta de hoje).

#### Variáveis: o que já está lá e o que falta

`vercel env ls` em Production e Preview mostra configuradas: `DATABASE_URL`,
`DATABASE_URL_DIRECT`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_TRUST_HOST`,
`ADMIN_GOOGLE_EMAIL` e as quatro `R2_*`. Ou seja, quase tudo.

| Conferir antes de implantar | Por quê |
|---|---|
| **`NEXT_PUBLIC_SITE_URL`** — **não está configurada** | É a base de `og:image`, canonical e dados estruturados. Sem ela, `src/data/store.ts` cai na URL gerada pela Vercel, que **muda a cada deploy**. O link no WhatsApp e o canonical do Google apontariam para um endereço efêmero. Defina com o domínio final assim que ele existir. |
| **`AUTH_TRUST_HOST` precisa valer exatamente `true`** | `src/server/auth.ts` faz `trustHost: process.env.AUTH_TRUST_HOST === 'true'`. Qualquer outro valor desliga, e o login quebra em produção. O valor está oculto no painel — confira. |
| **`DATABASE_URL` de Production não pode apontar para a branch `development`** | O `.env` local usa o endpoint `ep-dark-mountain-…`, associado à branch de desenvolvimento. Se o mesmo valor foi copiado para Production, a loja grava no banco de desenvolvimento. É a checagem mais importante da lista. |
| Redirect do Google OAuth | Acrescentar `https://<domínio>/api/auth/callback/google` no console do Google. Sem isso o login falha no primeiro acesso. |
| `AUTH_URL` | Não está configurada e provavelmente não precisa: com `trustHost` ligado o Auth.js v5 usa o host da requisição. Se o login apresentar redirecionamento errado, é o primeiro suspeito. |
| `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Vazias de propósito, conforme o `.env.example`. Não bloqueiam. |

#### Depois de implantar

1. Abrir `/admin`, entrar com a conta do Google autorizada.
2. Cadastrar um veículo de teste e **enviar várias fotos de uma vez** — é o único trecho da
   Etapa C que nenhum teste cobre, porque depende de sessão de administrador.
3. Confirmar que as telas ficaram instantâneas. Se continuarem lentas, a região não pegou:
   conferir em Settings → Functions → Function Regions.
4. Arquivar o veículo de teste.

### Migração do banco para a Virgínia — 2026-10-26

Motivo: `iad1`, região padrão (e gratuita) da Vercel, é Washington/Ashburn — mesma área
metropolitana do `aws-us-east-1` do Neon. Com o banco lá, o plano grátis entrega ~140 ms por tela
do painel, contra ~610 ms com o banco em São Paulo. A vitrine pública é estática e servida pela
CDN, então **nenhum cliente da loja é afetado por essa escolha**; quem paga a viagem até os EUA é
só o dono, no painel.

- **Projeto novo:** `liberato-motos-car-us` (`bitter-term-83685427`), `aws-us-east-1`,
  branch única `production` (`br-quiet-tooth-b83ew3t8`).
- **Projeto antigo:** `liberato-motos-car` (`super-butterfly-58726774`), `aws-sa-east-1`.
  **Intacto.** Só apagar depois que o painel estiver funcionando no novo.

#### Auditoria do que havia no banco antigo

5 veículos, 1 foto, 9 linhas de auditoria, 1 usuário, 1 conta Google, 3 sessões, 1 concessão.

**Nada disso precisava ser preservado:** os 5 veículos eram registros de teste do painel — todos
com marca e modelo nulos, três deles rascunhos vazios — e a importação do catálogo nunca tinha
sido feita (nenhuma linha com `source='legacy'`). O catálogo real continua em
`src/data/inventory-vehicles.ts`, que é de onde a vitrine lê. Migrar dado seria carregar lixo de
teste para a base nova.

A foto continua no R2 (`drafts/7264c72c-…/92b815cf-….jpg`); só a linha de `vehicle_images` ficou
para trás, então o objeto virou órfão e pode ser apagado do bucket.

#### Consequência de usar a branch `production`

O projeto novo tem uma branch só. A trava das escritas mudou de sentido: antes impedia escrever na
branch errada, agora impede escrever no **projeto** errado — os scripts recusam se a conexão não
for exatamente `br-quiet-tooth-b83ew3t8`. A regra antiga, "a `production` não pode ser alterada",
foi removida de `AUTENTICACAO_ADMIN_FASE2_1.md` porque deixou de ser verdade.

O ID novo foi atualizado em `scripts/import-legacy.ts`, `scripts/grant-admin-development.ts` e nos
documentos operacionais. `docs/superpowers/plans/2026-10-25-*.md` ficou intacto de propósito: é
registro datado do que era verdade naquele dia.

A variável ainda se chama `NEON_DEVELOPMENT_BRANCH_ID` embora guarde uma branch de produção.
Renomear atinge `.env`, `.env.example`, três scripts e quatro documentos — vale fazer, como passo
separado.

#### Estado verificado

`npm run db:check`: `sameEndpoint`, `sameBranchId`, `pooledRuntime`, `directUnpooled` e
`branchDevelopmentVerified` todos verdadeiros; `regionSaoPaulo: false`.

`npm run db:migrate`: 5 migrações aplicadas. Schema conferido contra o banco antigo — 9 tabelas,
5 migrações, 1 trigger append-only, 17 checks, 7 chaves estrangeiras e 19 índices nos dois.

**Latência medida daqui:** 83 ms por consulta (era 53 ms para São Paulo). O desenvolvimento local
ficou ~30 ms mais lento por consulta; a produção é que ganha. Reforça a Etapa D.

#### Catálogo importado e acesso restaurado — 2026-10-26

`import-legacy` rodou contra o banco novo: 7 veículos criados, 0 pulados, todos `draft`, todos com
marca, modelo e preço preenchidos, cada um com a capa em `legacy_public`, mais 7 linhas de
auditoria `legacy_imported`. Os sete ficam completos para publicar — é o material de teste que
faltava para exercitar o formulário da Etapa C com dados reais.

**Defeito encontrado no caminho:** `scripts/grant-admin-development.ts` comparava o e-mail do
usuário com o valor **inteiro** de `ADMIN_GOOGLE_EMAIL`, que desde o commit `34bd73a` pode conter
várias contas separadas por vírgula. O login tratava a lista corretamente (`auth-policy.ts` faz
`split`), o script não — então ele falharia com "Conta Google autorizada não encontrada ou
ambígua", mandando investigar o banco, que estava certo. Regressão de `34bd73a`, que atualizou a
política de login e esqueceu o script.

Corrigido com fonte única: `allowedAdminEmails()` passou a ser exportada de `auth-policy.ts` e o
script a consome, em vez de reimplementar a leitura. Três testes novos em `auth.test.ts` travam o
contrato da lista. A duplicação que causou a divergência deixou de existir.

Concessão aplicada e validada pela conexão do próprio app: uma linha ativa em `admin_grants`
ligada a `ronaldsilvadev@gmail.com`, um usuário, uma conta, e os 7 veículos intactos.

#### Ainda pendente

1. Testar no painel o que nenhum teste cobre: envio de várias fotos de uma vez.
2. Variáveis da Vercel — **não tocadas**, conforme combinado.
3. Deploy de pré-visualização.
4. Apagar o projeto de São Paulo, por último.

### Etapa D — Opcional

13. Postgres local no desenvolvimento (consultas em menos de 1 ms, sem rede) — vale se o
    desenvolvimento continuar sendo feito fora da nuvem.

### Sequência recomendada

A → C → B(6). Isto é: arrumar as consultas, simplificar o cadastro, e só então decidir sobre
pagar hospedagem — porque depois de A e C talvez a conta de US$ 20 deixe de ser urgente.

## Fontes consultadas

- Regiões do Render: <https://render.com/docs/regions>, <https://docs.render.com/regions>
- Regiões da Vercel e `gru1`: <https://vercel.com/docs/regions>,
  <https://vercel.com/docs/pricing/regional-pricing/gru1>
- Limite de regiões por plano: <https://vercel.com/docs/functions/configuring-functions/region>
- Uso comercial e plano Hobby: <https://vercel.com/docs/limits/fair-use-policy>,
  <https://vercel.com/docs/plans/hobby>
