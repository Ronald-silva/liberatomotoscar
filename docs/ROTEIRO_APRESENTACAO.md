# Roteiro de apresentação do painel

Para seguir no celular, de pé, na frente do Elton. Nada aqui exige decisão na hora: se algo sair do roteiro, vá para a seção "Se algo falhar".

Escrito em 2 de novembro de 2026, sobre a branch `painel-reformulacao-agenda`. O painel não aparece em buscadores de propósito (o site espera o domínio próprio); isso não é defeito e não precisa ser explicado.

---

## 0. Antes de tudo: duas condições que travam a demonstração

### 0.1 A agenda precisa do banco certo

A tabela `visit_appointments` (migração `drizzle/0010_majestic_newton_destine.sql`) **não foi aplicada na produção**. O registro de migrações da produção tem 9 entradas, a mais nova de 27/10/2026, e a tabela não existe lá.

- Enquanto você não autorizar aplicar a migração, **a demonstração da Agenda só funciona num banco que já tenha a tabela** (o de desenvolvimento).
- Se a agenda falhar por isso, a tela agora avisa "Não foi possível carregar a agenda agora" em vez de quebrar. Mas aviso na frente do cliente não é demonstração.
- **Cuidado antes de abrir `/admin/agenda` na produção.** O código tem um criador automático de tabelas (`ensure-schema.ts`) que também cria `visit_appointments` ao primeiro acesso, se o usuário do banco tiver permissão. Se isso acontecer, a migração 0010 depois falha com "tabela já existe". Decida a ordem com calma e antes: ou aplica a migração primeiro, ou não abre a agenda em produção.

### 0.2 O WhatsApp conectado é o número de teste da Meta

O número é o de teste (`liberato-motos-car-teste`, `+1 555-195-6955`). Número de teste só troca mensagem com uma **lista curta de destinatários verificados**. A Dayse **não responde** a telefone que não esteja nessa lista.

- Para mostrar o atendimento ao vivo: ou você coloca o telefone de quem vai mandar a mensagem na lista, no painel da Meta, **antes**; ou faz a demonstração com o seu próprio telefone, que já esteja autorizado.
- Nenhum cliente real alcança a Dayse hoje. Isso não é defeito do painel; é o número.
- Sem uma das duas coisas resolvidas, **não prometa atendimento ao vivo**. Mostre a conversa que já está na tela (seção 3).

### 0.3 O que ainda não existe (não diga que existe)

- **A agenda não se preenche sozinha.** A Dayse conversa e chama o vendedor, mas ainda não marca visita. Hoje a visita entra **à mão**, pelo botão "Marcar visita". Isso vem na próxima etapa.
- **A resposta do vendedor pelo painel ainda não é enviada ao WhatsApp do cliente.** A caixa grava a mensagem no painel; o envio pela Meta é da próxima etapa. Não responda a um cliente de verdade pela caixa do painel.

Frase segura para os dois casos: "A agenda hoje é preenchida pelo vendedor; fazer a Dayse marcar sozinha é o próximo passo."

---

## 1. Checklist no seu celular (faça na véspera e de novo 10 minutos antes)

Ninguém conseguiu ver o painel numa tela real durante a construção. Estes itens só você confirma, no **seu** aparelho. Se um falhar, anote e avise antes da demonstração.

Entre em `/admin` no navegador do celular e marque:

1. **Barra de baixo não cobre botão.** Na tela Estoque, role até o fim. O botão "Cadastrar veículo" deve aparecer inteiro, acima da barra Estoque / Agenda / Divulgar / Conversas. Errado: o botão cortado ou escondido atrás da barra.
2. **Barra de baixo na edição do veículo.** Abra um veículo. A barra com "Publicar anúncio" deve ficar visível e tocável, sem a barra de seções por cima. Errado: um botão sobre o outro.
3. **Teclado não esconde o campo.** Na edição do veículo, toque num campo de texto (preço, por exemplo). Com o teclado aberto, o campo em que você está digitando deve continuar à vista. Errado: o campo some atrás do teclado ou da barra. Repita em "Marcar visita" na Agenda (nome e telefone).
4. **A prévia é o arquivo enviado.** Em Divulgar, crie a arte de um veículo e confira o título longo (marca e modelo grandes). A prévia mostra o nome inteiro ou termina em reticências, sem corte no meio da letra. Toque em "Baixar", abra a imagem baixada e compare com a prévia: preço, nome e foto iguais. Errado: nome cortado só no arquivo, ou preço diferente.
5. **"Enviar para…" abre o menu do aparelho?** Toque nele. No Android costuma abrir a lista de aplicativos (WhatsApp, Instagram...). **No iPhone pode ser que a imagem seja baixada em vez de abrir o menu: isso foi previsto de propósito e não é defeito.** Se acontecer, diga "no iPhone ele salva a imagem e eu mando pela galeria" e siga. Descubra qual dos dois acontece **no seu** aparelho antes de apresentar.
6. **Cartões da agenda legíveis de longe.** Na Agenda, com pelo menos duas visitas, segure o celular na distância em que o Elton vai olhar. Dá para ler nome, hora e veículo sem apertar os olhos? Errado: texto pequeno, hora que se confunde com o resto.
7. **Entrar no painel.** Faça login e abra as quatro seções. Todas carregam, nenhuma mostra aviso vermelho ou "Não foi possível carregar".
8. **Dados da demonstração.** Tenha ao menos 1 veículo **publicado, com foto, marca, modelo, ano e preço**. Sem isso, Divulgar não deixa criar arte e diz o que falta.
9. **Telefone da Dayse** (seção 0.2) está na lista da Meta, ou você vai usar o seu.
10. **Bateria e rede.** Carregador à mão, dados móveis como reserva do Wi-Fi.

