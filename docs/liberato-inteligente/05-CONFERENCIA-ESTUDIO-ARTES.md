# Conferência do estúdio de artes no aparelho — roteiro para a loja

**Para quem é:** o dono da loja, ou quem for publicar do celular da loja.
**Por que existe:** quatro coisas do estúdio novo **não se provam com teste automatizado**. Elas
dependem de aparelho real, de publicar de verdade e do olho de quem vende. Este roteiro diz o que
tocar, o que olhar, o que anotar e **onde cada número vai** quando a conferência mostrar algo
diferente do previsto.

**Estado em 06/11/2026:** o código das onze primeiras tarefas do plano está pronto e no branch
`feat/estudio-artes-destino-primeiro` (suíte verde, tipos e lint limpos). Nada deste roteiro foi
executado: não há aqui os dois aparelhos, nem o painel por HTTPS, nem conta de teste nas redes.
Nenhum número foi estimado de cabeça para preencher o buraco — onde falta medição, está escrito que
falta.

**O que você precisa antes de começar**

1. O painel aberto **por HTTPS** no celular (o endereço publicado, não o IP da rede local — por HTTP
   o aparelho só deixa baixar, e é a própria tela que avisa isso).
2. Dois aparelhos, se possível: um **Android com Chrome** e um **iPhone com Safari**. Os dois se
   comportam de forma diferente no momento de compartilhar, e é justamente aí que mora o risco.
3. Um veículo **publicado**, com foto real da loja — de preferência um com foto tirada de pé
   (retrato), que é o caso difícil.
4. Uma conta de teste em cada rede (Instagram, Facebook, WhatsApp, TikTok), para publicar sem que
   cliente nenhum veja.

---

## 1. Quanto tempo leva e quanto pesa cada arquivo

**O que fazer:** abra `Criar arte` no veículo escolhido e **não toque em nada**. Assim que a foto
aparece, a tela começa a preparar os quatro arquivos em segundo plano e mostra "Preparando os
arquivos dos quatro destinos…". Cronometre do instante em que a foto aparece até essa frase
desaparecer. Repita três vezes (feche e abra a tela), nos dois aparelhos.

**O que anotar:** o tempo dos quatro juntos, em cada aparelho, e se o aparelho esquentou, travou a
rolagem ou recarregou a página sozinho (sinal de falta de memória).

**Depois:** toque em `Baixar` nos quatro destinos, um por um, e veja o tamanho de cada arquivo em
Downloads (toque e segure → detalhes).

**Onde o número vai:** `docs/superpowers/specs/2026-11-05-estudio-artes-destino-primeiro-design.md`,
seção **§8.2**, no aviso que hoje diz "ainda não medidos". Escreva o que mediu, por aparelho.

**O que é problema:** acima de uns 2 segundos para os quatro, ou acima de 1 MB por arquivo, vale
rever. Abaixo disso, está folgado.

## 2. A dimensão de cada arquivo

**O que fazer:** com os quatro arquivos baixados, confira a dimensão de cada um. No celular, toque e
segure o arquivo → detalhes mostra largura × altura. Quem tiver o projeto no computador pode rodar:

```bash
for f in ~/Downloads/liberato-*.jpg; do npx tsx -e "import {readFileSync} from 'node:fs'; const b=readFileSync(process.argv[1]); let i=2; while(i<b.length){ if(b[i]!==0xFF) {i++; continue;} const m=b[i+1]; if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC){ console.log(process.argv[1], b.readUInt16BE(i+7)+'x'+b.readUInt16BE(i+5)); break;} i+=2+b.readUInt16BE(i+2);}" "$f"; done
```

**O que tem de aparecer:** `liberato-<veículo>-feed.jpg` em **1080 × 1350**; os outros três —
`-story`, `-status`, `-tiktok` — em **1080 × 1920**.

**O que é problema:** qualquer outra dimensão. Se vier o dobro (2160 × 2700, por exemplo), avise
quem programa: é o `pixelRatio` do export, que tem de ficar em 1.

## 3. A área segura, com o fantasma ligado

Esta é a conferência mais importante, e a razão de o fantasma existir. Os números de área segura de
cada rede **são estimativa declarada**: nenhuma plataforma publica mapa oficial em pixels, e os
guias de terceiros divergem entre si. O do Status do WhatsApp não tem nem guia atrás.

**O que fazer, para cada um dos quatro destinos:**

1. Toque na ficha do destino (Feed, Stories, Status, TikTok). O interruptor
   "Mostrar onde o aplicativo escreve por cima" vem ligado: os retângulos e o círculo tracejados são
   o fantasma — eles marcam onde a rede desenha a interface dela em cima da sua peça.
2. Confira na prévia: **nenhum texto da peça** (título, dados, preço, telefone, observação, logo,
   selo de vendido) deve ficar debaixo de um retângulo do fantasma.
