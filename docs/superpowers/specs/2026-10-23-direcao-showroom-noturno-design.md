# Direção visual "Showroom noturno" — documento de direção

**Data:** 2026-10-23
**Estado:** aprovado pelo dono do projeto em 2026-10-23 (direção A do comparativo de três direções, com a logo em versão negativa)

## Intenção

A prévia da Liberato Motos Car não é um site de catálogo. É uma peça de prospecção:
ela é aberta numa reunião, na frente dos donos da loja, para que eles queiram
trabalhar com quem a fez. O que precisa acontecer naqueles primeiros dez segundos
é desejo — "eu quero isso para a minha loja" — seguido da sensação de que a coisa
é funcional e profissional, não uma maquete bonita.

O site atual já tem conteúdo correto e estrutura correta, e mesmo assim não produz
esse efeito. O dono do projeto descreveu o incômodo como "cantos quadrados" e
"outras coisas que não sei explicar". O diagnóstico, feito com ele:

- **A tipografia é a maior responsável.** Noto Sans ExtraCondensed Black é uma fonte
  de sistema sem personalidade. A mesma frase, na mesma cor, muda completamente de
  categoria quando trocada por um tipo com caráter.
- **As fotos em painel branco gritam "classificado".** Um retângulo branco dentro de
  um site escuro é a assinatura visual de anúncio de marketplace.
- **A logo mora numa placa branca** dentro do cabeçalho preto, porque o arquivo é
  todo preto sobre transparência e sumiria no escuro. A placa lê como remendo.
- **Não existe profundidade nem movimento.** Tudo é opaco, tudo tem a mesma
  elevação, nada entra em cena, nada flutua.
- Os cantos retos agravam, mas são sintoma, não causa.

## Metas

1. O cabeçalho, o primeiro card de veículo e o título do hero, vistos juntos na
   primeira tela, precisam parecer de uma marca que investe em si mesma.
2. A loja precisa se reconhecer: a logo dela, as motos dela, o endereço dela.
   Nada de identidade genérica.
3. Continuar rápido e acessível. Isto é uma prévia que também prova competência
   técnica; um site bonito e lento prova o contrário.

## Não-metas

- Reescrever conteúdo, preços, textos comerciais ou estrutura de navegação.
- Trocar de framework, adicionar Tailwind (instalado mas não usado) ou introduzir
  biblioteca de componentes.
- Resolver o visualizador 360° de verdade, simulação de parcelas, ou qualquer
  funcionalidade nova.

## Anti-metas (falhas mesmo que "funcione")

- **Motion que atrapalha.** Se a página ficar lenta para ler, com elementos
  entrando enquanto o leitor já está lá, o efeito é de site amador caro em vez de
  site amador barato. Motion serve à hierarquia ou não existe.
- **Recorte de foto mal feito.** Uma moto recortada com franja branca ao redor é
  pior do que a foto em painel branco. Se o recorte não ficar limpo, a foto volta
  para o painel.
- **Perder a leitura em celular.** A maior parte das pessoas que a loja vai mostrar
  o site verá no telefone. Nenhum efeito pode valer uma quebra no mobile.
- **Deixar rastro de maquete.** Arquivos de teste (`public/__resp.html`,
  `.superpowers/`) não podem entrar no build nem no commit.

## A direção aprovada: Showroom noturno

Linguagem de showroom à noite: superfície escura, vidro, uma única luz vermelha,
tudo com cantos generosos, o veículo iluminado sobre uma base em vez de colado num
retângulo branco. Referências visitadas e analisadas: Scout Motors e Longbow.

### Decisões tomadas

**Tipografia.** Archivo substitui Noto Sans nos dois papéis. Display em 900 com
`letter-spacing` fechado (−0.045em) e `line-height` 0.94; corpo em 400/500. Archivo
é mais larga que a ExtraCondensed atual, então todos os `clamp()` de títulos
precisam encolher — caso contrário os títulos quebram de forma diferente da atual.
Rótulos pequenos (eyebrow, kicker, índice de seção) vão para monoespaçada com
`letter-spacing` largo (0.24em–0.3em).

**Cor.** Fundo `#08090C` (mais profundo que o `#07090E` atual, e mais neutro).
Vermelho da marca `#E0252F`. O vermelho ganha função nova: além de texto de
destaque, vira **luz** — halo radial no canto superior do hero, sombra colorida sob
os botões sólidos, brilho sob o veículo na base. Nenhuma outra cor entra.

**Material.** Três superfícies apenas:
- *vidro* — `rgba(255,255,255,.055)` + borda `rgba(255,255,255,.10)` + `backdrop-filter: blur(22px)`;
- *card* — gradiente `155deg` de `rgba(255,255,255,.075)` a `rgba(255,255,255,.018)`, borda `rgba(255,255,255,.09)`, `blur(16px)`;
- *sólido* — vermelho da marca ou branco puro, só em botões.

**Raios.** Pílula (`999px`) para tudo que é controle: botões, chips, navegação,
filtros. `30px` para cards grandes, `18px` para cards pequenos e caixas de
informação. O `--radius: 0.25rem` atual desaparece.

**Navegação.** Pílula de vidro flutuante, destacada da borda superior, largura
máxima menor que o conteúdo. Não encosta em nenhuma borda da tela.

**Logo.** Passa a existir em duas versões a partir do mesmo desenho:
- *negativa* — o preto vira `#F4F5F7`, as listras continuam `#E22A34`. Usada sobre
  fundo escuro, direto, sem placa.
- *positiva* — o arquivo atual, para fundos claros.

A placa branca do cabeçalho e do rodapé é removida. Se a loja tiver o vetor
original, a negativa deve ser refeita a partir dele.

**Fotos de veículo.** As sete fotos do estoque são RGB com fundo branco chapado, sem
canal alfa. Elas passam a ser recortadas e exibidas sobre uma base escura com halo
vermelho e um reflexo espelhado esmaecido abaixo. A foto em painel branco continua
válida nas imagens de Open Graph, que têm fundo claro por construção.

**Motion.** Entrada escalonada do hero no carregamento; revelação por scroll nas
seções; elevação no hover dos cards. Tudo via o pacote `motion` já instalado, e
tudo desligado sob `prefers-reduced-motion`.

### Restrições do projeto que continuam valendo

- A prévia continua `noindex`.
- Preço, quilometragem, disponibilidade e condições comerciais são dados a confirmar
  com a loja antes de publicar; nada no visual pode sugerir que já estão confirmados.
- O perfil do Google prova nota e número de avaliações, e nada além disso. Não
  inventar parcerias de marca nem condições de crédito.
- A loja da Parangaba não tem relação com a loja de nome parecido no Bom Jardim.
- `NEXT_PUBLIC_SITE_URL` precisa estar definido antes de compartilhar, senão
  `og:image` aponta para localhost.

## O que fica a cargo de quem implementa

- Os valores exatos de `clamp()` depois da troca de tipografia — a regra é que
  nenhum título quebre em ponto pior que o atual nas larguras 1360, 800 e 390.
- A técnica de recorte das fotos, desde que o resultado passe na inspeção visual
  descrita no plano.
- Quais seções ganham revelação por scroll e em que ordem, desde que o hero seja
  a única entrada escalonada e o resto seja discreto.
- Como organizar o CSS: hoje é um único `globals.css` de 480 linhas. Dividir é
  aceitável; manter também, desde que os blocos novos fiquem agrupados por assunto.
