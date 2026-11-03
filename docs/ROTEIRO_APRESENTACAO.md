# Roteiro de apresentação do painel

Para seguir no celular, de pé, na frente do Elton. Nada aqui exige decisão na hora: se algo sair do roteiro, vá para a seção "Se algo falhar".

Escrito em 2 de novembro de 2026; atualizado em 3 de novembro de 2026 para a segunda etapa. Este roteiro descreve o código após implantação e migração. O painel não aparece em buscadores de propósito (o site espera o domínio próprio); isso não é defeito e não precisa ser explicado.

---

## 0. Antes de tudo: duas condições que travam a demonstração

### 0.1 A agenda precisa do banco certo

**Antes da demonstração, confirme a aplicação das migrações `0010` (Agenda) e `0011` (contato da conversa) no banco do ambiente usado.** O código desta etapa não aplica migração em produção por conta própria.

- Sem `0010`, a aba Agenda mostra apenas "Não foi possível carregar a agenda agora". Sem `0011`, os novos dados de contato dependem da criação idempotente das colunas no servidor e a migração formal continua pendente.
- Confirme com o desenvolvedor, no dia anterior, que a atualização foi aplicada. Depois disso, abra a Agenda uma vez para ter certeza.
- Se a demonstração for num banco de desenvolvimento que já tem a Agenda, nada a fazer.

(Detalhe técnico para o desenvolvedor, no apêndice no fim.)

### 0.2 O WhatsApp conectado é o número de teste da Meta

O número é o de teste (`liberato-motos-car-teste`, `+1 555-195-6955`). Número de teste só troca mensagem com uma **lista curta de destinatários verificados**. A Dayse **não responde** a telefone que não esteja nessa lista.

- Para mostrar o atendimento ao vivo: ou você coloca o telefone de quem vai mandar a mensagem na lista, no painel da Meta, **antes**; ou faz a demonstração com o seu próprio telefone, que já esteja autorizado.
- Nenhum cliente real alcança a Dayse hoje. Isso não é defeito do painel; é o número.
- Sem uma das duas coisas resolvidas, **não prometa atendimento ao vivo**. Mostre a conversa que já está em Conversas (passo 3, seção 5 deste roteiro).

### 0.3 O que confirmar antes de mostrar

- **A agenda aceita visitas manuais e visitas anotadas pela Dayse.** Para demonstrar o preenchimento automático, faça uma conversa de teste com dia e hora válidos depois da implantação. Sem conversa nova, mostre a criação manual.
- **A resposta do vendedor pelo painel depende do contato registrado e da janela de 24 horas da Meta.** Conversas antigas ou fora da janela mostram a explicação e o caminho para responder pelo celular da loja. Faça um envio de teste antes de demonstrar com cliente real.

Frase segura: "A visita pode ser marcada aqui ou combinada pela Dayse no WhatsApp; só confirmamos o horário depois de conferir o expediente."

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
10. **Há uma conversa em Conversas.** Abra Conversas e confirme que existe pelo menos uma conversa na lista. Se estiver vazia, o plano B do passo 3 não tem o que mostrar; nesse caso mande uma mensagem do seu telefone liberado antes de apresentar.
11. **Bateria e rede.** Carregador à mão, dados móveis como reserva do Wi-Fi.

---

## 2. A ordem e por que

Estoque, depois Divulgar, depois Conversas, depois Agenda. O Ajustes é um bônus de 20 segundos no fim.

- Começa pelo **veículo** porque tudo nasce nele; o preço digitado uma vez vale para a arte e para a Dayse.
- A **arte** vem em segundo porque é o que o Elton já conhece de artes para divulgação. Aqui o preço e o nome vêm do cadastro, você não digita.
- **Conversas** em terceiro, pois é o argumento mais forte: a atendente responde o cliente à noite e o vendedor vê o que o cliente pediu. Não compare com outro programa; mostre o que o nosso faz e deixe o Elton comparar.
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

**Diga:** "O preço e o nome vêm do cadastro. Aqui o preço não é digitado de novo: é o mesmo dado do estoque, então a arte não sai com preço diferente do anúncio."

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

