# Apresentação do painel ao Liberato

Roteiro para o desenvolvedor, para ler no celular ou impresso.

**Aviso de honestidade, leia primeiro.** Nada do painel foi executado contra os serviços reais: nem Neon, nem Cloudflare R2, nem Google OAuth, nem um aparelho. Não havia credenciais na sessão em que ele foi construído. Os 94 testes, o typecheck, o lint e o build passam, mas eles não provam que o login, o banco e as fotos funcionam na produção. A Parte 1 existe para descobrir isso HOJE, não na frente dele.

As três correções que a revisão final pediu **já estão no código** (commit `54ceb56`): botão "Recarregar a página" junto do aviso de anúncio alterado, botões de situação que desabilitam durante o envio, e foto que falha ao carregar deixa de derrubar a tela. Também baixou o limite da foto no celular para 3,5 MB. Nenhuma delas foi testada num aparelho.

---

## 1. Checklist de preparação (antes de encontrar o Liberato)

Faça na ordem. Se um passo falhar, resolva antes do próximo: os últimos dependem dos primeiros.

### Passo 1. Migrações aplicadas na branch de desenvolvimento

O primeiro login grava nas tabelas `user`, `account` e `session`. Sem as migrações `drizzle/0000` a `0004`, o login falha com erro de banco e a tela não explica.

- Antes de rodar `npm run db:migrate`, **confira `DATABASE_URL_DIRECT`**. Esse comando não tem trava de branch. Se a URL apontar para `production`, ele altera a produção.
- Só rode se tiver certeza de que a URL é da branch `development`.
- Se as migrações já estiverem aplicadas, o passo 3 (`db:check`) mostra isso.

### Passo 2. Variáveis na Vercel

| Variável | Valor esperado | Se estiver errada |
|---|---|---|
| `AUTH_TRUST_HOST` | exatamente `true`, minúsculo | O login recusa o domínio. Tela: "Não foi possível entrar." |
| `AUTH_URL` | o domínio de **produção**, não o de preview | O Google devolve o Liberato para o lugar errado |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | preenchidas | Tela de login mostra "O acesso ainda está em preparação." |
| `ADMIN_GOOGLE_EMAIL` | o e-mail Google do Liberato | Só a conta certa entra |
| `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | preenchidas | Ver passos 3 e 4 |

Depois de mudar variável na Vercel, é preciso **fazer novo deploy**. A mudança não vale para o deploy antigo.

Dica: se o painel mostrar "O acesso ainda está em preparação.", o servidor não achou as variáveis `AUTH_*`. É sinal de que o deploy não as recebeu.

### Passo 3. Banco

```
npm run db:check
```

O que olhar na saída:

| Resultado | Significado | O que fazer |
|---|---|---|
| Conecta e `sameBranchId` verdadeiro | Banco ok e é a branch certa | Siga |
| `branchIdAvailable` falso | O pooler do Neon não informa a branch. A importação (passo 5) vai recusar por segurança | Não force. Veja "Se a importação recusar", no passo 5 |
| Erro de autenticação | URL ou senha errada | Copie de novo a string da branch `development` no Neon |
| Erro de rede ou tempo esgotado | Internet ou Neon fora | Tente de novo; se persistir, olhe o painel do Neon |

### Passo 4. Fotos (Cloudflare R2)

```
npx tsx scripts/check-r2-connection.ts
```

O script grava um arquivo de teste, assina uma URL e apaga. Não imprime segredo.

| Resultado | Significado | O que fazer |
|---|---|---|
| Passa nos três movimentos | Fotos devem funcionar | Siga |
| Pede para configurar `R2_*` | Falta variável no ambiente local | Preencha as quatro |
| Falha de autenticação | Chave ou segredo errado | Gere outro token no R2 com permissão de leitura e escrita no bucket |
| Falha de bucket | Bucket não existe ou nome errado | Confira `R2_BUCKET` e crie o bucket, privado |
| Falha de rede | Sem internet | Repita |
| Apagar falhou | A chave de teste ficou no bucket | O script avisa; apague à mão depois |

Este passo importa porque o upload de foto é a parte mais visual da demonstração. **Esta checagem usa as variáveis do seu computador. A Vercel tem as dela:** confirme no passo 2 que são as mesmas.

### Passo 5. Importar o catálogo

Isso enche o estoque que ele vai ver.

```
npx tsx scripts/import-legacy.ts --execute-development br-quiet-tooth-b83ew3t8
```

| Resultado | Significado | O que fazer |
|---|---|---|
| Importou os veículos | Estoque pronto | Siga |
| "Branch Neon divergente" | O script não conseguiu confirmar a branch e abortou **sem escrever**. É a trava de segurança funcionando | Rode o passo 3. Se `branchIdAvailable` for falso, é o pooler. Use a URL direta (sem `-pooler`) só para este comando, **depois de conferir que é a branch `development`** |
| Erro de autenticação | URL do banco errada | Corrija no `.env` |
| Mensagem genérica de erro | O script esconde a causa | Rode `npm run db:check` para separar "banco fora" de "outro problema" |

Rodar duas vezes **não** duplica veículos: o script identifica cada um pela referência de origem e
pula os que já existem, devolvendo `created: 0` e `skipped` igual ao total. Isso está no código e foi
revisado, mas nunca foi executado contra o banco real — se precisar repetir, repita sem medo e confira
o número que ele imprime.

### Passo 6. Dar acesso ao Liberato

```
npm run auth:grant-development -- --execute-development br-quiet-tooth-b83ew3t8
```

| Resultado | Significado | O que fazer |
|---|---|---|
| Acesso concedido | Administrador criado | Siga |
| Recusa por branch | Trava de segurança | Mesmo tratamento do passo 5 |
| Depois, no login: "Esta conta ainda não tem acesso ao painel." | O e-mail entrou no Google, mas não há concessão | Rode este passo de novo e confira `ADMIN_GOOGLE_EMAIL` |

### Passo 7. Google OAuth

No Google Cloud, no cliente OAuth:

1. O redirect autorizado precisa ser **exatamente** `https://<domínio-de-produção>/api/auth/callback/google`. Uma letra diferente e quebra.
2. Se o domínio mudar depois, cadastre de novo.
3. Veja o estado da tela de consentimento. Se estiver em "Testing", só contas listadas como usuário de teste entram. **Adicione o e-mail do Liberato.** Se não estiver verificada, o celular dele mostra o aviso "app não verificado". Isso não é erro do painel. Veja a seção 4 para saber o que dizer.

