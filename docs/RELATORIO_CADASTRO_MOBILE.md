# Relatório — cadastro guiado de veículo no celular

Data: 26/10/2026. Branch: `painel-cadastro-simples`. Execução retomada das Tasks 7–14 do plano em `docs/superpowers/plans/2026-10-26-cadastro-mobile-guiado.md`.

## Entrega

- A tela de edição apresenta **O veículo → Fotos → Conferir e publicar**. O formulário grava após 800 ms sem digitação ou ao perder foco, sem botão Salvar. O indicador comunica sucesso, andamento e erro com nova tentativa.
- Câmera e galeria são ações separadas. A galeria aceita múltiplas fotos; definir capa e remover foto usam a fila serializada de escrita e a versão atual.
- O rodapé do rascunho concentra a publicação e explica o que falta. A confirmação de disponibilidade ocorre antes de publicar. Quando um campo está focado, o rodapé sai de cena; ao reduzir a viewport, o campo focado é trazido para a área visível.
- Arquivar e excluir rascunho ficam em ações secundárias com confirmação. O estoque ganhou filtros por estado na URL e contagens. Anúncios descartados ficam fora de “Tudo”.
- Mudança de estado e remoção de foto agora devolvem a nova versão ao editor. Sem essa correção, a próxima operação da fila falharia por versão antiga.

## Verificação automatizada

| Comando | Resultado |
| --- | --- |
| `DATABASE_URL=... TEST_DATABASE_URL=... npm test` contra PostgreSQL **local descartável** | 23 arquivos, **250 testes passaram**, 0 falhas, 0 ignorados |
| `npm run lint` | passou, sem avisos |
| `npm run typecheck` | passou |
| `npm run build` | passou, Next 16.4.2 |

As URLs do comando de teste apontaram para `127.0.0.1:55433/liberato_test`. Segredos não foram impressos nem gravados neste relatório.

## Teste ponta a ponta no ambiente atual

Por decisão expressa do proprietário, o teste de navegador usou o Neon e o R2 já configurados. Não foi criada branch, projeto, bucket, conta, concessão ou credencial. Uma sessão administrativa válida que já existia no banco foi usada **somente em memória** no navegador de teste.

Pré-condições confirmadas: consulta somente de leitura ao Neon funcionou; escrita, leitura e exclusão de um objeto R2 temporário identificado por UUID funcionaram, com remoção confirmada. Antes de qualquer cadastro, o banco continha 15 veículos e 8 imagens; uma comparação por linha foi guardada em memória para detectar alteração em registros anteriores.

Marcador único: `A5CC8058BD`. Registros criados pelo teste:

| Tipo | ID | Resultado |
| --- | --- | --- |
| Moto | `9f4a30c0-5d8e-40aa-be22-20c5d42e3eec` | publicado, editado após publicação e depois arquivado |
| Carro | `f5e11186-8c52-445f-95d8-a8be3bb0b22f` | publicado, editado após publicação e depois arquivado |

Para **cada** tipo, o Playwright confirmou: criação pelo seletor Moto/Carro; preenchimento de marca, modelo, ano, quilometragem, cor e preço; gravação automática; preservação dos campos após recarregar; upload de duas fotos num único gesto; troca da capa; edição persistida; confirmação de disponibilidade; publicação no banco. Após a publicação, uma segunda edição foi persistida e verificada por recarga.

O fluxo executado usou **14 interações de toque equivalentes** até publicar, incluindo troca de capa e uma edição adicional, sem contar teclas digitadas nem recargas de verificação. É a contagem da sequência automatizada, não uma medição em um Android físico.

Layout: sem rolagem horizontal em 360, 390, 430, 768 e 1440 px. No rascunho, o rodapé não cobriu a última ação; com o campo Preço focado e viewport de 390×500 px, ele ficou visível e o rodapé foi ocultado. O filtro de estado e as confirmações foram cobertos por testes de componente.

O filtro também foi verificado no navegador real: `?estado=arquivado` ficou ativo e exibiu o registro de teste arquivado; `?estado=rascunho` não o exibiu.

Limpeza limitada aos dois veículos de teste: ambos foram arquivados; as quatro linhas de imagem foram removidas; quatro objetos R2 correspondentes foram verificados como ausentes. **Zero veículos preexistentes e zero imagens preexistentes foram modificados** nas comparações antes/depois. As duas linhas de veículo e sua auditoria permanecem arquivadas, conforme o modelo append-only.

## Migração concluída após o teste inicial

Após ordem explícita do proprietário para concluir a pendência, a conexão direta foi conferida contra a branch de produção documentada e a conexão de runtime. O histórico tinha cinco migrações aplicadas; `drizzle/0005_vehicle_status_discarded.sql` era a única pendente. `npm run db:migrate` passou. A conferência posterior mostrou seis entradas no histórico, a constraint `vehicle_status_valid` aceitando `discarded` e os mesmos 17 veículos presentes antes da migração.

Foi criado um rascunho de teste adicional com marcador `62E0DD7068`, ID `232bb49d-02fa-46af-9d1f-f5784498778f`, e uma foto. A ação “Excluir rascunho” redirecionou ao estoque; o registro ficou em `discarded` com auditoria `discarded`, sua linha de imagem sumiu e o objeto R2 foi confirmado ausente. Nenhum veículo ou imagem preexistente foi modificado. No estoque, o registro não apareceu em “Tudo” e apareceu no filtro “Descartados”. A linha descartada e sua auditoria permanecem no Neon por desenho.

**Nenhum deploy ou ajuste da Vercel foi feito.** A branch de código ainda precisa de uma decisão de publicação separada.

## Limites conhecidos

- O upload passa pela server action e depende da redução da foto no cliente.
- URLs de leitura R2 expiram em 15 minutos.
- A vitrine pública ainda lê o catálogo estático; publicação no painel não atualiza a vitrine.
- Uma falha no `delete` do R2 pode deixar objeto órfão; limpeza automática segue pendente.
- Excluir um dos sete veículos legados remove o vínculo com fotos estáticas, sem restauração pelo importador.
- O descarte é irreversível para fotos R2 e a exclusão do veículo é lógica; veículo e auditoria ficam no banco.
