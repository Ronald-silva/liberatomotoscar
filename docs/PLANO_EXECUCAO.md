# Plano de execução — Liberato Motos Car

## Estado da prévia em 22/10/2026

O conceito navegável foi implementado. A página inicial usa a marca recebida, imagens locais ilustrativas, vitrine com filtros de motos e carros, seção de experiência, endereço da Itaoca e contato por WhatsApp. Há três páginas de detalhe com URL própria e aviso explícito de que os veículos não representam estoque real. A prévia está com `noindex`.

O fluxo de campanha já preserva UTMs na sessão e acrescenta a origem à mensagem de WhatsApp. A camada de eventos distingue visualização do detalhe, clique de contato e lead confirmado; Meta e Google só são carregados se houver IDs configurados e consentimento. Nenhuma tag ou atendimento automatizado está ativo sem credenciais e validação operacional.

`lint`, TypeScript e build de produção passaram. A inspeção no navegador confirmou os filtros, a navegação, a mensagem com UTMs e ausência de erros de página ou rolagem horizontal em desktop e celular. Antes de apresentar a prévia como site oficial, faltam fotos e dados de estoque autorizados, revisão da loja, configuração de medição e publicação aprovada. O 360° permanece desativado até haver fotos de múltiplos ângulos do mesmo veículo.

Após o reinício do computador, a prévia foi revalidada em 22/10/2026 com Node 26.8.1: `lint`, TypeScript e build passaram. No Chrome, o fluxo de filtro, detalhe e WhatsApp passou em 1440 e 390 px. A atribuição foi corrigida para que uma nova visita com UTMs parciais substitua a campanha anterior na mesma aba. O [roteiro de apresentação](./APRESENTACAO_PREVIA.md) está pronto para a reunião.

## Objetivo

Criar uma apresentação navegável que ajude a conquistar a Liberato Motos Car como cliente e sirva de base para um site comercial real. A demonstração deve mostrar qualidade visual, facilidade para encontrar veículos, origem de campanha preservada e um caminho curto até o atendimento por WhatsApp.

## Referência da loja e decisões pendentes

- A captura do perfil do Google enviada pelo usuário identifica **Liberato motos car**, na **R. Elcias Lopes, 334, loja A, Itaoca, Fortaleza/CE, CEP 60421-100**, telefone **(85) 99636-5664**. Esses são os dados de referência para o projeto.
- O usuário enviou uma [referência inicial da marca](./assets/logo-liberato-referencia.png), com silhueta de moto, lettering preto e vermelho, a frase **“Compra, venda e troca”** e o mesmo telefone. Depois, adicionou duas versões maiores do logo em [`public/logo.jpeg`](../public/logo.jpeg) e [`public/logosf.png`](../public/logosf.png). As versões em `public` trazem a marca sem slogan e telefone.
- A mesma captura mostra **5,0 com duas avaliações** e lista financiamento, Honda, vendas on-line e Yamaha em “Serviços”. A nota e a quantidade de avaliações podem mudar; as categorias do perfil não comprovam condições de crédito nem parcerias. Verificar os dados novamente antes de publicá-los.
- O usuário confirmou que a Liberato Motos Car da Itaoca não tem vínculo com a loja de nome semelhante em Bom Jardim. Não usar conteúdo, domínio, estoque ou identidade visual dessa outra empresa neste projeto.
- Confirmar com a loja horário, Instagram, domínio e autorização para usar telefone e endereço na prévia pública. `public/logo.jpeg` tem fundo claro; `public/logosf.png` agora tem **transparência real** (PNG RGBA, 2000 × 2000 px). Como as partes pretas do logo perdem contraste sobre grafite, aplicar o PNG em uma superfície clara ou criar uma versão invertida aprovada pela marca. O arquivo tem margens transparentes amplas; ajustar a área visual na composição.
- Confirmar se o estoque inclui carros, motos ou ambos e obter fotos, preços, especificações e condições comerciais autorizadas.
- A versão de prospecção pode usar conteúdo ilustrativo claramente identificado. Garantias, aprovação de crédito e parcelas exigem comprovação e aprovação da loja.

## Diagnóstico do repositório em 22/10/2026

