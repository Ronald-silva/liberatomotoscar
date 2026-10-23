# Liberato Motos Car — prévia comercial

Site demonstrativo para prospecção da Liberato Motos Car da Itaoca, Fortaleza. A vitrine apresenta **conceitos ilustrativos**, não veículos em estoque. O telefone, a marca e o endereço vieram dos materiais enviados para este projeto; dados comerciais devem ser validados com a loja antes da publicação oficial.

## Rodar localmente

Requer Node.js compatível com Next.js 16.4.2. No ambiente de desenvolvimento, foi usado Node 22.

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
3. Abra um conceito em `/veiculos/[slug]`. A página apresenta uma imagem e informa que o veículo é ilustrativo.
4. Use “Consultar opções”. A mensagem de WhatsApp inclui o assunto e, quando presentes, as UTMs da visita.

Exemplo de URL de campanha: `/?utm_source=meta&utm_medium=cpc&utm_campaign=prospeccao`. A aplicação aceita `utm_source`, `utm_medium`, `utm_campaign` e `utm_content`, sanitiza os valores e os mantém durante a sessão.

## Medição opcional

Copie `.env.example` para `.env.local` e configure os IDs fornecidos pela loja. As tags Meta e Google são carregadas somente após aceitação no aviso de medição. A visita ao detalhe é registrada como `ViewContent`/`view_item`; o clique para WhatsApp como `Contact`/`whatsapp_click`. **Clique não é lead confirmado**. O evento `Lead`/`generate_lead` fica reservado para uma futura confirmação operacional.

Os IDs públicos entram no build. Se forem alterados, execute novo build. Teste os eventos nas ferramentas de diagnóstico das contas antes de publicar. A prévia está com `noindex` para evitar indexação de conteúdo ilustrativo.

## Para transformar em site oficial

- Confirmar com a loja os dados de contato, horário, domínio, redes sociais e autorização de uso da marca.
- Trocar os conceitos por fotos, disponibilidade, preços e fichas reais aprovadas.
- Conectar o catálogo a uma fonte de estoque e definir quem atualiza os dados.
- Configurar tags, privacidade, domínio e SEO conforme a operação real.
- Integrar o número comercial à WhatsApp Business Platform ou a um provedor compatível caso o atendimento por IA seja contratado. O link `wa.me` sozinho não dá acesso às conversas nem permite automação.
- Fornecer uma sequência de fotos do mesmo veículo para habilitar o visualizador 360° real. Com uma só imagem, a página mostra a foto estática e explica essa limitação.

O roteiro e as etapas estão em [docs/PLANO_EXECUCAO.md](docs/PLANO_EXECUCAO.md).
