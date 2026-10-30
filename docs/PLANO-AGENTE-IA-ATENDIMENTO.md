# Plano — Agente de IA de atendimento para concessionária

**Para quem lê isto:** você é uma sessão de IA (ou um desenvolvedor) que vai executar uma ou
mais tarefas deste plano. Este documento é autocontido: não depende de nenhuma conversa
anterior. Leia a Parte 1 antes de tocar em código.

**Repositório:** `liberatomotoscar` — Next.js 16, React 19, Drizzle + Neon, Vercel AI SDK 7,
OpenRouter. Hospedado no Railway.

---

## Parte 1 — Contexto obrigatório

### 1.1 Estado atual

O projeto **não tem agente de IA**. Havia um ("Dayse") e ele foi removido no commit
`36444eb`. O que existe hoje:

| Existe e funciona | Observação |
|---|---|
| Site público + vitrine de veículos | `src/app/page.tsx`, `src/app/veiculos/[slug]` |
| Painel admin: cadastro de veículos, fotos | `src/app/admin/(protected)/veiculos` |
| Estúdio de artes | `src/components/art-studio` |
| Caixa de entrada de conversas | `src/app/admin/(protected)/atendimento` |
| Integração WhatsApp (Meta Cloud API) | `src/server/whatsapp/` |
| Catálogo consultável por código | `src/server/vehicles/agent-catalog.ts` |
| Persistência de conversas e fatos | `src/server/attendance/conversation-repository.ts` |

O webhook do WhatsApp hoje **registra a mensagem recebida e não responde**. O turno fica na
caixa de entrada para um vendedor assumir.

### 1.2 Por que a tentativa anterior falhou — não repita

A versão removida tinha **1.518 linhas e 75 expressões regulares** classificando intenção, e
**zero ferramentas** disponíveis ao modelo. O regex decidia tudo; o modelo só era chamado
quando nenhum regex casava.

Consequência observada em produção, com clientes reais:

- o verbo "fazer" casava com o modelo *Yamaha Fazer* → "quero fazer um financiamento" era
  respondido com a ficha da moto
- "tem ar condicionado?" caía na lista de produtos fora do nicho → "ar condicionado não
  temos por aqui"
- "vocês fazem troca de óleo?" disparava a confirmação de troca de veículo
- "o banco da moto está rasgado?" era lido como pergunta sobre banco financiador
- corrigir um caso quebrava outro: ao desambiguar "cartão do veículo", quebrou-se
  "aceitam cartão?"

**A lição, que é o fundamento deste plano:** classificar intenção por regex não escala para
linguagem natural. Cada frase nova de cliente vira um defeito novo, e as correções
interferem entre si. O modelo precisa **conduzir** a conversa; o código fornece **dados
verificados** e **valida a saída**.

### 1.3 Código removido que vale consultar

O commit `936d029` é o último com o agente. Vale ler de lá (`git show 936d029:<arquivo>`):

- `src/server/attendance/trade-in-phrasing.ts` — guardas de saída (sem valor inventado, sem
  promessa de aceite, sem link, recusa de frase truncada via `finishReason`). **Reaproveitável.**
- `src/server/ai/demo-agent.ts` — verificação de que os IDs citados existem no catálogo.
  **Reaproveitável.**
- `src/server/attendance/dayse-grounding.test.ts` — ~60 casos reais que o agente errava.
  **Vale virar suíte de eval.**

Não reaproveite `knowledge.ts` nem `site-chat.ts`: são o motor de regex que falhou.

### 1.4 Referências do mercado (com fonte)

Não existe estudo independente que ranqueie agentes de IA para concessionárias. Quase todo
"case de sucesso" é material de fornecedor. O que tem evidência:

**Pied Piper PSI** (cliente oculto amarrado a resultado de vendas, nota 0–100):

| Como a loja responde | Nota |
|---|---|
| Só resposta automática | 26 |
| Só resposta pessoal | 59 |
| Resposta automática rica **+** follow-up pessoal | a melhor |

→ **O agente não substitui o vendedor; ele é a resposta rica que precede o vendedor.**

**Movida + Meta Business Agent** (locadora, WhatsApp, Brasil; números auto-declarados,
período de teste, não auditados):
- conversão 9,7% → 14,9%
- custo da locação via WhatsApp de ~10% para ~2% do valor do contrato
- 85% das conversas resolvidas no próprio canal
- CEO: *"O custo é o token. Como a abordagem é mais assertiva, você usa menos mensagens."*

