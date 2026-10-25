import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { requireAdmin } from '@/server/authz';
import { getDb } from '@/server/db/client';
import { vehicleAudit, vehicleImages, vehicles } from '@/server/db/schema';
import { createR2Storage, checkPhoto, type PhotoStorage } from '@/server/storage/r2';
import { assertPublishable, assertStatusTransition, detailsInput, draftInput, idSchema, priceInput, slugSchema, vehicleStatus, versionInput } from './validation';

type Vehicle = typeof vehicles.$inferSelect;
type Status = Vehicle['status'];

export class VehicleNotFoundError extends Error { constructor() { super('Veículo não encontrado'); } }
export class StaleVehicleError extends Error { constructor() { super('Este anúncio foi alterado. Recarregue antes de salvar.'); } }

function snapshot(vehicle: Vehicle) {
  const { id, slug, type, brand, model, version, year, mileageKm, color, priceCents, description,
    status, availabilityConfirmedAt, publishedAt, versionNumber } = vehicle;
  return { id, slug, type, brand, model, version, year, mileageKm, color, priceCents, description,
    status, availabilityConfirmedAt, publishedAt, versionNumber };
}

async function audit(tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  vehicle: Vehicle, actorUserId: string, operation: string, before: Vehicle | null,
  detail: Record<string, string> = {}) {
  await tx.insert(vehicleAudit).values({ vehicleId: vehicle.id, actorUserId, operation,
    before: before ? snapshot(before) : null, after: { ...snapshot(vehicle), ...detail } });
}

export async function createDraft(input: unknown) {
  const actor = await requireAdmin();
  const data = draftInput.parse(input);
  const slug = data.slug ?? `veiculo-${randomUUID()}`;
  return getDb().transaction(async (tx) => {
    const [vehicle] = await tx.insert(vehicles).values({ type: data.type, slug }).returning();
    await audit(tx, vehicle, actor.userId, 'created', null);
    return vehicle;
  });
}

export async function getAdminVehicle(id: string) {
  await requireAdmin();
  const [vehicle] = await getDb().select().from(vehicles).where(eq(vehicles.id, idSchema.parse(id))).limit(1);
  if (!vehicle) throw new VehicleNotFoundError();
  const images = await getDb().select().from(vehicleImages).where(eq(vehicleImages.vehicleId, vehicle.id)).orderBy(asc(vehicleImages.position));
  return { vehicle, images };
}

export async function getAdminVehicleBySlug(slug: string) {
  await requireAdmin();
  const [vehicle] = await getDb().select().from(vehicles).where(eq(vehicles.slug, slugSchema.parse(slug))).limit(1);
  if (!vehicle) throw new VehicleNotFoundError();
  return vehicle;
}

export async function getAdminPhotoReadUrl(vehicleId: string, imageId: string,
  storage?: PhotoStorage): Promise<string> {
  await requireAdmin();
  const [image] = await getDb().select().from(vehicleImages)
    .where(and(eq(vehicleImages.vehicleId, idSchema.parse(vehicleId)), eq(vehicleImages.id, idSchema.parse(imageId)))).limit(1);
  if (!image) throw new VehicleNotFoundError();
  if (image.storageProvider === 'legacy_public') return image.storageKey;
  const readUrl = (storage ?? createR2Storage()).signedReadUrl;
  if (!readUrl) throw new Error('Leitura privada de fotos indisponível.');
  return readUrl(image.storageKey);
}

export async function listAdminVehicles() {
  await requireAdmin();
  return getDb().select().from(vehicles).orderBy(desc(vehicles.updatedAt));
}

