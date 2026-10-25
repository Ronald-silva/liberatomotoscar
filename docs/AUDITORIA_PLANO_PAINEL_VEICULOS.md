# Auditoria e plano do painel de veículos — 25/10/2026

## Objetivo

Permitir que o proprietário publique, corrija e retire veículos pelo celular, sem depender de alguém que edite o código. A hipótese de trabalho é que ele tem pouca familiaridade com sistemas administrativos; essa hipótese precisa ser validada com ele usando o próprio aparelho. O fluxo prioritário é: tirar ou escolher fotos → informar os dados essenciais → conferir o anúncio → publicar.

Este documento é um plano. Nenhum painel, banco, login ou publicação de estoque foi implementado nesta etapa.

## O que foi auditado

Leitura do código e da documentação local em 25/10/2026. Não houve entrevista com o proprietário, teste de uso com ele nem verificação de uma implantação pública.

| Evidência no repositório | Consequência para o painel |
| --- | --- |
| Os sete anúncios estão no array de [`src/data/inventory-vehicles.ts`](../src/data/inventory-vehicles.ts); as fotos ficam em `public/images`. | Alterar estoque, preço ou foto exige mudança de arquivos e novo deploy. Não existe persistência para edições feitas pelo proprietário. |
| A vitrine em [`src/components/showcase/Showcase.tsx`](../src/components/showcase/Showcase.tsx) lê diretamente esse array. [`src/components/sections/Credibility.tsx`](../src/components/sections/Credibility.tsx) e [`src/app/opengraph-image.tsx`](../src/app/opengraph-image.tsx) também calculam contagens com ele. | Migrar somente a vitrine deixaria números e imagem de compartilhamento incorretos. |
| A página e a imagem de compartilhamento de [`/veiculos/[slug]`](../src/app/veiculos/%5Bslug%5D/page.tsx) usam `generateStaticParams`; a página define `dynamicParams = false`. [`src/lib/og.ts`](../src/lib/og.ts) lê as fotos diretamente de `public/`. | Um anúncio criado depois do build não ganha uma página pública nesse desenho. Rotas, cache e imagem de compartilhamento precisam funcionar com estoque e fotos persistidos. |
| [`src/components/vehicles/InventoryDetail.tsx`](../src/components/vehicles/InventoryDetail.tsx) usa o mesmo array para sugerir outros veículos. | Vendidos e rascunhos não podem aparecer como sugestões disponíveis. |
| O `package.json` contém Next.js, React e componentes de interface, sem serviço de dados, autenticação ou biblioteca de upload. Não há rotas `/painel`. | O painel precisa de base de dados, armazenamento de fotos, autenticação e autorização no servidor. |
| [`src/app/layout.tsx`](../src/app/layout.tsx) define `noindex` global. O [`README.md`](../README.md) descreve a aplicação como prévia comercial. | Não tratar o site atual como catálogo oficial. Separar a decisão de publicar o site da decisão de liberar o painel. O painel permanece sempre fora da indexação. |
| [`docs/VALIDACAO_CATALOGO.md`](./VALIDACAO_CATALOGO.md) registra dados ainda não conferidos, como disponibilidade, versões e anos de alguns veículos. | Importar os sete anúncios como rascunhos pendentes de revisão, sem apresentá-los como estoque confirmado. Dados de fábrica continuam separados dos dados da unidade. |

**Prioridade do diagnóstico:** a dificuldade principal não é o visual do formulário; é o catálogo depender do código. Construir telas antes de resolver persistência, acesso e atualização da vitrine produziria um painel que parece funcionar, mas não publica de verdade.

## Experiência proposta para o proprietário

### Navegação mínima

Depois do acesso, a primeira tela mostra uma frase direta — **“O que você quer fazer?”** — e três ações grandes:

1. **Anunciar veículo**.
2. **Meus veículos** — com foto, nome, preço e estado visível: `Em preparo`, `À venda`, `Reservado` ou `Vendido`.
3. **Continuar anúncio**, somente quando houver um incompleto.

Sem gráficos, jargão de marketing, menus aninhados ou campos técnicos na tela inicial. Um contador discreto de publicados e rascunhos ajuda a conferir o estoque, mas não compete com as ações. Em cada anúncio, deixar visíveis somente **Editar**, **Ver anúncio** e **Marcar como vendido**; ações menos comuns podem ficar em um menu com rótulos textuais.

### Cadastro em três etapas