**Mystery shop de 100 concessionárias (2026):** 92 responderam em 24h, mas **só 33 deram o
preço final**. Dar preço verificado na hora é um diferencial barato.

---

## Parte 2 — Arquitetura alvo

```
Cliente (WhatsApp / site)
        │
        ▼
  Orquestrador de turno  ──── persiste mensagem, trava turno (já existe)
        │
        ▼
  MODELO com ferramentas  ◄──► buscar_veiculos / detalhar_veiculo / dados_da_loja
        │                       registrar_lead / chamar_vendedor
        ▼
  Guardas de saída  ──── bloqueia valor inventado, promessa, link, ID inexistente
        │
        ▼
  Resposta  +  cartões renderizados pelo servidor (dados verificados)
```

**Princípios inegociáveis:**

1. O modelo decide o que responder. Não há classificador de intenção por regex.
2. Todo dado de veículo vem de ferramenta que lê o banco. O modelo nunca inventa preço,
   km, ano ou disponibilidade.
3. Preço e valores são renderizados pelo servidor, a partir do retorno da ferramenta.
4. A saída passa por guardas antes de ir ao cliente. Guarda reprovada → resposta de
   fallback + registro para análise.
5. Política comercial fica em prompt + guarda, nunca em regex de intenção.
6. Tudo que o cliente disser vira **eval**, não vira regra nova.

---

## Parte 3 — Execução

Cada tarefa é independente e tem critério de aceite verificável. Execute em ordem dentro de
cada fase; as fases 1 e 2 são pré-requisito do resto.

### Fase 0 — Decisões (humano, antes de codar)

| # | Tarefa | Saída esperada |
|---|---|---|
| 0.1 | Definir escopo do agente: só qualificar e encaminhar, ou também negociar? | Uma frase escrita |
| 0.2 | Definir política de troca: a avaliação é presencial? o agente pode estimar valor? | Regras escritas |
| 0.3 | Definir orçamento mensal de tokens e limite diário | Número |
| 0.4 | Escolher modelo (ver 0.5) | Modelo + fallback |
| 0.5 | Rodar comparação de modelos no mesmo corpus (tarefa 4.2) antes de fixar | Tabela de custo × qualidade |

**Sobre modelo:** o projeto usa OpenRouter, o que permite trocar sem mexer em código
(`OPENROUTER_MODEL`). O modelo anterior era `deepseek/deepseek-v4-pro-0813`, que apresentou
~1 falha de saída estruturada a cada 5 chamadas. Para um agente que conversa com cliente
final, avalie os modelos Claude mais recentes (`claude-sonnet-5-5`, `claude-opus-5-5`) —
tendem a ser mais confiáveis em uso de ferramentas e em seguir política. **Decida com a
medição da tarefa 4.2, não por suposição.**

### Fase 1 — Ferramentas sobre o catálogo existente

| # | Tarefa | Arquivos | Critério de aceite |
|---|---|---|---|
| 1.1 | Definir as ferramentas com `tool()` do AI SDK 7, com schema Zod | novo `src/server/agent/tools.ts` | `npm run typecheck` limpo |
| 1.2 | `buscar_veiculos(tipo?, marca?, modelo?, precoMax?, limite)` sobre `searchAvailableVehicles` | `tools.ts` | teste: busca por marca retorna só aquela marca |
| 1.3 | `detalhar_veiculo(id)` sobre `getVehicleDetails` | `tools.ts` | teste: id inexistente retorna erro tratado, não exceção |
| 1.4 | `dados_da_loja()` retornando endereço, telefone, mapa, avaliação de `src/data/store.ts` | `tools.ts` | teste: retorna o endereço real |
| 1.5 | `registrar_lead(campo, valor)` gravando em `conversations.facts` | `tools.ts` | teste: fato persiste entre turnos |
| 1.6 | `chamar_vendedor(motivo)` marcando handoff | `tools.ts` | teste: define `handoffRequestedAt` |

> Nota: `searchAvailableVehicles` limita `limit` a 5. Respeite ou ajuste conscientemente.

### Fase 2 — O agente

| # | Tarefa | Arquivos | Critério de aceite |
|---|---|---|---|
| 2.1 | Escrever o prompt de sistema: identidade, política comercial (0.1/0.2), tom de WhatsApp, limite de 2–3 frases | novo `src/server/agent/prompt.ts` | revisado por humano |
| 2.2 | Laço do agente com `generateText` + `tools` + `stopWhen` | novo `src/server/agent/run.ts` | responde uma pergunta de catálogo usando ferramenta |
| 2.3 | Montar histórico da conversa a partir de `listConversationMessages` | `run.ts` | teste multi-turno: lembra o veículo citado |
| 2.4 | Ligar no webhook do WhatsApp, substituindo `defaultRecordIncomingMessage` | `src/server/whatsapp/webhook-handler.ts` | mensagem real recebe resposta |
| 2.5 | Fallback: falha do provedor ou guarda reprovada → mensagem honesta + handoff | `run.ts` | teste: provedor fora do ar não deixa o cliente sem resposta |

