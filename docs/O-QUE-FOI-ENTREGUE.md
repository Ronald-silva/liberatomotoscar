# O que foi entregue, e quanto isso vale

_Escrito em 16/11/2026, para o dono da plataforma. Linguagem direta, sem jargão.
Para o estado operacional do dia a dia, veja [`ESTADO.md`](ESTADO.md)._

---

## 1. O problema, em uma frase

Antes deste trabalho, **um cliente podia escrever no WhatsApp da loja e simplesmente não receber
nada** — nem resposta da Dayse, nem um vendedor avisado. E ninguém ficava sabendo.

Isso não era um defeito isolado. Eram **seis caminhos diferentes** que terminavam no mesmo lugar:
silêncio. O cliente ficava esperando, achava que a loja não quis atender, e ia comprar em outro
lugar. A loja nunca descobria que tinha perdido a venda.

Esse é o problema que as cinco fases resolveram.

---

## 2. A regra que governa tudo agora

> **Nenhum limite e nenhuma falha deixa o cliente sem resposta e sem vendedor.**

Toda vez que algo dá errado, acontecem três coisas, sempre:

1. O cliente recebe **uma frase** dizendo que um vendedor vai continuar com ele.
2. A conversa entra na **fila do vendedor**, no painel.
3. A falha é **contada, gravada e sinalizada** — não morre num log que ninguém lê.

O silêncio sobrou só para três casos em que ele é correto: a loja desligou a Dayse, outra execução
já está respondendo aquela mensagem, ou um vendedor assumiu a conversa no meio. Nesses três,
ninguém está esperando resposta automática.

---

## 3. O que mudou, caso a caso

| Situação real | Antes | Agora |
|---|---|---|
| A loja gastou a cota diária de IA | silêncio | frase + vendedor avisado |
| **Um só cliente** gastou a cota do dia inteiro | todos os outros ficavam sem resposta | teto por conversa: 40 por dia, depois vai ao vendedor |
| O banco de dados falhou | silêncio | frase + vendedor avisado |
| O código quebrou no meio do atendimento | silêncio **permanente** naquela conversa | frase + vendedor avisado |
| A Meta recusou o envio (token vencido) | a Dayse era desligada para aquele cliente **e continuava muda depois do token renovado** | pedido de atendimento humano, automação preservada |
| A loja estava no modo "menu" antigo | gastava IA ou ficava muda | frase explícita + vendedor avisado |

### O caso mais sério: o silêncio permanente

Esse merece explicação, porque era o pior e o menos visível.

Quando o código quebrava depois de gravar a mensagem do cliente, o sistema devolvia erro para a
Meta. A Meta reentregava a mensagem — comportamento normal e desejável. Só que o sistema via "essa
mensagem eu já gravei" e **descartava a reentrega**. Resultado: o cliente nunca mais recebia nada
naquela conversa, e nenhuma tentativa futura resolvia.

Agora existe uma regra clara: **só um tipo de erro derruba o atendimento** — a falha em gravar a
mensagem que acabou de chegar. Nesse caso nada foi gravado, então a reentrega da Meta é exatamente
a recuperação correta. Todos os outros erros são tratados ali mesmo, com resposta ao cliente.

---

## 4. O que a loja passou a enxergar

Antes, uma falha de atendimento existia só como texto num log de servidor — algo que ninguém abre e
que o provedor apaga depois de alguns dias.

Agora cada incidente vira **uma linha numa tabela do banco**, e existe uma tela: **`/admin/metricas`**.

Ela mostra:

- Quantas conversas houve, e quantas foram para um vendedor
- **Quanto tempo o cliente esperou pela primeira resposta**
- Quanto de IA foi consumido
- **Os incidentes agrupados por motivo** — para saber se o problema é cota, infraestrutura ou envio
- **Quais conversas ninguém garantiu que chegaram ao vendedor**, com data e identificador, para
  poder abrir cada uma

Esse último item é o que transforma "acho que está funcionando" em um número que você confere.

Uma correção importante de medição veio junto: "visita agendada" contava **intenção anotada pela
Dayse** como se fosse visita marcada. Eram duas coisas diferentes com o mesmo nome — e a métrica
mais importante do negócio (gente que realmente vai à loja) estava inflada. Agora são duas métricas
com dois nomes.

---

## 5. O aviso que chega no celular

Gravar na tela resolve para quem abre a tela. Não resolve para o caso urgente: **o cliente está
esperando agora**.

Por isso existe um segundo caminho, que não depende do banco de dados — justamente porque boa parte
dessas falhas *é* o banco de dados. Quando um cliente fica sem resposta e sem vendedor avisado, sai
um alerta para um canal no Discord, no celular do operador da plataforma.

O alerta carrega só o identificador da conversa. **Telefone, nome e texto do cliente nunca saem.**

Importante: esse alerta é o **pager do operador da plataforma — você**, não um canal da loja. Os
eventos que o disparam (token recusado, banco sem confirmar, código quebrado) são coisas que só
você conserta. A loja age pelo painel.

---

## 6. A retenção de dados, que existia e nunca rodava

Havia código pronto para apagar conversa vencida e foto órfã. **Ninguém chamava esse código.** Era
uma rotina que existia no repositório e nunca no mundo.

Agora existe um serviço próprio no Railway que a aciona todo dia às 03:17. Já rodou de verdade, com
resultado conferido: 0 conversas apagadas (a única existente vence em abril de 2027), 0 arquivos,
**0 falhas**.