| Etapa | O que aparece | Regra de facilidade |
| --- | --- | --- |
| 1. Fotos | **“Adicione as fotos do veículo”**, botão **“Tirar foto ou escolher”**, miniaturas e escolha da foto principal. | Aceitar câmera e galeria; mostrar progresso por foto; permitir trocar/remover e ordenar. Explicar com exemplo curto: frente, laterais, painel e detalhes. Uma foto basta para começar o rascunho. |
| 2. Dados | Tipo (`Moto`/`Carro`), marca, modelo, ano, quilometragem, preço e cor. | Uma coluna, rótulos sempre visíveis, teclado numérico para ano, km e preço; formatar moeda e km automaticamente. Campos desconhecidos admitem **“Não sei agora”** quando a página pública puder omiti-los com honestidade. Versão e observações ficam em **“Mais detalhes (opcional)”**. |
| 3. Conferir | Prévia do card e da página pública, com foto, nome, preço e dados informados. | Destacar o que falta; botões **“Voltar e corrigir”**, **“Salvar para depois”** e **“Publicar veículo”**. Antes de publicar, pedir confirmação explícita de preço, disponibilidade e direito de usar as fotos. |

Gerar o título com marca, modelo e ano *somente se o ano foi informado*. Gerar uma descrição curta apenas com fatos preenchidos; não inventar versão, equipamentos, garantia, financiamento ou condição do veículo. O proprietário pode editar o texto, mas não precisa escrever uma descrição para publicar.

**Obrigatórios para publicar:** tipo, marca, modelo, preço válido, pelo menos uma foto válida e disponibilidade confirmada como `Disponível`. Ano, km, cor e versão podem ficar ausentes, desde que a prévia mostre claramente essa ausência e a página pública não os deduza. O rascunho aceita informações incompletas. A loja deve decidir, antes de implementar, se ano e km serão exigências comerciais adicionais.

### Ações depois da publicação

- **Editar preço ou informação:** abrir o mesmo formulário com os valores preservados, mostrar o que mudou e confirmar a atualização na vitrine.
- **Reservar:** mostrar `Reservado` no site e impedir mensagem que sugira disponibilidade imediata. Permitir voltar a `Disponível`.
- **Marcar como vendido:** retirar imediatamente da vitrine e das sugestões. Manter o link compartilhado com aviso **“Este veículo foi vendido”**, sem convite para consultar aquele veículo e com ligação para outros disponíveis. Mostrar **“Desfazer”** no painel após a ação. A política final para páginas vendidas e indexação deve ser definida antes de ativar SEO.
- **Retirar anúncio:** arquivar, com possibilidade de restaurar. Não oferecer exclusão definitiva como ação cotidiana.

## Estados e mensagens que precisam existir

| Situação | Resposta na interface |
| --- | --- |
| Primeiro acesso, nenhum veículo | **“Você ainda não anunciou veículos.”** + **“Anunciar veículo”**. |
| Sem resultado em busca/filtro | Informar o filtro usado + **“Limpar filtros”**. |
| Foto demorada ou falhou | Progresso por foto; **“Não conseguimos enviar esta foto. Tente de novo.”** Preservar as demais fotos e os dados digitados. |
| Internet cai durante cadastro | Indicar **“Sem conexão. Seu rascunho está guardado neste aparelho”** somente se o armazenamento local estiver funcionando; sincronizar quando voltar e avisar o que foi ou não enviado. Nunca afirmar que foi salvo no servidor sem confirmação. |
| Sessão expirou | Pedir novo acesso e voltar ao rascunho ou anúncio que estava sendo editado. |
| Erro ao publicar | Manter todos os dados, apontar o campo com problema e oferecer **“Tentar publicar novamente”**. |
| Publicação concluída | **“Veículo publicado”** + **“Ver anúncio”** + **“Anunciar outro”**. |
| Alteração feita por outra pessoa | Avisar que há uma versão mais recente antes de sobrescrever; permitir revisar as diferenças. |

Em celular, botões principais grandes, com texto e alvo de toque de pelo menos 44 × 44 px; contraste alto, foco visível, sem ações que dependam de passar o mouse. Evitar tela longa de campos, termos como “slug”, “SKU”, “SEO”, “upload” e alertas técnicos. O botão **“Salvar para depois”** deve estar disponível durante todo o cadastro, com salvamento automático após alterações confirmado por **“Alterações salvas”**.

## Estrutura técnica recomendada