### Fase 3 — Guardas de saída

Porte de `936d029:src/server/attendance/trade-in-phrasing.ts`.

| # | Tarefa | Critério de aceite |
|---|---|---|
| 3.1 | Rejeitar valor em reais não vindo de ferramenta | teste: "sai por R$ 8.000" é bloqueado |
| 3.2 | Rejeitar promessa (aprovado, garantido, aceite sem avaliação) | teste com cada termo |
| 3.3 | Rejeitar ID/veículo que não veio de `buscar_veiculos` | teste: id inventado bloqueia a resposta |
| 3.4 | Rejeitar `finishReason !== 'stop'` (resposta truncada) | teste |
| 3.5 | Rejeitar link e telefone fora dos dados da loja | teste |
| 3.6 | Toda rejeição gera log estruturado com a saída original | log inspecionável |

### Fase 4 — Avaliação (o que faltou da última vez)

**Esta fase é o que impede a regressão infinita. Não pule.**

| # | Tarefa | Critério de aceite |
|---|---|---|
| 4.1 | Montar corpus: ≥100 mensagens reais de clientes + as ~60 de `936d029:src/server/attendance/dayse-grounding.test.ts` | arquivo `evals/corpus.jsonl` |
| 4.2 | Runner que roda o corpus e salva as respostas por modelo | `npm run eval` imprime tabela |
| 4.3 | Critérios automáticos: guarda violada, dado inventado, pergunta repetida, resposta > 400 caracteres | relatório com contagem |
| 4.4 | Revisão humana amostral (20 conversas) com nota 1–5 | planilha |
| 4.5 | Fixar o corpus como suíte de regressão em CI | PR que piora o corpus falha |

**Regra de ouro:** toda conversa real que der errado **entra no corpus** antes de qualquer
correção. Nunca corrija sem o caso no corpus — foi exatamente assim que a versão anterior
virou um campo minado.

### Fase 5 — Canal e handoff

| # | Tarefa | Critério de aceite |
|---|---|---|
| 5.1 | Formatação WhatsApp (`**` → `*`), mensagens curtas | mensagem cabe em uma tela |
| 5.2 | Handoff: pausa a automação e avisa o vendedor | conversa marcada como humana |
| 5.3 | Eco do vendedor pelo celular pausa o agente | já existe (`smb_message_echoes`) — manter |
| 5.4 | Limite diário de tokens com degradação graciosa | sem cota → encaminha ao vendedor |

### Fase 6 — Medição (o que prova valor ao cliente)

| # | Métrica | Fonte |
|---|---|---|
| 6.1 | % de conversas resolvidas no canal | `conversations` × `handoffs` |
| 6.2 | Conversas → visita agendada | fato `visit` |
| 6.3 | Mensagens por conversa (proxy de custo) | `conversation_messages` |
| 6.4 | Tempo até a primeira resposta | timestamps |
| 6.5 | Taxa de guarda reprovada | log da fase 3 |

Sem isso não há como dizer ao lojista que o agente funciona.

---

## Parte 4 — Encaixes em aberto

- **"JEV"** — não identificado. Não existe sistema de concessionária com esse nome nas
  fontes consultadas; o mais próximo é **JMEV**, montadora chinesa de elétricos. Se for um
  DMS, um ERP ou um catálogo a integrar, trate como **Fase 1.7**: uma ferramenta a mais
  (`consultar_jev(...)`) sobre a API dele. A arquitetura já comporta.

---

## Parte 5 — Ordem sugerida e esforço

| Fase | Esforço | Pode paralelizar? |
|---|---|---|
| 0 | 1h (humano) | — |
| 1 | 4–6h | sim, uma tarefa por sessão |
| 2 | 6–8h | não, sequencial |
| 3 | 3–4h | sim, após 2.2 |
| 4 | 6h + coleta contínua | 4.1 pode começar já |
| 5 | 3h | após 2.4 |
| 6 | 3h | independente |

**Comece pela 4.1.** Coletar conversas reais não depende de código nenhum e é o insumo de
tudo. Se você só tiver tempo para uma coisa hoje, colete conversas.
