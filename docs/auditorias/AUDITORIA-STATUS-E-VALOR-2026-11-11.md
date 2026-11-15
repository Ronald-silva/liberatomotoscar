# Auditoria de status e valor comercial — Liberato Motos Car

**Data:** 11/11/2026

**Código examinado:** `main`, commit `020a9a6`, alinhado a `origin/main` no início da auditoria. A pasta `.omc/` já estava não versionada e não foi examinada.
**Escopo:** código, testes locais, configuração e deployment Vercel, vitrine pública e comparação documental com fornecedores do setor. Nenhuma operação autenticada da loja nem mensagem real de cliente foi executada.

## Veredito

O projeto é uma **base funcional para piloto assistido em uma revenda independente**. O cadastro único já alimenta vitrine, artes e consultas de estoque no WhatsApp. Há engenharia relevante de autorização, auditoria de alterações, idempotência e testes. O status `Ready` da Vercel e a vitrine acessível comprovam publicação, mas **não comprovam operação comercial confiável**. Ainda faltam prova de atendimento no número real, fechamento de visita e venda, medição de retorno e isolamento entre lojas. O produto não está pronto para ser vendido como SaaS multiloja.

A base técnica usa Next.js 16/React 19, PostgreSQL/Neon com Drizzle, Cloudflare R2, login Google via Auth.js, Meta WhatsApp Cloud API e OpenRouter para a Dayse. O Vercel AI Gateway e o modelo Jev não estão integrados no código examinado.

## Evidências observadas agora

| Dimensão | Resultado em 11/11/2026 | Limite da evidência |
| --- | --- | --- |
| Código | `main` em `020a9a6`; único item não versionado pré-existente: `.omc/`. | O commit do deployment não foi obtido pela CLI; a proximidade de horários não prova que são idênticos. |
| Testes | `npm test`: **925 passaram, 37 pulados**; `npm run typecheck` e `npm run lint` passaram. | Os testes pulados incluem integrações com banco isolado. Nenhum teste usou Meta ou OpenRouter reais. |
| Build | `npm run build` passou com acesso às fontes do Google. A primeira tentativa, na rede restrita, falhou apenas ao buscar Archivo e Space Mono. | Build local não verifica credenciais nem tarefas humanas em produção. |
| Dependências de produção | `npm audit --omit=dev --audit-level=moderate`: **0 vulnerabilidades reportadas**. | É uma consulta ao registro npm na data da auditoria, não uma garantia permanente. |
| Dependências de desenvolvimento | `npm audit --audit-level=moderate`: **11 avisos moderados**, ligados a `esbuild` via `drizzle-kit` e `minimatch` via ferramentas de ESLint. | Não foi executado `npm audit fix`; a correção sugerida para `esbuild` exige mudança incompatível de `drizzle-kit`. Avaliar atualização dirigida e repetir build/testes. |
| Vercel | Projeto `liberatomotoscar` com Node **24.x**; deployment de produção criado em **10/11/2026 12:31, horário de Brasília**, estado `Ready`, associado ao alias `liberatomotoscar.vercel.app`. | A conexão MCP retornou 403; a CLI autenticada permitiu as consultas. Não foram examinados erros de runtime, custo, backups ou tráfego. |
| Vitrine pública | Página abriu no navegador, com **5 anúncios** (3 motos, 2 carros) e links de contato. Meta robots retornou `noindex, nofollow`. | Preço, disponibilidade, fotos e alegações da loja precisam de confirmação do proprietário. Um clique em `wa.me` não comprova lead recebido. |
| Interface pública | Auditoria Lighthouse **snapshot móvel**: 100 em acessibilidade, boas práticas e SEO, com **uma falha** de correspondência entre texto visível “Deslize para explorar” e nome acessível “Ir para os veículos”. | O modo snapshot não mede desempenho; nota de SEO não supera o `noindex` verificado. O painel não foi testado com login real. |

## Inventário por resultado para a loja