### Passo 8. Ensaio completo no celular dele (ou no seu, em 4G)

Faça o percurso da Parte 2 inteiro, **em dados móveis e não em Wi-Fi**, na URL de produção. Idealmente no celular do Liberato, porque é lá que aparece o aviso do Google, não no seu.

- Anote cada tropeço.
- Quando terminar, **arquive o veículo de ensaio** (botão "Arquivar"). Não apague: o histórico é guardado de propósito. Assim a apresentação não começa com lixo.
- Grave o vídeo do plano B (Parte 5).

### Nunca testado, e por isso o risco maior

Estas coisas só serão vistas no ensaio. Se algo estranho aparecer, é aqui que se procura:

1. Login com Google (passos 2 e 7).
2. Primeira gravação no banco pelo painel.
3. Primeiro upload de foto.
4. Velocidade no 4G da loja. Se a função da Vercel estiver longe do banco (que sugere São Paulo), cada tela pode demorar. A região da função é configuração da Vercel, não código. Não foi verificado em que região está.
5. Foto de retrato aparecer deitada em alguns celulares (rotação da foto). Não foi verificado em aparelho.

---

## 2. O percurso da demonstração

Fale devagar. Entregue o celular na mão dele sempre que possível. Quem usa, aprende.

| # | O que mostrar | O que dizer |
|---|---|---|
| 1 | Abrir o endereço do painel no celular dele | "Isso aqui é seu. Fica no navegador, não precisa instalar nada." |
| 2 | Tocar em **Entrar com Google**, escolher a conta dele | "Entra com a sua conta do Google. Não tem senha nova para decorar. Só a sua conta entra." |
| 3 | A tela do estoque, com as capas | "Esse é o seu estoque. Cada veículo com foto, preço e a situação: rascunho, publicado, reservado, vendido." |
| 4 | Tocar em **Cadastrar veículo**, depois em **Moto** | "Para cadastrar, são dois toques. Só escolho se é moto ou carro. O resto eu completo depois." |
| 5 | Preencher marca e modelo; **Salvar dados** | "Marca e modelo. Dá para fazer em pé, na loja, com uma mão." |
| 6 | **Tirar ou escolher foto**, tirar a foto da moto | "Aponto a câmera e tiro a foto aqui mesmo. O painel já ajusta o tamanho, então não pesa no seu plano de dados." |
| 7 | Digitar o preço; **Salvar preço** | "Coloco o preço. Se eu esquecer o preço ou a foto, ele não deixa publicar." |
| 8 | Tocar em **Publicar**, depois em **Sim, publicar** | "Antes de publicar ele pergunta se a moto está mesmo disponível. Para ninguém publicar por engano." |
| 9 | Tocar em **Reservar** | "Chegou um cliente e deixou sinal? Marco como reservada." |
| 10 | Tocar em **Marcar vendido** | "Vendeu. Um toque. A moto sai da disponível e fica registrada como vendida." |
| 11 | Voltar ao estoque e mostrar a moto com a etiqueta nova | "Está tudo no mesmo lugar, e eu vejo a situação de cada uma." |
| 12 | Tocar em **Sair do painel** | "Quando termina, sai. Ninguém mexe no seu estoque sem a sua conta." |

