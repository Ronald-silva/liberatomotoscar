# Estado do projeto — Liberato Motos Car
_Atualizado em 2026-11-15 · branch `fix/whatsapp-p0-confiabilidade-20261111`_

## Agora
Correções P0 da auditoria de 11/11 no atendimento WhatsApp (Dayse): proteção do modo legado e
limites de consumo, falhas de envio associadas à conversa certa, token ausente sinalizado.
15 commits à frente de `main`, branch sincronizada; **PR #1 aberto** ("Dayse/WhatsApp P0").

## Próximo passo
> ⚠️ Inferido pelas evidências do repositório — **confirme ou corrija esta linha**.

Fechar o caso restante de silêncio: em `src/server/agent/whatsapp-turn.ts` (~linha 104), quando a
conversa estoura o teto diário próprio o turno retorna `null` sem resposta nem passagem ao vendedor.
Dar resposta explícita + handoff, com teste; depois rodar a verificação completa e revisar o PR #1.

## Pendências
- [ ] P0 — Silêncio no teto por conversa (acima).
- [ ] P0 — `WHATSAPP_TOKEN_ENCRYPTION_KEY` não configurada na Vercel; hoje a chave é derivada de outro
      segredo. Planejar migração/regravação com ensaio e rollback **antes** de mexer em segredos.
- [ ] P0 — Ensaio real autorizado: anúncio → mensagem → resposta → handoff → visita, com registro.
- [ ] Merge do PR #1 em `main` e deploy.
- [ ] Versionar `docs/auditorias/AUDITORIA-STATUS-E-VALOR-2026-11-11.md` (está fora do git).
- [ ] P1 — Métricas separando interesse / agendamento / comparecimento / venda; atribuição de origem.
- [ ] P1 — Agendar expurgo de conversas e limpeza de imagens (`vercel.json` não agenda); ensaiar restauração.
- [ ] Loja confirmar dados, fotos e preços dos 5 anúncios publicados.

## Decisões
- 2026-11-11 — Cota/limite com falha **segura**: erro de banco bloqueia a IA em vez de liberar. _Teto de custo não pode sumir quando o controle falha._
- 2026-11-11 — Modo "menu" incompleto saiu das opções; banco antigo com modo legado responde mensagem fixa e passa ao vendedor.
- 2026-11-11 — ID da conversa da falha de envio vem do resultado local da requisição, não de variável de módulo. _Evita cruzar conversas em requisições simultâneas._
- 2026-10-31 — `noindex` mantido até existir domínio próprio. _Não criar histórico no Google preso ao subdomínio provisório._

## Última sessão
2026-11-15 — Criados `CLAUDE.md` e este arquivo e acrescentado o contexto compartilhado ao `AGENTS.md` (padrão de continuidade entre IAs).