| Jornada | Implementado | Falta para gerar valor comprovável |
| --- | --- | --- |
| Cadastrar e publicar | Veículos, fotos, preço, estado, validação de publicação, histórico de alterações e vitrine ligados ao PostgreSQL. | Conferência dos cinco anúncios pela loja, rotina de disponibilidade, tempo real de cadastro e sincronização com canais externos. |
| Divulgar | Artes JPEG por destino, legenda, compartilhamento nativo quando disponível e download. | Confirmar resultado em aparelhos e aplicativos usados; registrar publicação e medir tempo gasto. Não há publicação automática ou calendário. |
| Atender | Webhook Meta com assinatura, deduplicação, consulta ao estoque publicado, conversa persistida e passagem ao vendedor. | Ensaio no número autorizado, monitoramento de falhas de envio, prazo de resposta humana e revisão de qualidade da Dayse. |
| Agendar | Agenda manual e por agente, correção e cancelamento. | Confirmação, comparecimento, lembrete, motivo de perda e vínculo com venda efetiva. |
| Gerir resultado | Eventos de visualização/clique e consultas técnicas de uso do agente. | Funil com origem → conversa → visita → comparecimento → venda, denominadores auditáveis e custo por resultado. |
| Operar várias lojas | Identificador de tenant no WhatsApp. | Segregação de estoque, usuários, mídia, artes, conversas, regras e métricas em todas as consultas; papéis, suporte e cobrança. |

## Riscos e ações em ordem de prioridade

### P0 — corrigir antes de prometer atendimento automático confiável

1. **Modo menu pode deixar cliente sem resposta.** `settings.ts` aceita `deterministic` e o painel oferece essa escolha; `runWhatsappAgentTurn` retorna `null` para qualquer modo diferente de `ai`. Implementar o menu com teste de ponta a ponta ou remover a escolha até existir. Evidência: `src/server/attendance/settings.ts`, `src/server/agent/whatsapp-turn.ts`, `src/server/attendance/mode-labels.ts`.
2. **Cota e limite falham abertos.** Em erro de banco, `reserveAiRequest` permite a chamada e `consumeRateLimit` devolve `true`. O teto de custo/abuso deixa de ser garantido justamente quando o controle falha. Definir falha segura e encaminhamento humano, com teste de indisponibilidade. Evidência: `src/server/attendance/limits.ts`.
3. **Risco de atribuir uma falha de envio à conversa errada.** `ultimaConversa` é uma variável de módulo compartilhada por requisições; cada evento a redefine antes de `await runTurn`, e a falha usa o valor global após `await sendOutbound`. Duas requisições simultâneas podem cruzar os IDs e sinalizar ao vendedor a conversa errada. Passar o ID no resultado local da execução e testar concorrência. **Falha lógica verificada no código; ocorrência em produção não medida.** Evidência: `src/server/whatsapp/webhook-handler.ts`.
4. **Chave do token do WhatsApp sem configuração dedicada em produção.** `WHATSAPP_TOKEN_ENCRYPTION_KEY` não aparece na lista de variáveis Vercel. O código deriva a chave de outro segredo nessa ausência; girar esse segredo pode tornar tokens persistidos ilegíveis. Planejar migração/regravação com ensaio e rollback antes de alterar segredos. Evidência: `src/server/whatsapp/crypto.ts` e `vercel env ls`.
5. **Prova operacional incompleta.** Não houve teste autorizado anúncio → mensagem recebida → resposta/erro → handoff → visita em produção. Um deployment `Ready` não substitui esse ensaio. Registrar IDs, horário, resultado e responsável, sem incluir dados pessoais no relatório compartilhado.

### P1 — fechar o ciclo comercial e a operação

1. **Métricas ainda confundem intenção com resultado.** `conversasComVisita` usa um fato na conversa, e o retorno recebe o nome `visitaAgendadaPct`; não consulta `visit_appointments`. O evento Meta de visualização ainda usa `vitrine_ilustrativa`. Definir eventos separados para interesse, agendamento, comparecimento e venda. Evidência: `src/server/attendance/metrics.ts`, `src/lib/analytics.ts`.
2. **Origem do site se perde no WhatsApp.** Há mensagem pré-preenchida com referência do veículo, mas não há registro persistido que ligue campanha e clique à conversa recebida. Instrumentar atribuição verificável e manter “origem desconhecida” quando não houver prova.
   As variáveis `NEXT_PUBLIC_META_PIXEL_ID` e `NEXT_PUBLIC_GA_MEASUREMENT_ID` não apareceram na configuração Vercel listada; os eventos opcionais do navegador não têm destino configurado nessa produção observada. Evidência: `src/components/marketing/AnalyticsConsent.tsx`, `.env.example` e `vercel env ls`.