**Diga:** "Às dez da noite de domingo, com a loja fechada, a Dayse responde sobre o estoque, o preço e o endereço. Quando o cliente fala de financiamento ou de troca, ela chama um vendedor de propósito, sem prometer aprovação. Esse cliente aparece aqui, aguardando, e o senhor vê tudo o que foi dito."

**Antes de usar a caixa de resposta:** confirme com um número de teste que a Meta entrega a mensagem. O painel só mostra sucesso após a confirmação de envio. Se a caixa não aparecer, siga a explicação da tela e responda pelo celular da loja.

**O que costuma dar errado:**
- A Dayse não responde: quase certamente o telefone não está na lista da Meta. Não insista. Diga "o número de teste só fala com telefones liberados" e mostre a conversa existente.
- A tela mostra "Não foi possível carregar": leia em voz alta e tente atualizar uma vez.
- A lista parece vazia: conversa sem mensagem não aparece de propósito.

---

## 6. Passo 4. Agenda (cerca de 3 minutos)

**Tela:** `Agenda`. O selo mostra as visitas de hoje.

1. Toque em **Agenda**.
2. Se estiver vazia, a tela diz "Nenhuma visita marcada. Marque a primeira abaixo." e já abre o formulário. Se tiver visitas, toque em **Marcar visita**.
3. Preencha **Nome do cliente**, **Telefone com DDD**, **Dia**, **Hora** (segunda a sábado; a última visita começa antes das 18h, ou seja, até 17h59) e **Veículo**.
4. Toque em **Marcar visita**.
5. A visita aparece em "Hoje", "Amanhã" ou "Esta semana". Mostre o cartão: nome, hora, veículo, o botão **WhatsApp** e **Ver conversa**.
6. Toque em **Corrigir** para mostrar que dá para mudar dia e hora, e em **Cancelar visita** para mostrar que há confirmação (**Manter visita** desfaz).

**Diga:** "O vendedor pode marcar a visita aqui. Quando o cliente combina dia e hora com a Dayse, a agenda recebe o compromisso e mostra a conversa junto dele."

**O que costuma dar errado:**
- "Não foi possível carregar a agenda agora": a tabela não existe nesse banco (seção 0.1). Leia a mensagem em voz alta, diga "essa parte eu te mostro depois" e vá para o Ajustes.
- O veículo não aparece para escolher, com a frase de que a lista do estoque não carregou: marque a visita sem veículo, ou atualize a página.
- Horário recusado: domingo, antes das 9h ou a partir das 18h. Escolha outro. A tela diz o motivo.
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
- **Agenda com aviso:** a atualização do banco da Agenda não foi aplicada (seção 0.1). Diga "essa parte eu te mostro depois".
- **Perdeu-se no meio:** toque em **Estoque**, o primeiro botão da barra. Recomece dali.

O que **não** dizer antes de testar no ambiente implantado: que a Dayse marcou uma visita ou que uma resposta chegou ao cliente. Confirme cada fluxo pelo WhatsApp e pela Agenda.

---

## 9. Depois da demonstração

Anote o que travou e em que passo. Isso vale mais do que qualquer ajuste do roteiro.

---

## Apêndice técnico (para o desenvolvedor, não para a apresentação)

- A tabela é `visit_appointments`, criada pela migração `drizzle/0010_majestic_newton_destine.sql`. Em 2 de novembro de 2026 o registro de migrações da produção tinha 9 entradas, a mais nova de 27/10/2026, e a tabela não existia.
- A migração `drizzle/0011_whole_stepford_cuckoos.sql` acrescenta nome, telefone e tenant à conversa. `ensure-schema.ts` também cria essas colunas de forma idempotente quando o atendimento é iniciado.
- `0010` é o único caminho que cria a tabela da agenda; o criador automático de tabelas do atendimento (`ensure-schema.ts`) deixou de criá-la. Abrir a Agenda antes de `0010` apenas mostra o aviso.
- Aplicar as migrações em produção exige autorização do proprietário.