// Estoque com a foto de capa, em uma única consulta (sem N+1). R2 vira URL assinada de 60 s; legacy_public já é caminho público.
export async function listAdminVehiclesWithCover(storage?: PhotoStorage) {
  await requireAdmin();
  const rows = await getDb().select({ vehicle: vehicles, cover: { storageKey: vehicleImages.storageKey, storageProvider: vehicleImages.storageProvider } })
    .from(vehicles)
    .leftJoin(vehicleImages, and(eq(vehicleImages.vehicleId, vehicles.id), eq(vehicleImages.isCover, true)))
    .orderBy(desc(vehicles.updatedAt));
  const needsSigning = rows.some(({ cover }) => cover?.storageProvider === 'r2');
  const readUrl = needsSigning ? (storage ?? createR2Storage()).signedReadUrl : undefined;
  return Promise.all(rows.map(async ({ vehicle, cover }) => {
    let coverUrl: string | null = null;
    if (cover?.storageProvider === 'legacy_public') coverUrl = cover.storageKey;
    else if (cover && readUrl) coverUrl = await readUrl(cover.storageKey).catch(() => null);
    return { ...vehicle, coverUrl };
  }));
}

const publicStatuses: Status[] = ['published', 'reserved'];
function publicVehicle(vehicle: Vehicle) {
  const { id, slug, type, brand, model, version, year, mileageKm, color, priceCents, description, status, publishedAt } = vehicle;
  return { id, slug, type, brand, model, version, year, mileageKm, color, priceCents, description, status, publishedAt };
}

// Prepared for the later public cutover. The current storefront still reads the static catalog.
export async function listPublicVehicles() {
  const rows = await getDb().select().from(vehicles).where(inArray(vehicles.status, publicStatuses)).orderBy(desc(vehicles.publishedAt));
  return rows.map(publicVehicle);
}

export async function getPublicVehicleBySlug(slug: string) {
  const [row] = await getDb().select().from(vehicles)
    .where(and(eq(vehicles.slug, slugSchema.parse(slug)), inArray(vehicles.status, [...publicStatuses, 'sold']))).limit(1);
  return row ? publicVehicle(row) : null;
}

export async function updateDetails(id: string, expectedVersion: number, input: unknown) {
  const actor = await requireAdmin();
  const data = detailsInput.parse(input);
  if (Object.keys(data).length === 0) throw new Error('Nenhum dado para atualizar.');
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, idSchema.parse(id))).for('update');
    if (!before) throw new VehicleNotFoundError();
    if (before.versionNumber !== versionInput.parse(expectedVersion)) throw new StaleVehicleError();
    const [after] = await tx.update(vehicles).set({ ...data, updatedAt: new Date(), versionNumber: sql`${vehicles.versionNumber} + 1` })
      .where(and(eq(vehicles.id, before.id), eq(vehicles.versionNumber, expectedVersion))).returning();
    if (!after) throw new StaleVehicleError();
    await audit(tx, after, actor.userId, 'details_updated', before);
    return after;
  });
}

export async function updatePrice(id: string, expectedVersion: number, priceCents: unknown) {
  const actor = await requireAdmin();
  const price = priceInput.parse(priceCents);
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, idSchema.parse(id))).for('update');
    if (!before) throw new VehicleNotFoundError();
    if (before.versionNumber !== versionInput.parse(expectedVersion)) throw new StaleVehicleError();
    if (before.status !== 'draft' && before.status !== 'archived' && price === 0) throw new Error('Preço zero não é permitido em anúncio publicado.');
    const [after] = await tx.update(vehicles).set({ priceCents: price, updatedAt: new Date(), versionNumber: sql`${vehicles.versionNumber} + 1` })
      .where(and(eq(vehicles.id, before.id), eq(vehicles.versionNumber, expectedVersion))).returning();
    if (!after) throw new StaleVehicleError();
    await audit(tx, after, actor.userId, 'price_changed', before);
    return after;
  });
}