Antes do passo 9, **espere a tela atualizar** e só então toque. Os botões desabilitam enquanto enviam, mas não precisa testar isso na frente dele.

Ao final, arquive a moto da demonstração para não deixar lixo no estoque.

---

## 3. As duas limitações a declarar de frente

Diga logo depois do passo 1 ou 2, antes de ele perguntar. Não deixe para o fim.

### (a) O site público ainda não muda

> "Uma coisa importante antes de continuarmos: o site que seus clientes veem ainda lê o catálogo antigo. Então, se eu publicar ou marcar vendido aqui, o site ainda não muda. Ligar o painel ao site é a próxima fase, e eu deixei para depois de propósito, para não mexer no seu site no dia anterior da apresentação."

### (b) Os dados são de teste

> "O estoque que você está vendo está num ambiente de desenvolvimento, não no sistema definitivo. Serve para você testar e me dizer o que mudar. O que você mexer aqui ainda não é o seu estoque oficial."

### Por que declarar logo é melhor

1. Se ele descobrir sozinho que a vitrine não mudou, a conclusão dele é "está quebrado". Se você disse antes, a conclusão é "é a próxima etapa".
2. Quem declara a limitação passa confiança. Quem é pego nela passa dúvida sobre todo o resto.
3. Ele passa a olhar o painel como o que ele é: a parte de dentro. Isso evita a pergunta mais perigosa da reunião, no pior momento.
4. Dá a você o controle da conversa sobre o que vem depois.

---

## 4. Se algo falhar na hora

Regra geral: **não improvise com o dado dele na tela**. Se travar, mude para o vídeo (Parte 5) e diga o que está acontecendo.

| Sintoma na tela | Causa provável | O que dizer e fazer |
|---|---|---|
| Aviso do Google "app não verificado" ao entrar | Cliente OAuth em modo teste ou sem verificação. Não é erro do painel | "Esse aviso é do Google e aparece porque o app ainda é de testes. Eu toco em Avançado e continuo." Depois, resolva com o Google |
| Google mostra "Acesso bloqueado" ou "redirect_uri_mismatch" | Redirect cadastrado errado, ou e-mail dele fora da lista de testadores | Troque para o vídeo. "Vou te mostrar gravado, depois resolvo o acesso." Corrija depois |
| "Não foi possível entrar. Confira a conta Google e tente novamente." | `AUTH_TRUST_HOST` ou `AUTH_URL` errados; conta diferente da autorizada; migração faltando | Confira se ele escolheu a conta certa. Se sim, vídeo. Não dá para resolver ao vivo |
| "O acesso ainda está em preparação." | Deploy sem variáveis `AUTH_*` | Vídeo. Corrija e faça novo deploy depois |
| "Esta conta ainda não tem acesso ao painel." | A conta entrou, mas o passo 6 não foi feito, ou foi feito com outro e-mail | Se estiver com o computador, rode o passo 6. Caso contrário, vídeo |
| Fotos aparecem como "Sem foto" na lista | O R2 falhou ao assinar a URL. A lista está desenhada para continuar de pé | "As fotos estão carregando devagar, deixa eu seguir." Siga com o resto. O texto e o preço continuam funcionando |
| Foto não sobe, ou mensagem de erro ao enviar | Credenciais ou bucket R2 errados na Vercel; foto grande demais; rede lenta | Tente uma segunda foto. Se falhar de novo: "O envio de fotos eu mostro gravado" e use o vídeo. Prossiga com preço e publicação |
| "Não foi possível preparar esta foto. Tente outra." | O arquivo não é uma imagem que o celular consegue ler | Tire a foto de novo |
| Tela de edição abre com erro | Falha do banco ou do R2 | Volte ao estoque e abra de novo. Se repetir, vídeo |
| "Este anúncio foi alterado. Recarregue antes de salvar." | Dois toques seguidos, ou a tela estava desatualizada | Toque em **Recarregar a página** (botão ao lado da mensagem). "Ele me avisa quando alguém mexeu ao mesmo tempo, para eu não apagar o trabalho de outro." |
| "Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto." ao publicar | Falta algum dado | **Não é erro, é o painel funcionando.** "Está vendo? Ele não deixa publicar incompleto." Complete e tente de novo |
| Tela lenta, botão demora vários segundos | 4G fraco, ou função longe do banco | Espere. Os botões ficam desabilitados enquanto enviam. "Estamos no 4G, às vezes demora um pouco" |
| Rede da loja caiu, nada abre | Internet | Mude para o vídeo na hora. Se tiver dados móveis no seu celular, ligue o roteador (hotspot) e tente |