- Base: Next.js 16.4.2, React 19.3, Tailwind 4, TypeScript e componentes para cabeçalho, hero, vitrine e visualizador.
- O visualizador anuncia 360°, mas suas 12 posições usam a mesma URL; não há rotação visual real.
- Os quatro veículos, preços e parcelas são fictícios. Imagens vêm do Unsplash, e o telefone de WhatsApp da captura está fixo em dois componentes.
- O cabeçalho informa “Montese”, enquanto a captura situa a loja em Itaoca; ajustar a localização exibida e substituir o ícone provisório “L” pelo logotipo real, com contraste adequado.
- A página ainda não tem identidade oficial, detalhes de veículo, credibilidade comprovada, seção de localização, rodapé ou estados de estoque vazio.
- Metadados, idioma `en`, favicon, SVGs e README ainda são do projeto inicial.
- As diretrizes atualizadas pedem UTMs, eventos Meta/Google e atendimento por IA. Ainda não há no código captura de UTMs, camada de eventos, tags configuradas, backend de WhatsApp ou agente ativo.
- TypeScript passa; lint tem oito avisos. O build falha neste ambiente ao buscar Geist no Google Fonts e também alerta sobre o processamento de `@theme` no CSS. É preciso diagnosticar e resolver ambos antes da entrega.

## Direção criativa

**Estúdio Automotivo:** fotografia dominante, grafite profundo `#07090E`, branco quente e vermelho alinhado ao logotipo recebido. O lettering angular e inclinado do logo inspira títulos de presença, enquanto as especificações usam tipografia simples e legível. A composição editorial dará espaço para os veículos respirarem; superfícies translúcidas serão usadas onde melhoram a leitura. O elemento de destaque será um veículo apresentado como peça de catálogo, com detalhes exploráveis. Movimento terá função e respeitará preferência por movimento reduzido.

Antes de implementar novos componentes, definir um sistema único de cores, tipografia, espaçamento, bordas e duração das transições. Preservar o caráter escuro pedido no PRD, com menos efeitos simultâneos para dar mais destaque às fotos.

## Escopo da demonstração

1. **Entrada:** hero com promessa comercial curta, foto real ou imagem ilustrativa identificada, CTA para explorar o estoque e contato visível.
2. **Vitrine:** Bento Grid com filtros de motos e carros somente se ambas as categorias existirem; cards com dados legíveis, preço quando confirmado e CTA que identifica o veículo na mensagem.
3. **Detalhes:** página ou painel acessível com galeria, ficha técnica, diferenciais comprovados, disponibilidade e contato. Endereço compartilhável para cada veículo.
4. **Confiança:** seção com fatos verificáveis sobre loja, atendimento e procedência; avaliações apenas se houver fonte pública e autorização de uso.
5. **Localização e contato:** endereço confirmado, mapa ou link de rota, horário e WhatsApp. Rodapé com identificação correta da empresa.
6. **Apresentação comercial:** roteiro curto mostrando entrada, descoberta de veículo, interesse por WhatsApp e como o lojista atualizaria o conteúdo após contratar.

## Aquisição e mensuração

- Capturar `utm_source`, `utm_medium`, `utm_campaign` e `utm_content` da URL, preservar o contexto durante a navegação e acrescentar os valores presentes à mensagem pré-formatada de WhatsApp junto ao identificador e nome do veículo. Limitar tamanho e caracteres dos parâmetros antes de exibi-los ou enviá-los.
- Centralizar a construção dos links de WhatsApp e o disparo de eventos para evitar mensagens e medições divergentes entre cabeçalho, cards e página de detalhe.
- Mapear **visita ao detalhe** e **clique para abrir WhatsApp** como ações diferentes. Um clique mede intenção de contato; não comprova que a pessoa enviou uma mensagem ou se tornou lead.
- Preparar uma camada de eventos com parâmetros de veículo e campanha. Em Meta, prever `ViewContent` no detalhe e `Contact` no clique de contato; disparar `Lead` somente quando houver confirmação de lead pela operação. Em Google, prever `view_item` no detalhe, um evento de clique de WhatsApp e `generate_lead` apenas quando a geração do lead for comprovada.
- Ativar Meta Pixel e Google Tag apenas quando a loja fornecer propriedades/IDs, finalidade de medição e configuração de privacidade apropriada. Validar eventos nos painéis de teste e impedir duplicações.

### Atendimento por IA — etapa de integração

O link `wa.me` abre o WhatsApp do visitante, mas o site não recebe as mensagens dessa conversa. Para atendimento automatizado 24/7, validar com a loja uma integração do número comercial à WhatsApp Business Platform ou a um provedor compatível, com recebimento de mensagens por webhook, persistência segura, fluxo de atendimento e transferência para um humano.

O primeiro teste do agente deve usar conversas de exemplo anonimizadas e uma tarefa delimitada: identificar veículo, interesse em financiamento, valor de entrada e existência de veículo para troca. Regras de preço, crédito, elegibilidade e autorização de ações ficam fora da decisão do modelo. O agente deve pedir dados faltantes, sinalizar incerteza e encaminhar para humano quando necessário. Medir acerto, encaminhamentos incorretos, latência e custo antes de conectar ao atendimento real.