export async function changeVehicleStatus(id: string, expectedVersion: number, nextStatus: unknown,
  options: { confirmAvailability?: boolean } = {}) {
  const actor = await requireAdmin();
  const status = vehicleStatus.parse(nextStatus);
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, idSchema.parse(id))).for('update');
    if (!before) throw new VehicleNotFoundError();
    if (before.versionNumber !== versionInput.parse(expectedVersion)) throw new StaleVehicleError();
    assertStatusTransition(before.status, status);
    const now = new Date();
    if (status === 'published') {
      if (options.confirmAvailability !== true) throw new Error('Confirme a disponibilidade para publicar.');
      const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(vehicleImages).where(eq(vehicleImages.vehicleId, before.id));
      assertPublishable(before, count.total);
    }
    const [after] = await tx.update(vehicles).set({
      status,
      availabilityConfirmedAt: status === 'published' ? now : before.availabilityConfirmedAt,
      publishedAt: status === 'published' ? (before.publishedAt ?? now) : before.publishedAt,
      updatedAt: now,
      versionNumber: sql`${vehicles.versionNumber} + 1`,
    }).where(and(eq(vehicles.id, before.id), eq(vehicles.versionNumber, expectedVersion))).returning();
    if (!after) throw new StaleVehicleError();
    await audit(tx, after, actor.userId, status === 'published' ? 'published' : status, before);
    return after;
  });
}

export async function addPhoto(id: string, expectedVersion: number, body: Uint8Array, mimeType: string,
  storage?: PhotoStorage) {
  const actor = await requireAdmin();
  checkPhoto(body, mimeType);
  idSchema.parse(id);
  versionInput.parse(expectedVersion);
  const photoStorage = storage ?? createR2Storage();
  const saved = await photoStorage.put(id, body, mimeType);
  try {
    return await getDb().transaction(async (tx) => {
      const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).for('update');
      if (!before) throw new VehicleNotFoundError();
      if (before.versionNumber !== expectedVersion) throw new StaleVehicleError();
      const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(vehicleImages).where(eq(vehicleImages.vehicleId, id));
      const [image] = await tx.insert(vehicleImages).values({ vehicleId: id, storageKey: saved.key,
        storageProvider: 'r2', mimeType: saved.mimeType, sizeBytes: saved.sizeBytes,
        position: count.total, isCover: count.total === 0 }).returning();
      const [after] = await tx.update(vehicles).set({ updatedAt: new Date(), versionNumber: sql`${vehicles.versionNumber} + 1` })
        .where(eq(vehicles.id, id)).returning();
      await audit(tx, after, actor.userId, 'photo_added', before, { imageId: image.id, storageKey: image.storageKey });
      return image;
    });
  } catch (error) {
    try { await photoStorage.delete(saved.key); } catch { /* orphan cleanup is documented */ }
    throw error;
  }
}

export async function removePhoto(vehicleId: string, imageId: string, expectedVersion: number,
  storage?: PhotoStorage) {
  const actor = await requireAdmin();
  idSchema.parse(vehicleId);
  idSchema.parse(imageId);
  versionInput.parse(expectedVersion);
  const removed = await getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update');
    if (!before) throw new VehicleNotFoundError();
    if (before.versionNumber !== expectedVersion) throw new StaleVehicleError();
    const images = await tx.select().from(vehicleImages).where(eq(vehicleImages.vehicleId, vehicleId)).orderBy(asc(vehicleImages.position));
    const image = images.find((item) => item.id === imageId);
    if (!image) throw new VehicleNotFoundError();
    if (before.status !== 'draft' && before.status !== 'archived' && images.length === 1) throw new Error('O anúncio precisa manter uma foto.');
    await tx.delete(vehicleImages).where(eq(vehicleImages.id, imageId));
    if (image.isCover && images.length > 1) {
      const replacement = images.find((item) => item.id !== imageId)!;
      await tx.update(vehicleImages).set({ isCover: true }).where(eq(vehicleImages.id, replacement.id));
    }
    const [after] = await tx.update(vehicles).set({ updatedAt: new Date(), versionNumber: sql`${vehicles.versionNumber} + 1` })
      .where(eq(vehicles.id, vehicleId)).returning();
    await audit(tx, after, actor.userId, 'photo_removed', before, { imageId: image.id, storageKey: image.storageKey });
    return image;
  });
  if (removed.storageProvider === 'r2') {
    try { await (storage ?? createR2Storage()).delete(removed.storageKey); } catch { /* orphan cleanup is documented */ }
  }
  return removed;
}
