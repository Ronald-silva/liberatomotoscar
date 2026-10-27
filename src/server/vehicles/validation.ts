import { z } from 'zod';

const text = z.string().trim().min(1).max(160);
export const vehicleType = z.enum(['motorcycle', 'car']);
export const vehicleStatus = z.enum(['draft', 'published', 'reserved', 'sold', 'archived', 'discarded']);
export const idSchema = z.uuid();
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

export const draftInput = z.object({ type: vehicleType, slug: slugSchema.optional() }).strict();
export const detailsInput = z.object({
  brand: text.nullable().optional(),
  model: text.nullable().optional(),
  version: text.nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  mileageKm: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
  color: text.nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
}).strict();
export const priceInput = z.number().int().min(0).max(2_147_483_647);
export const versionInput = z.number().int().min(1);

export const allowedStatusTransitions = {
  draft: ['published', 'archived'],
  published: ['reserved', 'sold', 'archived'],
  reserved: ['published', 'sold', 'archived'],
  sold: ['published', 'archived'],
  archived: ['draft'],
  // Terminal: não é destino de nenhuma transição; só a exclusão do rascunho chega aqui.
  discarded: [],
} as const satisfies Record<z.infer<typeof vehicleStatus>, readonly z.infer<typeof vehicleStatus>[]>;

export function assertStatusTransition(current: z.infer<typeof vehicleStatus>, next: z.infer<typeof vehicleStatus>): void {
  if (!(allowedStatusTransitions[current] as readonly string[]).includes(next)) {
    throw new Error('Mudança de estado não permitida.');
  }
}

// Só rascunhos nunca publicados podem ser descartados. Anúncios com histórico
// comercial permanecem arquiváveis, com fotos e auditoria preservadas.
export function isDiscardable(vehicle: { status: string; publishedAt?: Date | null }): boolean {
  return vehicle.status === 'draft' && vehicle.publishedAt == null;
}

type Publishable = { brand: string | null; model: string | null; priceCents: number | null };

// Fonte única do que falta para publicar: o serviço recusa por aqui e a tela mostra a mesma
// lista, item por item, antes de a pessoa tocar em Publicar. Sem isso a regra viveria em dois
// lugares e a tela acabaria mentindo.
export function publishRequirements(vehicle: Publishable, imageCount: number): readonly { label: string; done: boolean }[] {
  return [
    { label: 'Marca', done: Boolean(vehicle.brand?.trim()) },
    { label: 'Modelo', done: Boolean(vehicle.model?.trim()) },
    { label: 'Preço', done: Boolean(vehicle.priceCents && vehicle.priceCents > 0) },
    { label: 'Pelo menos uma foto', done: imageCount >= 1 },
  ];
}

export function assertPublishable(vehicle: Publishable, imageCount: number): void {
  if (publishRequirements(vehicle, imageCount).some((item) => !item.done)) {
    throw new Error('Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto.');
  }
}
