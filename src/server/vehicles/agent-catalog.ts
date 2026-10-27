import { and, asc, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { vehicles } from '@/server/db/schema';

const filterText = z.string().trim().min(1).max(80);

export const vehicleSearchInput = z.object({
  type: z.enum(['motorcycle', 'car']).optional(),
  brand: filterText.optional(),
  model: filterText.optional(),
  purpose: filterText.optional(),
  maxPriceCents: z.number().int().positive().max(2_147_483_647).optional(),
  limit: z.number().int().min(1).max(5).default(3),
}).strict();

export const vehicleIdInput = z.object({ id: z.uuid() }).strict();

export type VehicleSearchInput = z.input<typeof vehicleSearchInput>;

const publicFacts = {
  id: vehicles.id,
  slug: vehicles.slug,
  type: vehicles.type,
  brand: vehicles.brand,
  model: vehicles.model,
  version: vehicles.version,
  year: vehicles.year,
  mileageKm: vehicles.mileageKm,
  color: vehicles.color,
  priceCents: vehicles.priceCents,
  versionNumber: vehicles.versionNumber,
} as const;

// A busca comercial tem uma regra própria: reservado continua visível na vitrine,
// mas só publicado pode ser recomendado como disponível pelo assistente.
export function buildAvailableVehicleQuery(db: Pick<ReturnType<typeof getDb>, 'select'>, input: VehicleSearchInput) {
  const filters = vehicleSearchInput.parse(input);
  return db.select(publicFacts).from(vehicles).where(and(
    eq(vehicles.status, 'published'),
    gt(vehicles.priceCents, 0),
    filters.type ? eq(vehicles.type, filters.type) : undefined,
    filters.brand ? sql<boolean>`lower(${vehicles.brand}) = ${filters.brand.toLocaleLowerCase('pt-BR')}` : undefined,
    // strpos treats %, _ and backslashes as ordinary text, unlike LIKE patterns.
    filters.model ? sql<boolean>`strpos(lower(coalesce(${vehicles.model}, '')), ${filters.model.toLocaleLowerCase('pt-BR')}) > 0` : undefined,
    filters.maxPriceCents ? lte(vehicles.priceCents, filters.maxPriceCents) : undefined,
  )).orderBy(asc(vehicles.priceCents), desc(vehicles.updatedAt)).limit(filters.limit);
}

export async function searchAvailableVehicles(input: VehicleSearchInput) {
  const items = await buildAvailableVehicleQuery(getDb(), input);
  return { items, checkedAt: new Date().toISOString() };
}

export async function getVehicleDetails(input: unknown) {
  const { id } = vehicleIdInput.parse(input);
  const [item] = await getDb().select(publicFacts).from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.status, 'published'), gt(vehicles.priceCents, 0))).limit(1);
  return { item: item ?? null, checkedAt: new Date().toISOString() };
}

export async function checkVehicleAvailability(input: unknown) {
  const { id } = vehicleIdInput.parse(input);
  const [row] = await getDb().select({ status: vehicles.status, versionNumber: vehicles.versionNumber })
    .from(vehicles).where(eq(vehicles.id, id)).limit(1);
  return { available: row?.status === 'published', versionNumber: row?.versionNumber ?? null,
    checkedAt: new Date().toISOString() };
}
