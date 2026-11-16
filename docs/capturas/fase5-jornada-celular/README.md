# A jornada no celular — Fase 5 (16/11/2026)

Capturas em **390×844** (iPhone 13/14, o alvo declarado da fase), com o painel rodando local
contra uma **branch efêmera do Neon** criada a partir de produção e apagada no fim. Produção não
recebeu escrita. O overlay de desenvolvimento do Next foi removido das capturas por não fazer
parte do produto.

As imagens estão em 2× (780×1688) e em JPEG: o original em 3× somava 7 MB, o que não cabe num
repositório que ninguém quer clonar devagar.

## Antes

| Arquivo | O que mostra |
|---|---|
| `antes/01-estoque.jpg` | Estoque sem busca. Os rascunhos sem título ocupam o topo porque a ordem era por `updatedAt`. |
| `antes/02-edicao-topo.jpg` | Edição: 12 fichas de marca em 4 fileiras. A primeira tela para em "Ano". |
| `antes/03-edicao-acoes.jpg` | As ações do rodapé: uma primária, destrutivo separado — já estava assim. |
| `antes/04-arte-ajustando-sem-previa.jpg` | **O defeito da Missão 2.** Rolagem em 831 px para alcançar o seletor de foto; a prévia está 207 px acima do topo da janela, 0 px visível. |
| `antes/05-arte-topo.jpg` | O estúdio no topo, antes de rolar: é só aqui que a peça aparece. |

## Depois

| Arquivo | O que mostra |
|---|---|
| `depois/01-estoque-busca.jpg` | Busca por "honda": 3 resultados, e as fichas de estado contando **dentro da busca** (Tudo 3, Rascunhos 2, Publicados 1). |
| `depois/02-edicao-topo.jpg` | Edição: 6 fichas de marca + "Ver todas as marcas (11)". A mesma primeira tela agora chega a "Quilometragem". |
| `depois/03-cadastrar-tipo.jpg` | Passo 1 da jornada: moto ou carro. |
| `depois/04-arte-ajustando-com-previa.jpg` | A prévia fixa no topo durante o ajuste, com selo, foto e ações na mesma tela. |
| `depois/05-foto-anexada.jpg` | Passo "fotografar/anexar": foto no anúncio, marcada como capa. |
| `depois/06-confirmar-publicacao.jpg` | As quatro conferências em ✓ e a confirmação de disponibilidade. |
| `depois/07-publicado.jpg` | Publicado, com link para o anúncio público. |
| `depois/08-arte-previa-fixa.jpg` | O estúdio do veículo recém-publicado: prévia 100% visível enquanto se escolhe selo e foto. |
| `depois/09-compartilhar.jpg` | O fim da jornada. Em `http` o aparelho não abre aplicativos, então a tela diz isso e oferece "Baixar". |
| `depois/10-excluir-conversa-confirmacao.jpg` | A confirmação de excluir conversa (já existia desde `020a9a6`). |
| `depois/11-servidor-barra-exclusao-forjada.jpg` | **A trava nova.** Com o campo de confirmação apagado do DOM, o servidor recusa e a conversa continua no banco. |

## Números medidos nas mesmas telas

| | antes | depois |
|---|---|---|
| Estúdio: prévia visível ao escolher a foto | 0 px (0%) | 338 px (100%) |
| Edição: controles na tela inteira | 46 | 37 |
| Edição: seção "O veículo" | 33 | 24 |
| Edição: fichas de toque | 25 | 16 |
| Edição: altura da página | 3063 px | 2907 px |
| Estoque: buscar um veículo | não existia | 1 campo, no servidor |

Toques para publicar um veículo novo: **11**, antes e depois. A jornada não ficou mais curta —
ficou possível de acompanhar. Marca e cor do estoque real (Honda, Yamaha, Fiat, Volkswagen;
Vermelho, Branco) estão todas entre as seis primeiras, então hoje a lista encurtada não custa
toque nenhum; uma marca da segunda metade custa um toque a mais em "Ver todas".