1. **Fonte única de estoque:** tabela de veículos com ID interno imutável, `slug` público único, dados do anúncio, estado (`rascunho`, `publicado`, `reservado`, `vendido`, `arquivado`), datas e versão de edição. Tabela de fotos com ordem, capa, metadados e vínculo ao veículo. Preço em centavos para evitar erro de arredondamento.
2. **Acesso restrito:** uma conta inicial do proprietário, sem cadastro público; autenticação adequada ao canal que ele realmente usa, sessão segura e autorização conferida no servidor em toda leitura e escrita do painel. Nunca confiar somente em esconder botões. Registrar quem alterou preço e estado.
3. **Fotos:** armazenamento persistente externo ao repositório, tipos e tamanhos limitados, imagens processadas para a vitrine, miniaturas e envio retomável ou repetível. Não colocar fotos novas em `public/images` em tempo de execução.
4. **Publicação:** mutações no servidor com validação de campos, autorização e registro de auditoria. A vitrine, o detalhe, as sugestões, a contagem e as imagens de compartilhamento devem consultar a mesma fonte e refletir uma mudança sem novo deploy. Adaptar a geração de imagens de compartilhamento, que hoje lê apenas arquivos locais. Definir invalidação de cache e verificar o resultado público após cada publicação.
5. **Migração:** manter os três conceitos ilustrativos fora da área administrativa e fora do estoque real. Importar os sete registros atuais com os mesmos slugs, fotos e proveniência, inicialmente como rascunhos; conferir cada um com a loja antes de publicar. Preservar referências técnicas verificadas em uma seção separada que o cadastro simples não possa atribuir automaticamente a outra unidade.
6. **Operação:** backups e restauração testada, logs de falhas sem dados pessoais desnecessários, ambiente de teste, e proteção de `/painel` contra indexação. Não ativar busca pública enquanto o projeto ainda for prévia com `noindex` global.

A escolha concreta do serviço de banco, fotos e acesso depende do ambiente de implantação e do aparelho/canal de acesso do proprietário, ainda não confirmados no repositório. Não há ganho em instalar pacotes ou contratar serviços antes dessa definição. A documentação local do Next.js 16.4.2 confirma que `generateStaticParams` cria rotas no build e que `dynamicParams` controla caminhos não gerados; a implementação precisará trocar a estratégia estática atual por leitura do estoque em tempo de execução e política explícita de cache.

## Ordem de execução e critérios de aceite

| Fase | Entrega | Critério para avançar |
| --- | --- | --- |
| 0. Validar com o proprietário | Observar como ele tira fotos, identifica modelo, usa email/WhatsApp e edita preço; testar um rascunho em papel ou protótipo no aparelho dele. | Ele entende “Anunciar”, “Guardar rascunho”, “Publicar” e “Vendido” sem explicação do desenvolvedor; dúvidas viram ajustes de texto e sequência. |
| 1. Base de dados e acesso | Modelo de veículo/fotos, migração dos sete itens para rascunho, login e autorização no servidor. | Usuário sem acesso não lê nem altera o painel; sair e entrar mantém rascunhos; backup e restauração verificados. |
| 2. Cadastro móvel | Três etapas, envio de fotos, salvamento de rascunho, validação e prévia. | Um novo veículo é cadastrado no celular sem ajuda; erro de rede não apaga dados; fotos podem ser trocadas e ordenadas. |
| 3. Publicação real | Vitrine, detalhes, contagens, sugestões, metadados e compartilhamento ligados à fonte única. | Publicar, editar preço, reservar e vender mudam o site público corretamente sem editar código nem fazer deploy. |
| 4. Acabamento e piloto | Estados vazios/erros, acessibilidade, revisão de segurança, guia curto e teste com estoque real autorizado. | O proprietário conclui sozinho as tarefas abaixo; nenhum item não confirmado aparece como disponível. |

### Teste de usabilidade que decide a entrega

No aparelho e na conexão habituais do proprietário, sem instruções durante a tarefa, pedir que ele:

1. Anuncie uma moto a partir de fotos do celular.
2. Corrija um preço e confirme a mudança no site.
3. Marque um veículo como vendido e confira que saiu da vitrine.

Registrar tempo, hesitações, campos errados, toques perdidos e necessidade de ajuda. Meta inicial para validar, sujeita ao teste real: concluir as três tarefas sem assistência; cadastro em até cinco minutos quando fotos e dados já estiverem à mão. Se ele não conseguir, simplificar o fluxo antes de adicionar funções.

## Decisões pendentes antes de implementar

- Qual celular e navegador ele usa? A conexão na loja é confiável?
- Ele usa email com frequência para entrar, ou outra forma de acesso será mais natural? Quem será a segunda pessoa autorizada quando ele não estiver disponível?
- A loja quer publicar itens sem ano ou km informado, ou prefere exigir esses dados?
- Quem valida preço, fotos, disponibilidade e condições antes da primeira publicação oficial?
- Em qual serviço o site será hospedado e qual domínio será usado? Qual orçamento mensal aceitável para banco, fotos e autenticação?

**Fora do primeiro painel:** IA para escrever anúncios, reconhecimento automático de modelo por foto, CRM, financiamento, relatórios complexos e 360°. O valor inicial está em publicar um veículo correto rapidamente e retirá-lo assim que for vendido.