---

## 2. A ordem e por que

Estoque, depois Divulgar, depois Conversas, depois Agenda. O Ajustes é um bônus de 20 segundos no fim.

- Começa pelo **veículo** porque tudo nasce nele; é o que o concorrente não faz: o preço digitado uma vez vale para a arte e para a Dayse.
- A **arte** vem em segundo porque é o que o Elton já conhece do concorrente. Aqui a diferença é que você não digita o preço.
- **Conversas** em terceiro, pois é o argumento mais forte: alguém responde o cliente às 22h de domingo, e o vendedor vê o que o cliente pediu.
- Termina na **Agenda**, para a última imagem da demonstração ser uma visita marcada.

Se você só tiver 5 minutos: pule direto para a seção 5 (Conversas) e a seção 6 (Agenda).

Cada passo abaixo: toque, o que aparece, o que dizer, o que costuma dar errado.

---

## 3. Passo 1. Estoque (cerca de 1 minuto)

**Tela:** `Estoque` (primeiro botão da barra de baixo).

1. Toque em **Estoque**.
2. Mostre a lista: foto, nome, situação (Rascunho, Publicado...), ano e preço.
3. Toque em **Publicados** para mostrar o filtro.
4. Toque em um veículo e mostre os campos: marca, modelo, ano, preço.

**Diga:** "Aqui cada moto e carro é cadastrado uma vez. O que está aqui alimenta a arte e o atendimento."

**O que costuma dar errado:** a lista mostra "Sem foto" no lugar da capa, ou o botão de baixo fica atrás da barra. Se for a capa, diga que a foto vem do cadastro e siga. Se for o botão, role um pouco; esse item está no checklist (1).

---

## 4. Passo 2. Divulgar (cerca de 2 minutos)

**Tela:** `Divulgar`.

1. Toque em **Divulgar**.
2. Toque em **Criar arte** no veículo escolhido.
3. Escolha o formato (feed, quadrado, Stories) e o modelo (por exemplo "Recém-chegado").
4. Mostre que marca, modelo, ano e preço já estão na arte. **Não digitou nada.**
5. Toque em **Ver prévia da arte** e depois em **Enviar para…** (ou **Baixar**, no iPhone se for o caso).

**Diga:** "O preço e o nome vêm do cadastro. No programa que o senhor usa, digita-se o preço à mão; aqui ele não erra, porque é o mesmo dado do estoque."

**O que costuma dar errado:**
- O veículo aparece com "Completar cadastro" no lugar de "Criar arte": falta marca, modelo, ano, preço ou foto. Leia a frase que a tela mostra e escolha outro veículo.
- Aviso "A foto ainda não carregou": espere 2 segundos e toque de novo.
- "Enviar para…" no iPhone baixa a imagem: é o esperado (checklist 5).
- Aviso de que o preço mudou: quer dizer que alguém alterou o veículo depois que você abriu a arte. A arte não sai com preço antigo. Volte e abra de novo.

---

## 5. Passo 3. Conversas (cerca de 3 minutos)

**Tela:** `Conversas` (último botão da barra). O selo no ícone mostra quantas aguardam o vendedor.

**Se o telefone está autorizado na Meta (seção 0.2):**

1. Do seu telefone, mande uma mensagem ao número conectado, como cliente: "Tem a CG 160? Posso ver amanhã à tarde?".
2. A Dayse responde. Mostre a resposta chegando.
3. No painel, toque em **Conversas**. A conversa aparece. Toque nela e mostre o histórico: quem falou (Cliente, Dayse, Vendedor) e o que o cliente informou.
4. Mostre **Assumir conversa**, **Devolver para automação** e **Encerrar conversa**.

