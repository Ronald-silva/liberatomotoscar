# P2 — estúdio de artes por veículo

**Objetivo:** botão **Criar arte** no cadastro existente para gerar peça fiel aos dados do anúncio, com edição restrita e exportação de qualidade. Prioridade depois das correções P1. **Não implementado.** Estimativa condicional: 5–10 dias úteis para editor enxuto, 6 templates × 3 tamanhos e QA móvel; aumenta se houver fontes/licenças/marca indefinidas.

## Escopo e decisão técnica

Inclui foto do anúncio, marca/modelo/ano/preço, contato e logotipo aprovados, seleção de foto e enquadramento, texto auxiliar editável, prévia móvel, PNG/JPEG e legenda opcional com IA. Exclui editor gráfico livre, alteração da foto física do veículo com IA, geração de promoção não autorizada, agendamento e publicação automática.

**Escolha:** [React Konva](https://konvajs.org/docs/react/index.html) + templates declarativos. [Konva é MIT e permite uso comercial](https://konvajs.org/docs/faq.html); [react-konva também é MIT e informa compatibilidade com React 19.3](https://github.com/konvajs/react-konva). Exporta PNG/JPEG e admite `pixelRatio` ([documentação](https://konvajs.org/docs/posts/canvas-export-image.html)). Um editor com três controles (foto, recorte, texto) entrega o fluxo necessário sem recriar Canva. Importar somente no cliente para evitar dependência de Canvas no SSR do Next. Biblioteca escolhida não elimina trabalho de composição de templates, tipografia, acessibilidade e testes de exportação.

| Solução | Licença / manutenção | Edição e exportação | Juízo |
| --- | --- | --- | --- |
| React Konva | MIT, documentação e integração React ativas | Controle preciso de layers, toque e PNG/JPEG | **Escolhida** para template guiado, custo de integração moderado. |
| [Fabric.js](https://github.com/fabricjs/fabric.js/blob/master/LICENSE) | MIT, mantida | Editor canvas completo, serialização/exportação | Boa alternativa se edição livre virar requisito; API/migração e controles próprios elevam esforço agora. |
| [TOAST UI Image Editor](https://github.com/nhn/tui.image-editor/blob/master/LICENSE) | MIT, repositório arquivado | Ferramentas gerais de imagem | Não escolher para produto novo devido manutenção e UX pouco específica de anúncio. |
| [Polotno SDK](https://polotno.com/sdk/pricing) | Licença comercial sob cotação | Editor pronto sofisticado | Potencialmente útil para editor avançado; não é escolha open source gratuita para uso comercial. |
| Composição programática no servidor | Licença depende de biblioteca e fontes | Exportação determinística, sem edição visual rica | Boa opção de fallback/lote; só adotar se preview e arquivo final forem idênticos nos testes. |

## Experiência e templates

No editor `src/app/admin/(protected)/veiculos/[id]/VehicleEditor.tsx`, adicionar ação secundária **Criar arte** após dados/fotos salvos. Página nova `.../[id]/arte/page.tsx` busca veículo/fotos com `requireAdmin`. Passos: (1) escolher entre fotos reais e formato; (2) escolher template; (3) ajustar recorte e textos **não factuais**; (4) conferir e baixar. Mostrar alertas se foto insuficiente, preço ausente, contato não aprovado ou anúncio rascunho. O editor atual permanece intacto.

| Formato | Dimensão exata | Exemplos de uso |
| --- | ---: | --- |
| Feed retrato | 1080 × 1350 | Destaque/recém-chegado |
| Quadrado | 1080 × 1080 | Catálogo/post simples |
| Stories | 1080 × 1920 | Chamada vertical |

Templates de dados: **recém-chegado**, **destaque da semana**, **oferta autorizada**, **reservado**, **vendido**, **tradicional**. O template “oferta” exige campo/aprovação explícita de preço promocional e validade antes de exibir desconto; até haver esse dado, mostra apenas preço do cadastro sem alegar redução. “Reservado”/“Vendido” usam badge visível e não exibem CTA “disponível”. O template pode ser baixado sem publicar o anúncio, mas deve indicar “rascunho” na prévia e impedir peça comercial final sem aprovação. Priorizar contraste, margens seguras de plataforma, logo legível, texto curto e hierarquia de preço; validar com identidade visual em `src/app/globals.css`, assets da loja e autorização de marca.

## Dados, arquivos e implementação

Reutilizar `src/server/vehicles/service.ts`, `vehicle_images`/capa, `src/server/storage/r2.ts` e dados da loja em `src/data/store.ts`; criar `src/server/art-studio/vehicle-art-data.ts` e `src/components/art-studio/{ArtEditor,templates,export}.tsx`. O servidor entrega dados aprovados e uma URL de foto válida para edição. **Risco:** URL assinada R2 usada em Canvas pode ser bloqueada por CORS/tainted canvas; verificar CORS oficial do bucket e testar `crossOrigin` antes de carregar, ou criar endpoint same-origin autenticado com streaming e cache control apropriado. Não tornar o bucket público para resolver exportação ([Konva/CORS](https://konvajs.org/docs/posts/Tainted_Canvas.html)). URLs expiram em 15 min: renovar antes de exportar.

Para MVP, nenhuma migration obrigatória: artes baixadas pelo operador não são persistidas. Se houver histórico/template customizado, acrescentar `art_exports` com vehicleId, versão dos dados, template, formato, autor, checksum e timestamp; arquivo gerado só vai ao R2 com política de retenção aprovada. Sempre reconsultar `versionNumber` antes da exportação: se preço/status mudou desde a prévia, bloquear e pedir atualização. Dados factuais (marca, modelo, ano, preço) são bloqueados para digitação livre; só mudam no cadastro auditado. Texto promocional é um campo separado com aprovação humana, nunca substitui preço do banco.

**Legendas com IA (opcional após editor estável):** provider adapter de P0, chamada sob demanda e limitada; prompt recebe fatos estruturados e status, proíbe atributos/garantias/financiamento inventados. Saída exige revisão e botão de copiar, não publica. Registrar tokens/custo sem salvar dados pessoais. Falha do LLM não impede arte manual.

## Testes, aceite, segurança e rollback

Testar matriz 6 templates × 3 formatos com fotos reais autorizadas em dispositivos móvel/desktop: dimensões exatas, PNG/JPEG decodificável, tipografia/acentos, recorte sem distorcer moto/carro, zona segura, sem elementos cortados, status correto. Testar foto expirando/CORS, troca de preço/status durante edição, usuário não admin, tamanho de arquivo e memória em celular. Testes automatizados para mapa de dados/status, dimensões e payload; revisão visual de amostras é necessária. Métricas: falha de exportação, tempo de geração, tamanho e uso por template; sem armazenar imagem ou legenda em logs.

**Aceite:** em até quatro passos, Elton produz e baixa os três formatos de um veículo aprovado; preço/status coincidem com cadastro no instante da exportação; “vendido” não parece oferta; nenhuma foto privada vaza; erro de IA não bloqueia criação. **Rollback:** ocultar ação por flag e remover dependência do bundle em deploy posterior; nenhum dado do estoque é alterado. **Dependências externas:** aprovação da marca/logotipo/contato, fotos com direitos, CORS R2 e eventual custo do modelo. **Incerteza:** desempenho do Canvas e legibilidade em aparelhos do cliente.
