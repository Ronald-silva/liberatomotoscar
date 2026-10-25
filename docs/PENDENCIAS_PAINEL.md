# Pendências conhecidas do painel — depois da apresentação

Achados classificados como Minor durante as revisões de 2026-10-25 e deliberadamente adiados.
Nenhum deles bloqueia a apresentação. A revisão final do branch triou e confirmou que podem esperar.

## Lista

- **Task 3+4** — check-r2 não imprime nem limpa a chave órfã se o delete falhar.
- **Task 3+4** — catch genérico do import esconde a causa do erro de banco.
- **Task 5** — preço 0 exibido como "Sem preço".
- **Task 5** — cores das etiquetas em hex fixo, fora dos tokens --admin-*.
- **Task 5** — testes cobrem 3 das 10 mensagens conhecidas; nada protege contra deriva
- **Task 6** — mensagem de versão velha sem botão de recarregar.
- **Task 6** — sessão expirada vira mensagem genérica.
- **Task 6** — página reconhece erro por nome/texto em vez de instanceof.
- **Task 7** — mensagem local do cliente não passa por toFormMessage.
- **Task 7** — rótulo "Tirar ou escolher foto" engana no Android (capture força câmera).
- **Task 7** — getAdminPhotoReadUrl por imagem na edição; URL com falha derruba a página.
- **Task 7** — .catch(() => null) engole erro de assinatura em silêncio na lista.
- **Task 6** — estado local mascara valores reformatados pelo servidor após salvar.
- **Task 6** — campo Ano aceita "2.024" e converte em 2024.
- **Task 6** — não há teste de montagem de VehicleForms; o re-revisor aponta que
- **Task 8** — botões de estado sem feedback de envio ("Publicando..." nunca aparece).
- **Task 8** — rótulo "Publicar" é ambíguo quando o veículo está reservado/vendido.
- **Task 8** — status inválido por POST cai na mensagem genérica.
- **Task 8** — sem teste de componente que prove a derivação dos botões.
- **Task 9** — os dois botões mostram "Criando..." juntos (pending do formulário inteiro).
- **Task 9** — revalidatePath dentro do try pode gerar rascunho órfão duplicado.
- **Task 9** — nada protege contra classe de CSS Modules inexistente — foi exatamente

## Prioridade sugerida pela revisão final

1. **Guarda contra classe de CSS Modules inexistente** (Task 9). O build não acusa classe ausente:
   CSS Modules devolve `undefined` em silêncio. Foi assim que um arquivo de estilo foi parar em
   caminho errado e passou em typecheck, lint e build sem ninguém notar. É o de maior valor.
2. **Teste de montagem de `VehicleForms`** (Task 6), com happy-dom ou jsdom como devDependency:
   provaria que o valor digitado persiste após erro e que o `version` oculto acompanha a prop nova.
3. O restante é cosmético ou dívida de teste.

## Nota de arquitetura para a Fase 3

`src/app/admin/(protected)/layout.tsx` **não é barreira de segurança** no Next 16: o layout não
impede o segmento de executar (ver `node_modules/next/dist/docs/01-app/02-guides/authentication.md`).
A barreira real é o `requireAdmin()` dentro de `src/server/vehicles/service.ts`, presente em todas as
funções administrativas. Qualquer rota nova precisa passar pelo serviço — não basta colocá-la sob o grupo.