**Se não está autorizado:** mostre a conversa que já existe na lista e diga que ao vivo depende da liberação do número de teste.

**Diga:** "Às dez da noite de domingo, com a loja fechada, a Dayse responde sobre estoque, preço, endereço e financiamento. Quando o cliente pede vendedor, ele aparece aqui, aguardando, e o senhor vê tudo o que foi dito."

**Não faça:** não use a caixa de resposta para "responder o cliente" na frente dele. Hoje ela grava no painel mas não envia ao WhatsApp (seção 0.3). Mostre **Assumir** e o histórico, e pare aí.

**O que costuma dar errado:**
- A Dayse não responde: quase certamente o telefone não está na lista da Meta. Não insista. Diga "o número de teste só fala com telefones liberados" e mostre a conversa existente.
- A tela mostra "Não foi possível carregar": leia em voz alta e tente atualizar uma vez.
- A lista parece vazia: conversa sem mensagem não aparece de propósito.

---

## 6. Passo 4. Agenda (cerca de 3 minutos)

**Tela:** `Agenda`. O selo mostra as visitas de hoje.

1. Toque em **Agenda**.
2. Se estiver vazia, a tela diz "Nenhuma visita marcada. Marque a primeira abaixo." e já abre o formulário. Se tiver visitas, toque em **Marcar visita**.
3. Preencha **Nome do cliente**, **Telefone com DDD**, **Dia**, **Hora** (dentro de segunda a sábado, 9h às 18h) e **Veículo**.
4. Toque em **Marcar visita**.
5. A visita aparece em "Hoje", "Amanhã" ou "Esta semana". Mostre o cartão: nome, hora, veículo, o botão **WhatsApp** e **Ver conversa**.
6. Toque em **Corrigir** para mostrar que dá para mudar dia e hora, e em **Cancelar visita** para mostrar que há confirmação (**Manter visita** desfaz).

**Diga:** "O cliente que a Dayse atendeu vira uma visita marcada aqui, com hora, veículo e o telefone para chamar. Hoje é o vendedor que marca. O próximo passo é a Dayse marcar sozinha."

**O que costuma dar errado:**
- "Não foi possível carregar a agenda agora": a tabela não existe nesse banco (seção 0.1). Leia a mensagem em voz alta, diga "essa parte depende de uma atualização do banco que ainda vou liberar" e vá para o Ajustes.
- O veículo não aparece para escolher, com a frase de que a lista do estoque não carregou: marque a visita sem veículo, ou atualize a página.
- Horário recusado: domingo ou fora das 9h às 18h. Escolha outro. A tela diz o motivo.
- Visita de hoje com hora que já passou aparece como "Já passou": é o normal, não é erro.

---

## 7. Bônus. Ajustes (20 segundos)

**Tela:** `Ajustes`, pelo link "Ajustes do WhatsApp" dentro de Conversas (não está na barra).

Mostre o controle **Atendimento da Dayse no WhatsApp**: "Dayse responde sozinha", "Atendimento por menu", "Dayse desligada".

**Diga:** "Se eu viajar, ou ela começar a responder errado, eu paro a Dayse aqui com um toque."

**Não mude o modo durante a demonstração.** Só mostre. Se tocar sem querer, a tela pede confirmação; use **Manter como está**.

---

## 8. Se algo falhar ao vivo

Regra geral: **o painel agora explica a falha em português. Leia a mensagem em voz alta, calmamente, e siga para o próximo passo.** Não tente consertar na frente do cliente.

- **Mensagem de erro na tela (qualquer uma):** leia, atualize a página uma vez, e se persistir diga "essa parte eu confirmo depois" e vá ao passo seguinte.
- **Página não abre, tela branca:** volte pela barra de baixo para outra seção. Se nada abrir, é rede; troque para dados móveis.
- **Saiu do painel (pediu login):** entre de novo; a sessão expira.
- **Salvar não funciona (veículo ou visita):** o painel mostra o motivo no formulário. Leia, corrija o campo indicado, e toque de novo. Não repita o toque várias vezes.
- **Arte não envia:** toque em **Baixar** e diga que manda pela galeria.
- **Dayse não responde:** número de teste (seção 0.2). Mostre a conversa que já existe.
- **Agenda com aviso:** banco sem a tabela (seção 0.1).
- **Perdeu-se no meio:** toque em **Estoque**, o primeiro botão da barra. Recomece dali.

O que **não** dizer: que a agenda se preenche sozinha, que a Dayse já marca visita, que a resposta do vendedor chega ao cliente pelo painel. Nada disso existe ainda.

---

## 9. Depois da demonstração

Anote o que travou e em que passo. Isso vale mais do que qualquer ajuste do roteiro.
