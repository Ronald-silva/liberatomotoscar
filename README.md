# Liberato Motos Car — prévia comercial

Prévia comercial para a Liberato Motos Car da Itaoca, Fortaleza. A vitrine apresenta sete veículos com fotos e dados de anúncio fornecidos para este projeto. Preço, quilometragem, disponibilidade, configuração e condições devem ser conferidos com a loja antes de uma publicação oficial ou negociação. A prévia permanece com `noindex`.

## Rodar localmente

Requer Node.js compatível com Next.js 16.4.2. O build foi validado com Node 26.8.1 neste ambiente.

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. Para conferir a versão de produção:

```bash
npm run lint
npx tsc --noEmit -p tsconfig.json
npm run build
npm run start
```

## Fluxo da demonstração

1. Abra a página inicial. A marca aparece no topo e o botão principal leva à vitrine.
2. Filtre por motos ou carros. O filtro permanece na URL.
3. Abra um dos sete anúncios em `/veiculos/[slug]`. A página apresenta preço, ano e quilometragem quando informados, descrição, dados do anúncio e especificações de fábrica somente quando a referência técnica é compatível.
4. Use “Consultar veículo”. A mensagem de WhatsApp inclui a referência do anúncio e, quando presentes, as UTMs da visita.

Os três links antigos de conceito (`moto-street`, `moto-adventure` e `carro-sedan`) continuam acessíveis para compatibilidade, separados da vitrine de estoque e identificados como ilustrativos.

Exemplo de URL de campanha: `/?utm_source=meta&utm_medium=cpc&utm_campaign=prospeccao`. A aplicação aceita `utm_source`, `utm_medium`, `utm_campaign` e `utm_content`, sanitiza os valores e os mantém durante a sessão.

## Medição opcional

Copie `.env.example` para `.env.local` e configure os IDs fornecidos pela loja. As tags Meta e Google são carregadas somente após aceitação no aviso de medição. A visita ao detalhe é registrada como `ViewContent`/`view_item`; o clique para WhatsApp como `Contact`/`whatsapp_click`. **Clique não é lead confirmado**. O evento `Lead`/`generate_lead` fica reservado para uma futura confirmação operacional.

Os IDs públicos entram no build. Se forem alterados, execute novo build. Teste os eventos nas ferramentas de diagnóstico das contas antes de publicar.

## Antes de compartilhar o link

Defina `NEXT_PUBLIC_SITE_URL` com o endereço público e refaça o build. Sem ela, a imagem que aparece ao colar o link no WhatsApp aponta para `localhost` e não carrega para ninguém.

## Para transformar em site oficial

- Confirmar com a loja os dados de contato, horário, domínio, redes sociais e autorização de uso da marca.
- Validar os sete anúncios com a loja, inclusive fotos, preços, quilometragens, anos, versões e disponibilidade. Consulte a [matriz de validação](docs/VALIDACAO_CATALOGO.md).
- Conectar o catálogo a uma fonte de estoque e definir quem atualiza os dados.
- Configurar tags, privacidade, domínio e SEO conforme a operação real.
- Integrar o número comercial à WhatsApp Business Platform ou a um provedor compatível caso o atendimento por IA seja contratado. O link `wa.me` sozinho não dá acesso às conversas nem permite automação.
- Fornecer uma sequência de fotos do mesmo veículo para habilitar o visualizador 360° real. Com uma só imagem, a página mostra a foto estática e explica essa limitação.

O roteiro e as etapas estão em [docs/PLANO_EXECUCAO.md](docs/PLANO_EXECUCAO.md).
