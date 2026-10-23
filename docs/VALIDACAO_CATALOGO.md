# Validação do catálogo — 23/10/2026

## Origem dos registros

O repositório não tinha banco de dados, API de estoque nem sete anúncios anteriores. Havia somente três conceitos ilustrativos no array `src/data/mock-vehicles.ts`, sem preço, ano ou quilometragem. Os sete registros em `src/data/inventory-vehicles.ts` foram criados a partir dos dados informados pelo usuário nesta tarefa. Seus slugs são referências estáveis da prévia; nenhum ID preexistente foi substituído. As três rotas de conceito permanecem acessíveis, fora da nova vitrine.

Os preços e as quilometragens abaixo são valores **informados no anúncio**, não uma consulta ao estoque em tempo real. As fotos foram fornecidas para o projeto. O site não conclui a versão, a conservação nem a presença de equipamentos a partir da aparência das imagens.

## Dados preservados e pendências

| Anúncio | Ano informado | Quilometragem anunciada | Preço anunciado | Confirmar com a loja |
| --- | ---: | ---: | ---: | --- |
| Volkswagen Saveiro Robust | 2024 | 56.000 km | R$ 69.999,00 | Cabine, ano-modelo, equipamentos e disponibilidade |
| Fiat Strada | 2016 | 89.000 km | R$ 67.000,00 | Versão, cabine, motor, câmbio e disponibilidade |
| Honda Fan | 2015 | 84.000 km | R$ 10.990,00 | CG 125 ou CG 150, versão, partida, freios e disponibilidade |
| Honda Titan | 2013 | 70.760 km | R$ 11.500,00 | Versão, cilindrada, partida, freios, rodas e disponibilidade |
| Yamaha Fazer | 2014 | 72.000 km | R$ 10.500,00 | Fazer 150 ou 250, versão e disponibilidade |
| Honda Pop | Não informado | 660 km | R$ 13.700,00 | Ano, versão, partida, câmbio, freios e disponibilidade |
| Yamaha Crosser | Não informado | Não informada | R$ 17.500,00 | Ano, quilometragem, versão, freios/ABS e disponibilidade |

Não há no briefing ano de fabricação separado do ano-modelo. O campo `year` guarda somente o ano informado; `modelYear` não foi preenchido. Nenhuma informação sobre revisões, documentação, sinistros, garantia, proprietários anteriores ou conservação foi adicionada.

## Referências técnicas

- **Saveiro 2024:** a [Volkswagen do Brasil, no lançamento da linha 2024](https://newsroom-br.itd.vw.com.br/news/1914), informa motor EA211 1.6, até 116 cv e 16,1 kgfm, com câmbio manual de cinco marchas para a linha. A [página oficial da Saveiro](https://www.vw.com.br/pt/carros/Saveiro.html) descreve combustível flex. Estes dados aparecem em seção separada como **referência de fábrica**, sem declarar que componentes ou equipamentos da unidade usada foram inspecionados. Capacidade da caçamba, cabine e equipamentos específicos ficaram fora da ficha pública.
- **Strada 2016:** o [manual oficial da Fiat](https://servicos.fiat.com.br/content/dam/fiat/products/handbooks/578/2016/handbook-2016-strada.pdf) cobre diferentes versões. Sem identificar a unidade, a ficha Working 1.4 não foi atribuída a este anúncio.
- **Fan 2015:** a Honda publicou manuais distintos para [CG 125 Fan](https://www.honda.com.br/pos-venda/motos/sites/customer_service_motos/files/manuais/CG%20125%20Fan%202015.pdf) e [CG 150 Fan](https://www.honda.com.br/pos-venda/motos/sites/customer_service_motos/files/manuais/CG%20150%20Fan%202015.pdf). Cilindrada, alimentação e potência não foram atribuídas à unidade sem identificação documental.
- **Titan 2013:** o [histórico técnico oficial da Honda](https://www.honda.com.br/motos/blog/honda-titan-evolucao-tecnica) distingue a CG Titan 150 de 2013 da Titan 160 posterior. A versão da unidade ainda precisa ser confirmada.
- **Fazer 2014:** a [Yamaha identifica a Fazer 150 em 2014](https://www.yamaha-motor.com.br/product/motor-de-partida-crosser-150-factor-125-factor-150-nmax-160-221529), mas o anúncio não confirma se esta unidade é 150 ou 250. Nenhuma das fichas foi aplicada automaticamente.
- **Pop:** a [Honda documenta diferenças entre gerações](https://www.honda.com.br/motos/blog/moto-honda-pop-saiba-mais-sobre-evolucao-do-modelo) e a [nova Pop 110i ES](https://saladeimprensa.honda.com.br/releases/honda-pop-110i-es-2025-ainda-mais-pratica-nova-geracao-traz-motor-inedito-com-partida). Sem ano e versão, partida elétrica, câmbio semiautomático e números de motor foram omitidos.
- **Crosser:** os manuais Yamaha da [XTZ150 2015](https://www.yamaha-motor.com.br/file/general/manual_crosser150_2015.pdf) e [Crosser ABS 2022](https://www.yamaha-motor.com.br/file/general/manual_crosser150_2022.pdf) mostram gerações distintas. O site não atribui ABS nem equipamentos específicos à unidade sem ano e versão.

**Regra de atualização:** acrescentar uma especificação de fábrica somente depois de confirmar ano-modelo e versão da unidade, guardar a fonte e a data de verificação, e manter separada a informação de fábrica do estado atual do seminovo.