Isso importa por dois motivos: **custo** (foto órfã no armazenamento é conta que cresce) e
**responsabilidade sobre dado de cliente** (conversa de WhatsApp guardada para sempre, sem prazo, é
risco que não se justifica).

---

## 7. A resposta do vendedor, que travava o banco

Quando o vendedor respondia pelo painel, o sistema **segurava uma trava no banco de dados durante a
chamada à Meta** — até 12 segundos. Numa Meta lenta, cada resposta de vendedor virava fila para o
sistema inteiro.

Agora o envio acontece fora da transação. E o caso difícil — a Meta aceita a mensagem, mas a
gravação falha — não é escondido: o vendedor vê exatamente *"A Meta aceitou a mensagem, mas o painel
não confirmou o registro. Confira no celular antes de tentar novamente."* Dizer a verdade
desconfortável é melhor do que um "enviado" que pode ser mentira.

---

## 8. A jornada no celular

A loja cadastra veículo **pelo celular, no pátio**, não sentada num computador. A quinta fase
atacou isso, com medições antes e depois na mesma tela de 390×844:

| O quê | Antes | Depois |
|---|---|---|
| Prévia da arte visível ao escolher a foto | **0 px** (fora da tela) | **338 px** (sempre visível) |
| Controles na tela de edição | 46 | **37** |
| Fichas de toque para marca e cor | 25 | **16** |
| Busca no estoque | não existia | campo próprio, no servidor |

A prévia é o caso exemplar: a pessoa ajustava o enquadramento da arte **sem ver o resultado**,
porque a prévia ficava fora da tela no celular. Decidia no escuro.

Veio junto uma correção pequena e valiosa: o estoque ordenava pela última alteração, e o editor
salva sozinho a cada pausa na digitação. Abrir um veículo o jogava para o topo e embaralhava todos
os outros. Agora a ordem é estável.

---

## 9. O que foi reforçado em segurança

- **Excluir conversa** era barrado só na tela. Uma requisição montada à mão apagava o histórico. A
  trava agora está **no servidor**, e exige repetir *qual* conversa está sendo apagada — um
  "confirmar: sim" fixo viajaria em toda requisição e seria decorativo.
- **Cota e limite falham fechado.** Se o banco falha, a IA é **bloqueada** em vez de liberada. O
  teto de custo não some quando o controle quebra.
- A rota que apaga dados é protegida por segredo, com comparação em tempo constante, e **recusa
  funcionar** se o segredo não estiver configurado — em vez de ficar aberta.

---

## 10. Como isso foi verificado

| Verificação | Resultado |
|---|---|
| Testes automatizados | **1102 passaram** |
| Tipos, lint, build | todos sem erro |
| Testes contra PostgreSQL real | 39 passaram |
| Revisão independente do código | sem bloqueador; 2 pontos menores na fila |
| Retenção em produção | executada, **0 falhas** |
| Alerta no Discord | mensagem de teste entregue |

Tamanho do trabalho: **109 arquivos**, cerca de 7.600 linhas acrescentadas, em 39 commits.

---

## 11. O que ainda NÃO está provado

Esta seção existe porque um documento que só lista conquistas não serve para decidir nada.

- **O WhatsApp da loja nunca foi conectado.** Conferido no banco de produção em 16/11: só existe o
  **número de teste da Meta**. Não é defeito — é o passo do botão "Conectar com WhatsApp", em
  `/admin/ajustes`, que nunca foi dado. É isto, e não um problema técnico, que explica por que
  nenhuma mensagem real jamais passou por este código.
- **Nenhuma mensagem real passou por este código.** Toda a confiabilidade descrita aqui está provada
  por teste automatizado, não por cliente. O ensaio de ponta a ponta no número de teste ainda não
  foi feito, e o token desse número **está expirado** (conferido em 16/11).
- **A `WHATSAPP_WABA_ID` não existe no servidor**, então uma conferência de segurança do canal passa
  batido (fica registrada como vacuosa no log). Ela só fará sentido depois que o número real
  estiver conectado — o ID que aparece hoje no painel é o do número de teste.
- A conferência do estúdio de artes **em aparelho real** (Android/iPhone) não foi feita; as medições
  são de emulação.
- Pixel e Google Analytics não têm destino configurado.
- O chat do site não tem instrumentação de falha — só o canal WhatsApp tem.

Provado em 16/11, e que saiu desta lista: o **login com Google** funciona de ponta a ponta no
endereço novo, e o **aviso no Discord** está configurado nos dois endereços que servem o app.

---

## 12. Antes de apresentar à loja

A descoberta de 16/11 simplificou isto. Conectar o WhatsApp da loja **depende do Liberato** — a
autorização é pelo Facebook da loja, pela própria exigência da Meta. Então a apresentação não vem
*depois* de conectar: ela é o que **permite** conectar.

O que fazer antes:

1. **Renovar o token do número de teste** (WhatsApp → API Setup no painel da Meta). O temporário
   dura ~24 h; para a apresentação, vale gerar o de usuário do sistema, que não expira.
2. **Fazer o ensaio** no número de teste: mensagem → resposta da Dayse → passagem ao vendedor →
   resposta do vendedor. Critério: nenhuma falha operacional, nenhum caso sem resposta e sem
   vendedor, e o alerta chegando.
3. **Conferir o estúdio de artes num celular de verdade**, já que a demonstração será num.

Na apresentação, com o Liberato presente: **"Conectar com WhatsApp"** em `/admin/ajustes`, ele entra
com o Facebook da loja, e o número real passa a atender.

A parte de **painel, vitrine, cadastro, estoque, estúdio de artes e métricas** já pode ser mostrada
hoje — está publicada e funcionando.
