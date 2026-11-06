# Pendências conhecidas do painel

## Atualização de 03/11/2026 — segunda etapa da reformulação

- O código agora recebe nome, telefone e tenant da Meta; o vendedor só envia resposta pelo painel dentro da janela de 24 horas, com confirmação da Cloud API. Conversas sem contato oferecem o caminho pelo celular da loja.
- A Dayse recebeu a ferramenta `marcar_visita`, que confere dia e hora pelo calendário da loja; a Agenda mostra visitas automáticas e manuais com orçamento e troca quando constam da ficha.
- A migração aditiva `drizzle/0011_whole_stepford_cuckoos.sql` foi **gerada, não aplicada em produção**. O fluxo completo também depende da migração `0010` e de um deploy deste código.
- Em 03/11, o banco configurado neste ambiente não tinha `visit_appointments`; a garantia de esquema do atendimento criou a tabela e uma consulta confirmou que ela responde. Os arquivos `0010` e `0011` foram tornados seguros para bases já complementadas em runtime. O histórico `drizzle.__drizzle_migrations` continua defasado em relação ao diário local; não executar `db:migrate` sem reconciliar a migração antiga divergente.
- Falta validar com número de WhatsApp autorizado e aparelho real o envio do vendedor, a marcação automática e o layout no celular. Os testes locais cobrem regras e falhas, mas não substituem a confirmação da Meta.

Registro anterior: 26/10/2026, após o cadastro guiado no celular.

## Resolvido nesta entrega

- Câmera e galeria agora têm escolhas separadas. A galeria aceita várias fotos; a câmera usa `capture="environment"` somente no seu próprio input.
- `VehicleForms` grava automaticamente, mantém os dados após falha e tem testes de montagem.
- A tela mostra `Salvando...`, `✓ salvo` e uma tentativa de recuperação quando a gravação falha.
- A publicação confirma disponibilidade e mostra `Publicando...` durante o envio.
- Os botões de criação de moto/carro não mostram `Criando...` juntos.
- A guarda de classes CSS Modules inexistentes está coberta por `css-classes.test.ts`.
- A foto e a mudança de estado devolvem a nova versão à fila do editor; isso foi confirmado por teste e pelo fluxo real.
- A página de detalhe usa duas consultas paralelas e tolera falha ao assinar URL de foto.
- O estoque permite filtrar por estado, com contagens.

## Estado do banco e publicação

- A migração não destrutiva `drizzle/0005_vehicle_status_discarded.sql` foi aplicada ao Neon atual em 26/10/2026, após ordem explícita do proprietário. O histórico passou de cinco para seis entradas; `vehicle_status_valid` aceita `discarded`. A exclusão de um rascunho de teste com uma foto passou no navegador, no banco, na auditoria e no R2.
- O código está somente na branch `painel-cadastro-simples`; nenhum deploy ou configuração da Vercel foi alterado nesta entrega.

## Estúdio de artes — conferência pendente no aparelho (06/11/2026)

O estúdio foi reconstruído em torno do destino (Feed, Stories, Status do WhatsApp, TikTok), com a
foto como protagonista e publicação em um toque. O código está no branch
`feat/estudio-artes-destino-primeiro`: suíte verde, tipos e lint limpos. O spec é
`docs/superpowers/specs/2026-11-05-estudio-artes-destino-primeiro-design.md`.

**Quatro conferências só se fazem no aparelho, e nenhuma delas foi feita.** Elas exigem dois
aparelhos físicos (Android/Chrome e iPhone/Safari), o painel por HTTPS, publicação real em conta de
teste e o aceite do dono — nada disso existe no ambiente onde o código foi escrito. O roteiro passo a
passo está em `docs/liberato-inteligente/05-CONFERENCIA-ESTUDIO-ARTES.md`:

1. **Tempo e peso dos quatro arquivos.** O spec trazia "≈300 ms e ≈400 KB cada" como palpite; o
   aviso do §8.2 agora diz que o número não foi medido, em vez de citá-lo como se fosse.
2. **Área segura de cada rede, com o fantasma ligado.** Os números do §5 são ponto de partida
   declarado: nenhuma plataforma publica mapa em pixels, e o do Status do WhatsApp não tem nem guia
   de terceiro atrás. Correção fica em `destinations.ts`, num lugar só.
3. **Limiar de recorte da foto** (`COVER_TOLERANCE`, hoje 0,15), com as fotos de celular em retrato
   do estoque, que são o caso difícil.
4. **Aceite comercial dos selos**, incluindo confirmar com o dono que a perda do tema claro e das
   molduras separadas não custou nada que ele usava.

Dimensão exata dos arquivos (1080 × 1350 no Feed, 1080 × 1920 nos outros três) é requisito do spec e
também só se prova decodificando arquivo baixado de verdade — está no passo 2 do roteiro.

## Limites e melhorias posteriores

- **Corrigido em 06/11/2026:** a afirmação anterior — "a vitrine pública continua lendo o catálogo estático" — estava **errada** e ficou desatualizada neste arquivo. A home usa `listPublicVehiclesWithCover` e a página de detalhe usa `getPublicVehicleWithPhotos`, as duas de `src/server/vehicles/service.ts`, as duas consultando o banco (`vehicles` com `status` público, capa por `vehicle_images`, URL de foto assinada no pedido). A imagem de compartilhamento (`opengraph-image`) lê da mesma fonte. Publicar no painel **coloca** o veículo na vitrine.
- O upload depende da redução de imagem no navegador e do limite de corpo da server action.
- URLs assinadas do R2 expiram em 15 minutos; uma tela aberta por mais tempo pode precisar de recarga.
- Se o `delete` compensatório no R2 falhar, um objeto órfão pode permanecer. A limpeza automática desses órfãos continua pendente.
- A exclusão lógica mantém veículo e auditoria no banco por desenho. Um veículo de teste publicado e depois arquivado não pode ser removido fisicamente.
- A exclusão de um dos sete veículos legados apaga o vínculo com suas fotos estáticas; o importador não restaura esse vínculo. A confirmação é a proteção atual.
- Melhorar a mensagem quando a sessão expira e ampliar a cobertura das mensagens de erro conhecidas.
- O estado local do formulário pode mostrar um valor com a formatação anterior até a próxima recarga se o servidor normalizar um campo.
- A lista ainda pode usar um fallback sem capa quando a assinatura R2 falha; o erro é registrado no servidor.
- As cores das etiquetas de estado usam valores fixos em parte do CSS; podem ser alinhadas aos tokens do painel.

## Segurança da rota

O layout de `(protected)` não é a barreira de autorização no Next 16. Cada operação administrativa passa por `requireAdmin()` no serviço; funções novas devem seguir esse padrão.
