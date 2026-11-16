<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Liberato Motos Car — instruções para qualquer IA (Claude, Codex, Cursor, OpenCode)

Fonte única de contexto. `CLAUDE.md` só aponta para cá. Responda em português do Brasil.

## Antes de começar
1. Leia `docs/ESTADO.md` (onde paramos, próximo passo, pendências, decisões).
2. Rode `git status` e `git log -5 --oneline`.
3. Só então explore o código, e só o necessário para a tarefa.

## Ao encerrar (quando o usuário disser "encerrar", "fechar sessão" ou similar)
Atualize `docs/ESTADO.md`: reescreva **Agora** e **Próximo passo**, ajuste **Pendências**,
acrescente decisões novas no topo de **Decisões** (data + 1 linha + porquê) e substitua
**Última sessão**. Máx. ~60 linhas: resuma, não acumule histórico (o git guarda).
Não faça commit sem o usuário pedir.

## Projeto
Vitrine + painel + atendimento WhatsApp com IA (agente "Dayse") para uma revenda independente
de motos e carros. Piloto assistido; ainda não é SaaS multiloja.

- Stack: Next.js 16 / React 19, PostgreSQL (Neon) + Drizzle, Cloudflare R2, Auth.js (Google),
  Meta WhatsApp Cloud API, OpenRouter (Dayse). Vercel AI Gateway **não** está integrado.
- Deploy: **Railway** (projeto `liberato-motos-car`, serviço `liberatomotoscar`, Node 24.x,
  `liberatomotoscar-production.up.railway.app`). Decidido em 16/11/2026, conforme
  `docs/planos/2026-11-host-unico.md`. A Vercel segue no ar durante a observação e depois sai; até
  o corte terminar, **os dois hosts leem o mesmo Neon**, então nunca presuma host único no código.
  Consequência: o cron de `vercel.json` **não dispara no Railway** — a retenção precisa do
  agendador próprio descrito no §6 do plano.
- Banco: branch Neon `production` (`br-quiet-tooth-b83ew3t8`) é a da loja; o trabalho local usa a
  branch `development` (`br-dark-smoke-b89bby7c`), que é para onde o `.env` aponta. Migrações em
  produção só com autorização explícita.
- Avaliação mais recente e confiável: `docs/auditorias/AUDITORIA-STATUS-E-VALOR-2026-11-11.md`
  (os demais diagnósticos em `docs/` são de datas anteriores).

## Comandos
| Ação | Comando |
|---|---|
| Dev | `npm run dev` |
| Testes | `npm test` (vitest) |
| Tipos | `npm run typecheck` |
| Lint | `npm run lint` |
| Build | `npm run build` (precisa de rede para as fontes Google) |

Antes de dizer que algo está pronto: `npm run typecheck && npm run lint && npm test && npm run build`.
`npm run eval` usa modelo pago — só com autorização do usuário.

## Regras que não podem ser quebradas
- **`noindex, nofollow` em `src/app/layout.tsx` é decisão, não defeito** (31/10/2026): a indexação
  só será liberada com domínio próprio. Quando chegar: `NEXT_PUBLIC_SITE_URL` no build, tirar o
  `noindex`, criar `robots.ts`, `sitemap.ts` e `alternates.canonical` nas rotas públicas.
- Nenhuma falha do atendimento pode deixar o cliente **sem resposta e sem vendedor**: todo caminho
  de erro ou limite precisa de resposta explícita ou passagem ao vendedor, com teste.
- Não alterar segredos de produção (ex.: chave de criptografia do token do WhatsApp) sem plano de
  migração aprovado pelo usuário.
- Teste com a conta Meta real ou mensagem a cliente real: só com autorização explícita.
