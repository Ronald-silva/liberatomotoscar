# Liberato Motos Car

Site e painel operacional para a Liberato Motos Car, em Fortaleza. O mesmo cadastro de veículos alimenta a vitrine pública, o estúdio de artes e as consultas de estoque da Dayse no WhatsApp. O painel também reúne conversas e visitas agendadas.

**Estado em 06/11/2026:** o código compila e tem deployment de produção acessível, mas a liberação comercial completa ainda depende de validação dos dados, dos fluxos externos e da operação com a loja. O site mantém `noindex`. Este repositório atende uma loja; os identificadores de tenant do WhatsApp não tornam o estoque e o painel um SaaS multiloja.

Leia o [diagnóstico de produto e roteiro de estudo de mercado](docs/DIAGNOSTICO_PRODUTO_E_MERCADO.md) para entender o que existe, o que foi verificado, as lacunas e a ordem recomendada de decisões.

## O que existe hoje

| Área | Função no produto | Entrada principal |
| --- | --- | --- |
| Vitrine | Lista veículos publicados e reservados do PostgreSQL; mostra detalhes, fotos e contato | `/`, `/veiculos/[slug]` |
| Estoque | Cadastro, fotos, preços, situações, auditoria e publicação | `/admin`, `/admin/veiculos/[id]` |
| Divulgação | Cria artes JPEG para Feed, Stories, Status do WhatsApp e TikTok; compartilha pelo aparelho quando disponível ou baixa o arquivo | `/admin/divulgar`, `/admin/veiculos/[id]/arte` |
| Atendimento | Recebe mensagens pelo webhook oficial do WhatsApp, usa a Dayse com consulta restrita ao estoque publicado, persiste conversas e permite intervenção do vendedor | `/api/webhooks/whatsapp`, `/admin/atendimento` |
| Agenda | Lista visitas registradas pela Dayse ou pela equipe; permite correção e cancelamento | `/admin/agenda` |
| Ajustes | Conexão de número via Meta Embedded Signup e seleção do modo de atendimento | `/admin/ajustes` |

O painel usa login Google com lista de e-mails permitidos **e** concessão em `admin_grants`. O serviço de veículos protege as alterações no servidor; esconder uma rota não é a autorização.

### Limites que mudam a leitura do produto

- A vitrine está ligada ao banco, mas o `noindex` global impede tratá-la como canal orgânico já lançado.
- A arte é preparada para o destino escolhido; o aplicativo de destino ainda precisa da confirmação da pessoa. Não há publicação automática nem calendário de postagens.
- O chat público do site não existe. As variáveis `SITE_CHAT_ACCESS` e `DEMO_AI_ENABLED` são legado de planejamento e não ativam uma interface de chat.
- Há código de WhatsApp, mas um deployment `Ready` não comprova recebimento, resposta e handoff no número real. Faça ensaio de ponta a ponta antes de declarar o canal pronto.
- O modo “Atendimento por menu” está disponível na tela de ajustes, mas o runtime atual só responde automaticamente no modo `ai`; esse modo precisa ser implementado ou retirado da escolha.
- Eventos de visualização e clique no WhatsApp não são venda ou lead confirmado. Ainda falta um funil que ligue conversa, visita e venda.

## Tecnologia e arquitetura

- Next.js 16.4.2, React 19.3, TypeScript e CSS Modules.
- PostgreSQL/Neon com Drizzle para estoque, autorização, conversas, visitas e auditoria.
- Cloudflare R2 para fotos privadas, com URLs temporárias e fila de limpeza.
- Auth.js com Google OAuth para o painel.
- Meta WhatsApp Cloud API e Embedded Signup para o canal; OpenRouter com AI SDK para a Dayse. Regras de disponibilidade, limites e autorização ficam no servidor.
- Konva para compor e exportar as artes no navegador.

Consulte [`src/server/db/schema.ts`](src/server/db/schema.ts), [`src/server/vehicles/service.ts`](src/server/vehicles/service.ts), [`src/server/agent/run.ts`](src/server/agent/run.ts) e [`src/server/whatsapp/webhook-handler.ts`](src/server/whatsapp/webhook-handler.ts) para as fontes técnicas principais.

## Desenvolvimento local

Use preferencialmente Node.js 24.x, versão configurada no projeto Vercel em 06/11/2026. O build local desta revisão também passou com Node 26.8.1.

```bash
npm ci
cp -n .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`. O catálogo exige `DATABASE_URL`; o painel autenticado exige Google OAuth e uma concessão administrativa; upload de fotos exige R2. Preencha apenas os serviços necessários para o fluxo que vai testar. Não copie credenciais de produção para o README, testes ou commits. A lista de variáveis e as instruções de provisionamento estão em [`.env.example`](.env.example) e em [autenticação do painel](docs/AUTENTICACAO_ADMIN_FASE2_1.md).

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Testes de integração que gravam no banco exigem `TEST_DATABASE_URL` isolada; a execução padrão os pula. Não use a branch compartilhada de produção para esse teste. As avaliações do agente em `npm run eval` chamam um modelo real e têm custo: execute apenas com corpus, orçamento e critério de aceite definidos.

## Operação e documentação

- [Diagnóstico atual de produto, prontidão e mercado](docs/DIAGNOSTICO_PRODUTO_E_MERCADO.md): comece aqui para decidir o próximo investimento.
- [Conferência do estúdio de artes](docs/liberato-inteligente/05-CONFERENCIA-ESTUDIO-ARTES.md): roteiro de validação nos aplicativos e aparelhos reais.
- [Validação dos anúncios](docs/VALIDACAO_CATALOGO.md): checklist de dados e autorização das fotos.
- [Plano de avaliação do agente](docs/PLANO-AGENTE-IA-ATENDIMENTO.md): corpus, critérios e revisão humana; leia a data de cada resultado.
- [Planos e auditorias históricos](docs/liberato-inteligente/01-DIAGNOSTICO-ARQUITETURA.md): registram decisões anteriores; partes já foram implementadas ou alteradas. O diagnóstico atual prevalece para o estado do produto.

Antes de trocar domínio, liberar indexação, mudar modo da Dayse ou conectar o número comercial, confirme dados da loja, custos, permissões, retenção, recuperação de falhas e responsáveis pela resposta humana. As etapas e evidências estão no diagnóstico.
