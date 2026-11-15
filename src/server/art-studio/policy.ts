import { publishRequirements } from '@/server/vehicles/validation';

/**
 * O que impede a peça de sair — e é **a mesma lista que impede publicar**.
 *
 * Antes eram duas regras independentes, e elas divergiam em dois pontos:
 *
 * 1. A arte exigia `year`, que a publicação não pede e o checklist da tela não mostra. Dava para
 *    publicar um anúncio sem ano, ler "Anúncio publicado", tocar em "Criar arte" e só então
 *    receber "Complete marca, modelo, ano e preço" — um caminho que o painel aceita e depois
 *    recusa, sobre um campo que ele nunca disse ser obrigatório.
 * 2. A arte exigia situação publicada. Isso trancava a ordem natural do trabalho: quem fotografa
 *    e cadastra quer ver a peça antes de decidir publicar, e era obrigado a publicar no escuro.
 *
 * Agora `publishRequirements` é a fonte única: anúncio que pode ser publicado pode gerar arte, e
 * anúncio que ainda não pode ser publicado diz exatamente o que falta — com as mesmas palavras
 * dos dois lugares. O ano voltou a ser o que o cadastro sempre disse que ele era: opcional. Na
 * peça, `buildMetaLine` já omite o que não existe.
 *
 * O que NÃO afrouxou: a trava comercial continua de pé em outro lugar, e é a que importa —
 * `badgesForStatus` não deixa um veículo vendido ou reservado anunciar "Destaque da semana", e
 * `hasPublicPage` impede a legenda de citar um anúncio que responderia 404.
 */
export function artExportProblem(data: {
  vehicle: { status: string; brand: string | null; model: string | null; year: number | null; priceCents: number | null };
  photos: readonly unknown[];
}) {
  const { vehicle, photos } = data;
  const faltando = publishRequirements(vehicle, photos.length)
    .filter((item) => !item.done)
    .map((item) => item.label.toLowerCase());
  if (faltando.length === 0) return null;
  return `Complete no cadastro: ${faltando.join(', ')}.`;
}

/**
 * Situações em que `/veiculos/[slug]` responde (ver `publicStatuses` e `getPublicVehicleBySlug`
 * em `server/vehicles/service.ts`).
 *
 * Existe porque a arte passou a ser gerada antes da publicação: o endereço do anúncio de um
 * rascunho leva a um 404, e mandar o cliente para uma página que não existe é pior do que não
 * mandar link nenhum. A legenda consulta isto antes de citar o anúncio.
 */
const SITUACOES_COM_PAGINA_PUBLICA: readonly string[] = ['published', 'reserved', 'sold'];

export function hasPublicPage(status: string): boolean {
  return SITUACOES_COM_PAGINA_PUBLICA.includes(status);
}