3. Toque em `Publicar no {destino}` e publique de verdade **na conta de teste**.
4. Abra a publicação no aplicativo, no aparelho, e compare com a prévia: a interface real da rede
   (nome, avatar, caixa de resposta, trilha de ícones, legenda, barra de navegação) cobriu alguma
   letra?

**O que anotar:** por destino, qual borda ficou apertada (topo, base, esquerda, direita) e em quantos
dedos de folga — ou, se preferir, tire uma captura da tela com a publicação aberta.

**Onde o número vai:** `src/components/art-studio/destinations.ts`, no campo `safe` do destino
(`top`, `right`, `bottom`, `left`, em pixels de uma peça de 1080 de largura). **É um lugar só**: a
prévia, o fantasma e o arquivo saem todos desse mesmo dado, então corrigir ali corrige as três
coisas de uma vez. Registre também na tabela do **§5** do spec, com o motivo.

**Referência de conversão:** a peça tem 1080 px de largura. Um dedo na tela do celular é por volta
de 100 px dessa medida; se o texto ficou coberto por "um dedo e meio", são uns 150 px a acrescentar
naquela borda.

## 4. O limiar de recorte da foto (`cover` / `contain`)

**O que fazer:** repita o passo 3 trocando a **foto** do veículo (na seção recolhida
"Foto, selo e texto auxiliar"). Inclua de propósito as fotos tiradas **de pé** (retrato) e as muito
largas (panorâmicas).

**O que olhar:** o veículo aparece **inteiro**? A peça tem a foto nítida por cima e, atrás, a mesma
foto ampliada e desfocada, sangrando até as bordas — isso é o desenho, não defeito. O que não pode é
o carro ou a moto sair **cortado**: faltando a frente, a traseira, o teto ou a roda.

**O que anotar:** qual foto cortou e o que faltou nela.

**Onde o número vai:** `src/components/art-studio/art-layout.ts`, na constante `COVER_TOLERANCE`
(hoje `0.15`). Ela decide quando a foto é esticada para cobrir a peça inteira (`cover`, que recorta)
em vez de aparecer inteira (`contain`, que não recorta). **Diminuir** o valor faz recortar menos;
aumentar faz recortar mais. Anote o motivo junto da mudança.

## 5. Os selos que sobraram

O estúdio tinha seis "modelos" e agora tem **cinco selos**: Recém-chegado, Destaque da semana, Preço
em destaque, Reservado e Vendido. Saíram o tema claro (fundo branco) e as molduras separadas, porque
a peça nova é foto cheia com véu escuro — e texto branco sobre fundo claro não se lê.

**O que fazer:** gere uma peça com cada selo disponível (veículo publicado mostra três; reservado e
vendido mostram só o próprio).

**O que responder:** o tema claro que saiu era usado? Faz falta? Se fizer, é conversa de desenho —
anote e devolva a quem programa, em vez de mudar número nenhum.

**Trava comercial que não se mexe:** "Preço em destaque" mostra **apenas o preço do cadastro**. Ele
não anuncia desconto, não tem validade e não passou por aprovação de campanha. O estúdio **não deve
ser apresentado como criador de ofertas promocionais**, e o texto auxiliar não deve ser usado para
simular redução de preço, financiamento ou garantia.

## 6. Dois comportamentos que podem surpreender, e estão certos

- **Compartilhar não diz para qual aplicativo foi.** O navegador não pode saber o que você escolheu
  no menu do aparelho. Por isso há um botão por destino, cada um com o arquivo certo já pronto.
- **A legenda vai para a área de transferência no mesmo toque.** Depois de compartilhar (ou baixar),
  basta colar no aplicativo. Se não colar nada, use o botão "Copiar legenda", que é a rede de
  segurança — e ele confere se o anúncio mudou antes de copiar.
- **Se nada abrir no primeiro toque**, a tela pede um segundo toque. Isso acontece quando o arquivo
  daquele destino ainda não estava pronto: o aparelho gasta a "permissão de toque" desenhando. O
  segundo toque abre o menu, e o arquivo já está na mão.
- **Rascunho e arquivado não geram peça comercial.** A prévia aparece, mas publicar e baixar ficam
  desligados, e a tela diz o motivo. É proposital.

---

## Resumo de onde cada coisa é corrigida

| O que a conferência mostrou | Onde se corrige |
| --- | --- |
| Tempo e peso dos arquivos | §8.2 do spec de 05/11 (escrever o medido) |
| Rede cobriu texto da peça | `destinations.ts`, campo `safe` do destino; registrar no §5 do spec |
| Veículo saindo cortado | `art-layout.ts`, `COVER_TOLERANCE` |
| Dimensão do arquivo errada | não é ajuste de número: avisar quem programa (`pixelRatio` do export) |
| Selo faltando ou tema claro fazendo falta | conversa de desenho; nada a trocar sozinho |