3. **Fila humana sem garantia de acompanhamento.** A caixa de entrada existe, mas não há alerta ou painel de prazo de resposta; a lista busca no máximo 50 conversas e não atualiza automaticamente. Medir demanda real antes de escolher polling, notificações ou paginação. Evidência: `src/server/attendance/inbox.ts`, `src/app/admin/(protected)/atendimento`.
4. **Retenção e recuperação sem rotina observável.** Há função para expurgar conversas vencidas e fila de limpeza de imagens, porém `vercel.json` não agenda essas tarefas. Não foi visto teste de restauração de backup. Definir política e responsável, criar execução monitorada e ensaiar recuperação. Evidência: `src/server/attendance/conversation-repository.ts`, `src/server/storage/cleanup.ts`, `vercel.json`.
5. **Aquisição orgânica bloqueada.** O `noindex, nofollow` global está ativo. Revisar conteúdo, domínio, fotos, disponibilidade e medição com a loja antes de decidir pela indexação. Evidência: `src/app/layout.tsx` e meta tag observada no site.

### P2 — depois de medir o piloto

- Integrar leads dos portais efetivamente usados pela loja, começando por um canal com permissão e volume comprovados.
- Automatizar acompanhamento de visita e pós-visita com revisão humana, respeitando as regras do canal.
- Evoluir funções de estoque como envelhecimento do anúncio, pendências e qualidade das fotos quando houver uso suficiente para gerar economia mensurável.
- Construir segregação multiloja apenas antes da segunda revenda; a presença de `tenantId` no WhatsApp não resolve essa necessidade.

## Posição competitiva

A oportunidade é **reduzir o tempo e a perda de contexto entre estoque, divulgação, conversa e visita** em revendas independentes pequenas. “Site + artes + IA” não é uma diferenciação demonstrada: [Syonet](https://syonet.com/pt-br/solucoes-chats) anuncia WhatsApp integrado ao CRM, agendamento, histórico e IA; [Revenda Mais](https://ajuda.revendamais.com.br/hc/rmais-ajuda/articles/1755022974-configuracao-crm-_-chat-do-olx) documenta integração de chats/leads de portais; a [OLX](https://developers.olx.com.br/lead/home.html) mantém API de integração de leads. São descrições dos fornecedores, não comparação de preço ou qualidade testada.

O mercado de usados é grande — a [FENAUTO](https://www.fenauto.org.br/news/segmento-de-veiculos-usados-registra-pequena-retracao-em-setembro) registrou 14,2 milhões de transações de janeiro a setembro de 2026 —, mas esse volume nacional não demonstra demanda pelo software nem disposição a pagar. O primeiro nicho a validar é a revenda com poucas pessoas, estoque atualizado manualmente e WhatsApp como principal canal. Redes e concessionárias maiores exigem integrações e operação que este produto ainda não entrega.

## Plano de validação e sequência de investimento

| Etapa | Entrega | Critério de aceite |
| --- | --- | --- |
| **1. Confiabilidade** | Corrigir os quatro P0 de código/configuração; testar o canal real com conta autorizada. | Nenhum cenário do roteiro fica silencioso; falhas de banco/provedor/envio deixam estado e responsável visíveis; concorrência não cruza conversas. |
| **2. Piloto assistido** | Aprovar dados dos cinco anúncios, nomear responsável pela fila, definir prazo de resposta, retenção e recuperação. | Uma semana de operação com incidentes e tempos registrados, visita ligada a conversa ou marcada como manual. |
| **3. Prova de valor (30 dias)** | Registrar origem, contato qualificado, visita marcada, comparecimento e venda confirmada; medir tempo de cadastro e divulgação. | Relatório com linha de base, denominadores e custo total. Cada venda atribuída tem confirmação humana; dados sem origem ficam como desconhecidos. |
| **4. Expansão** | Escolher a próxima integração ou automação pela tarefa que mais consumiu tempo ou perdeu oportunidades no piloto. | Melhora mensurável sem aumento de erro de disponibilidade ou atendimento; custo e suporte cabem na receita da loja. |

**Entrevistas antes de definir o pacote comercial:** 5–8 donos/gerentes e 3–5 vendedores de revendas comparáveis, observando tarefas reais no celular. Perguntar ferramentas atuais, custo mensal, canal que mais gera visitas, erros toleráveis e qual ganho justificaria assinatura. Medir comportamento no piloto; elogio à tela não é evidência de compra.

## Limites desta auditoria

Não foram verificados login real do painel, recebimento e envio na conta Meta, qualidade de conversas, dados internos de vendas, faturas de Vercel/Neon/R2/OpenRouter/Meta, volume de tráfego, backups ou restauração. A avaliação `npm run eval` não foi executada porque usa modelo pago. O relatório anterior `docs/DIAGNOSTICO_PRODUTO_E_MERCADO.md` descreve o estado de 06/11; este documento atualiza as evidências de 11/11 sem tratar planos históricos como funções já lançadas.