Sobre os logs da Vercel: se você abrir os logs, vai ver "erros" a cada visita sem login ao painel. É ruído esperado, não vaza nada. Não se assuste.

---

## 5. Plano B: o vídeo

**Grave antes**, em passo 8 do checklist, no próprio celular, na URL de produção.

### Por que

- Nada disso foi testado em campo. A loja pode ter rede ruim, o Google pode pedir verificação, o R2 pode falhar. Qualquer uma das três interrompe a demonstração.
- Com o vídeo, o pior caso deixa de ser "não deu para mostrar" e vira "mostro gravado e resolvo depois".
- Ele também prova que o percurso inteiro funcionou ao menos uma vez.

### O que precisa aparecer

1. Tela de login e o toque em **Entrar com Google**, sem mostrar senha.
2. O estoque com as capas.
3. **Cadastrar veículo**, **Moto**.
4. Marca e modelo preenchidos e salvos.
5. A câmera e a foto aparecendo na galeria. Este é o trecho mais importante.
6. O preço salvo.
7. **Publicar**, **Sim, publicar**, e a etiqueta "Publicado".
8. **Reservar**, etiqueta "Reservado".
9. **Marcar vendido**, etiqueta "Vendido".
10. O estoque com a etiqueta nova, e **Sair do painel**.

Dicas:

- Grave com a tela do celular, em 4G, para o vídeo mostrar o tempo real.
- Mostre a barra do navegador com o endereço, para provar que é o sistema de verdade.
- Deixe o vídeo no próprio celular que vai usar, não só no computador. Abra-o antes e confira que toca sem internet.
- Cuidado para não aparecer e-mail ou dado pessoal que você não queira mostrar.

---

## 6. Limitações conhecidas (se ele perguntar)

Nenhuma atrapalha a demonstração. Estão escritas em linguagem de quem usa.

| Se ele notar ou perguntar | A resposta honesta |
|---|---|
| "Marquei vendido e o site continua mostrando." | É a limitação (a) da Parte 3. Próxima fase |
| "Posso mudar a ordem das fotos?" | Não há botão para isso. A primeira foto vira a capa. Também, ao remover uma foto do meio, a ordem das seguintes pode ficar confusa. Não foi corrigido |
| "Se eu apagar a marca de uma moto já publicada?" | O sistema recusa, mas a mensagem que aparece é genérica ("tente de novo"), não explica o motivo |
| "Fiquei muito tempo parado e a tela não salva." | Se o login expirar com a tela aberta (a sessão dura 12 horas), aparece uma mensagem genérica em vez de "entre de novo". Saia e entre outra vez |
| "A foto saiu deitada." | Em alguns celulares a foto de retrato pode aparecer girada. Não foi verificado em aparelho |
| "Está escrito Preço 0 / Sem preço." | Veículo sem preço mostra "Sem preço". Se alguém digitar zero, também. Os veículos importados já têm preço |
| "Por que o botão diz Publicar numa moto reservada?" | O mesmo botão serve para voltar a publicar. O texto pode ficar ambíguo. É só rótulo |
| "Posso colocar ano 2.024?" | Aceita e entende como 2024 |
| "Os dois botões Moto e Carro mudam juntos para Criando..." | Cosmético. Só aparece um instante |
| "Escolher uma foto da galeria?" | O botão pede a câmera traseira direto, então pode não oferecer a galeria. Não foi verificado em aparelho |
| "Posso ter mais de um administrador?" | Só uma conta, a dele, está autorizada hoje |
| "Dá para ver o histórico de quem mexeu?" | O histórico é guardado, mas **não há tela** para vê-lo ainda |

Dívida técnica que o Liberato não vê, mas você deve saber: os testes cobrem poucas das mensagens de erro, e não há teste que garanta que as telas montam. O que mais vale corrigir primeiro depois da apresentação é um teste que pegue nome de estilo inexistente: foi assim que um defeito real passou no build durante o desenvolvimento.

---

## Folha de bolso

1. Hoje: passos 1 a 8 do checklist, na ordem.
2. Vídeo gravado e testado sem internet.
3. Veículo de ensaio arquivado.
4. Chegando lá: declare as duas limitações no começo.
5. Se algo travar: diga o que é, não improvise, mude para o vídeo.
6. Depois: o que ele pedir anote. A próxima fase liga o painel ao site.
