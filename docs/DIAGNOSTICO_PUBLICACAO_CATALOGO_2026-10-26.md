# Diagnóstico da publicação e do catálogo — 26/10/2026

## Causa confirmada

- O domínio `liberatomotoscar.vercel.app` aponta para o deployment `dpl_GidjxdAT3znVKKRTbJvz9PMi4Pnj`. O log de build registra `main`, commit `34bd73a`.
- Nesse build, `/` é estático e `/veiculos/[slug]` usa `generateStaticParams` para os slugs fixos. O código lia `INVENTORY_VEHICLES`; o serviço que consulta veículos publicados no Neon ainda não era usado pela vitrine.
- Um slug com status `published` no Neon respondeu HTTP 404 em produção antes desta correção: `veiculo-011f4562-838a-4313-9692-d04854e0b7b6`.
- Portanto, o impedimento principal é a origem estática dos dados e a lista fechada de slugs. `revalidatePath('/admin')` não altera HTML que nunca consultou o banco. Não há `revalidateTag` aplicável porque a vitrine não usava dados etiquetados em cache.

## Conexões verificadas sem expor credenciais

| Ambiente | Neon | R2 |
| --- | --- | --- |
| Local com `.env` | Endpoint `ep-long-field-b8gvpb2n`, banco `neondb`, branch real `br-quiet-tooth-b83ew3t8`; `SELECT 1` funcionou | Sem variáveis R2 locais |
| Vercel Production | Mesmo endpoint, banco e branch real; 20 veículos no início do teste | Bucket configurado; `HeadBucket` respondeu HTTP 200 |

O projeto Neon registrado neste repositório para esse endpoint/branch é `liberato-motos-car-us` (`bitter-term-83685427`), branch `production`, região `aws-us-east-1`. A comparação foi feita com as configurações existentes. A exportação temporária da Vercel foi usada só para as verificações e para o processo local de teste; nenhuma URL ou credencial foi substituída no projeto.

## Correção implementada

- A vitrine, os números exibidos e os detalhes agora consultam os status `published` e `reserved` do Neon. Um detalhe `sold` continua acessível, conforme a regra já existente do serviço.
- As capas e fotos são resolvidas no pedido. As rotas `/`, `/veiculos/[slug]` e suas imagens Open Graph são dinâmicas no build Next.js 16. A mudança de status também revalida os caminhos públicos para atualizar navegações já abertas.
- O botão **Publicar anúncio** aparece antes da seção **Gerenciar anúncio**. Arquivar e excluir exigem confirmação clara e ficam abaixo de uma separação visual. A publicação confirma disponibilidade, mostra o estado **Publicado** e oferece **Ver anúncio público**.
- Não foi criada migração, branch Neon, projeto, bucket nem deploy.

## Teste ponta a ponta

Execução local com o build de produção e viewport de 390 px, usando Neon e R2 existentes. Marcador único: `1353E89C47`.

| Tipo | ID do registro de teste | Resultado |
| --- | --- | --- |
| Moto | `10e967ec-db1e-407b-af44-21d98a013f5e` | Criada, preenchida, foto enviada, publicada, status `published` conferido no banco, detalhe e card públicos abertos |
| Carro | `c18a7d43-a7f8-47ad-bb78-300f85b2c9da` | Mesmo fluxo completo |

Não houve novo build ou deploy entre a publicação e a consulta pública. Depois da verificação, **somente** esses dois registros marcados foram arquivados; suas linhas de imagem foram removidas e a listagem dos prefixos R2 dos respectivos IDs retornou zero objetos. A comparação antes/depois apontou zero alterações em veículos ou imagens preexistentes. Capturas de tela locais: `/tmp/liberato-public-e2e-1353E89C47/`.

Validação final: 225 testes passaram, 27 continuam pulados (suítes de integração condicionadas ao ambiente); lint, typecheck e build passaram. O build lista `/`, `/opengraph-image` e `/veiculos/[slug]` como rotas dinâmicas.

Também foi validado o build local sem R2 configurado: `/` respondeu HTTP 200 com os anúncios publicados. Nesse caso, a vitrine usa uma imagem de reserva para fotos R2 que não puderem ser assinadas; com o R2 configurado no teste ponta a ponta, as fotos reais apareceram.

## Pendência para produção

O domínio ainda executa `34bd73a` e continuará exibindo a vitrine antiga até uma implantação autorizada do código corrigido. Nenhum deploy foi feito nesta tarefa.

Os sete veículos importados da vitrine antiga seguem em `draft` no Neon. Quando a correção for implantada, esses rascunhos deixarão de ser mostrados como anúncios ativos. A loja precisa revisar disponibilidade e publicar cada um que deva continuar visível; esta tarefa não mudou seus status automaticamente.