Referências técnicas para a implementação: [eventos recomendados do Google](https://developers.google.com/tag-platform/gtagjs/reference/events), [Cloud API da Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) e [webhooks da WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks).

### Decisão sobre 360°

O 360° real depende de uma sequência consistente de fotos do mesmo veículo, tiradas em ângulos regulares. Se esse material não estiver disponível, usar uma galeria excelente ou vídeo curto no pitch. Só mostrar a interação 360° quando houver imagens que comprovem a rotação.

## Etapas de execução

| Etapa | Entrega | Critério para avançar |
| --- | --- | --- |
| 1. Alinhamento | Aplicação do logo recebido, canais e amostra de estoque validados; separação entre conteúdo real e ilustrativo | Nome, endereço e telefone corretos; direitos de uso das imagens definidos |
| 2. Conceito | Referências, texto principal, fluxo do comprador, wireframe mobile e desktop, tokens visuais | Uma direção aprovada para orientar todas as telas |
| 3. Base técnica | Build estável, CSS e fontes resolvidos, metadados em português, estrutura de dados e rotas de veículos | `build`, TypeScript e lint sem falhas relevantes |
| 4. Interface e aquisição | Hero, vitrine, detalhes, confiança, contato, UTMs, mensagem contextual, eventos e estados vazio/erro | Fluxo completo do anúncio até o clique no WhatsApp em mobile e desktop |
| 5. Validação | Revisão visual, teclado e leitor de tela, toque, imagens, SEO, desempenho e eventos | Sem conteúdo fictício apresentado como fato; sem problemas críticos de navegação, layout ou atribuição |
| 6. Pitch | Link de prévia, roteiro de demonstração e lista clara do que falta para produção e para a IA | Apresentação pronta para o proprietário, com próximos passos comerciais explícitos |
| 7. Integração de atendimento | Teste isolado do canal oficial e qualificação de leads; piloto com transferência humana | Avançar à produção somente com acesso autorizado, avaliação de qualidade, custo e falhas |

**Cadência sugerida:** primeiro um conceito navegável com hero, vitrine e um detalhe de veículo; depois ampliar as seções e validar. Com fotos e dados dos veículos disponíveis, planejar aproximadamente uma semana de trabalho para a prévia. Revisar a estimativa após conhecer os materiais e a necessidade de 360° real.

## Roteiro de prospecção

1. Abrir a prévia no celular e mostrar a identidade da loja nos primeiros segundos.
2. Abrir a prévia com UTMs de exemplo, escolher um veículo, conferir fotos e dados, e mostrar a mensagem de WhatsApp contextualizada com veículo e origem da campanha.
3. Mostrar como o mesmo fluxo funciona para motos e carros, se ambas as linhas fizerem parte do negócio.
4. Explicar como fotos, estoque e condições seriam mantidos atualizados na operação real.
5. Encerrar com uma proposta objetiva: escopo da versão pública, materiais necessários, prazo, investimento e quem aprova o conteúdo.

O resultado desejado da reunião é uma decisão sobre avançar para a versão pública ou agendar uma revisão com quem aprova marca e estoque. A prévia deve abrir rápido e funcionar durante uma demonstração presencial, inclusive em conexão móvel. O atendimento por IA será apresentado como etapa de integração e validação, sem simular que o número já está conectado a um agente.

## Medição e critérios de qualidade

- Medir visualizações da vitrine, abertura de detalhe e cliques no WhatsApp, por veículo e origem da campanha, quando a versão for publicada com autorização.
- Usar uma mensagem de WhatsApp curta e contextual, sem pedir dados pessoais no site para a primeira conversa.
- Testar larguras de 375, 390, 768 e 1440 px; navegação por teclado; foco visível; controles de toque; carregamento lento e estoque vazio.
- A meta de Lighthouse 90+ do PRD será avaliada na prévia com imagens finais, além de revisar a experiência real no celular. Registrar resultados em vez de prometer pontuação antecipadamente.
- A versão pública exige revisão final de estoque, preços, parcelas, telefone, endereço, provas sociais e textos comerciais pela loja.

## Fora da primeira entrega

Painel administrativo, integração automática de estoque, CRM, simulador de crédito com valores vinculantes e 360° para todos os veículos. Esses itens entram apenas se houver necessidade e material operacional para mantê-los corretos. O agente de IA tem uma etapa própria após o pitch e não deve ser anunciado como ativo antes de integrar e validar o canal.

## Ordem recomendada para começar

1. Usar a loja da captura e os logos em `public` como referência; coletar horário, Instagram, domínio e confirmação de quais dados podem aparecer na prévia.
2. Receber 3 a 6 veículos representativos com fotos e informações autorizadas, ou assumir uma demonstração marcada como ilustrativa.
3. Resolver o build e produzir a primeira direção visual com uma página inicial e um detalhe de veículo.
4. Revisar a prévia, completar as demais seções e preparar o roteiro de prospecção.
