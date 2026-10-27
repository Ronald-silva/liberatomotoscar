import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, getTableColumns, inArray, ne, sql } from 'drizzle-orm';
import { requireAdmin } from '@/server/authz';
import { getDb } from '@/server/db/client';
import { vehicleAudit, vehicleImages, vehicles } from '@/server/db/schema';
import { createR2Storage, checkPhoto, type PhotoStorage } from '@/server/storage/r2';
import { queueR2Cleanup, queueUploadRollback, tryDeleteQueuedR2 } from '@/server/storage/cleanup';
import { assertPublishable, assertStatusTransition, detailsInput, draftInput, idSchema, isDiscardable, priceInput, slugSchema, vehicleStatus, versionInput } from './validation';

type Vehicle = typeof vehicles.$inferSelect;
type Status = Vehicle['status'];

export class VehicleNotFoundError extends Error { constructor() { super('Veículo não encontrado'); } }
export class DiscardedVehicleError extends Error { constructor() { super('Este anúncio foi excluído.'); } }
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

type StoredPhotoRef = { storageKey: string; storageProvider: 'r2' | 'legacy_public' };

// Resolve URL de leitura sem tocar no banco: legacy_public já é caminho público e a assinatura
// do R2 é cálculo local. Um cliente serve o lote inteiro; sem nenhuma foto em r2, nenhum é criado.
// Falha ao assinar vira foto vazia em vez de derrubar a tela.
function photoUrlResolver(refs: readonly (StoredPhotoRef | null | undefined)[], storage?: PhotoStorage) {
  let readUrl: PhotoStorage['signedReadUrl'];
  try {
    readUrl = refs.some((ref) => ref?.storageProvider === 'r2')
      ? (storage ?? createR2Storage()).signedReadUrl
      : undefined;
  } catch {
    // A vitrine continua acessível se a configuração do R2 não estiver no
    // processo local; cada foto R2 vira indisponível, sem esconder o anúncio.
    readUrl = undefined;
  }
  return async (ref: StoredPhotoRef | null | undefined): Promise<string | null> => {
    if (!ref) return null;
    if (ref.storageProvider === 'legacy_public') return ref.storageKey;
    if (!readUrl) return null;
    return readUrl(ref.storageKey).catch(() => null);
  };
}

// Veículo e fotos prontas para a tela: uma autorização e duas consultas em paralelo.
// As URLs saem das imagens já carregadas — antes cada foto custava outra autorização e outro
// select da mesma linha. No caso de veículo inexistente a consulta de imagens é desperdiçada,
// troca barata por um round-trip a menos em toda abertura normal.
export async function getAdminVehicle(id: string, storage?: PhotoStorage) {
  await requireAdmin();
  const vehicleId = idSchema.parse(id);
  const db = getDb();
  const [found, images] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1),
    db.select().from(vehicleImages).where(eq(vehicleImages.vehicleId, vehicleId)).orderBy(asc(vehicleImages.position)),
  ]);
  const [vehicle] = found;
  if (!vehicle) throw new VehicleNotFoundError();
  const photoUrl = photoUrlResolver(images, storage);
  const photos = await Promise.all(images.map(async (image) => ({
    id: image.id, isCover: image.isCover, url: await photoUrl(image),
  })));
  return { vehicle, photos };
}

export async function getAdminVehicleBySlug(slug: string) {
  await requireAdmin();
  const [vehicle] = await getDb().select().from(vehicles).where(eq(vehicles.slug, slugSchema.parse(slug))).limit(1);
  if (!vehicle) throw new VehicleNotFoundError();
  return vehicle;
}

export async function listAdminVehicles() {
  await requireAdmin();
  return getDb().select().from(vehicles).orderBy(desc(vehicles.updatedAt));
}

// Estoque com a foto de capa, em uma única consulta (sem N+1). R2 vira URL assinada de curta duração; legacy_public já é caminho público.
// Sem estado pedido, o descartado fica de fora: o rascunho jogado fora sai do estoque, mas segue acessível se pedido de forma explícita.
export async function listAdminVehiclesWithCover(options: { status?: Status; storage?: PhotoStorage } = {}) {
  await requireAdmin();
  const { status, storage } = options;
  const rows = await getDb().select({ vehicle: vehicles, cover: { storageKey: vehicleImages.storageKey, storageProvider: vehicleImages.storageProvider } })
    .from(vehicles)
    .leftJoin(vehicleImages, and(eq(vehicleImages.vehicleId, vehicles.id), eq(vehicleImages.isCover, true)))
    .where(status ? eq(vehicles.status, status) : ne(vehicles.status, 'discarded'))
    .orderBy(desc(vehicles.updatedAt));
  const photoUrl = photoUrlResolver(rows.map(({ cover }) => cover), storage);
  return Promise.all(rows.map(async ({ vehicle, cover }) => ({ ...vehicle, coverUrl: await photoUrl(cover) })));
}

// Um único group by; os estados sem veículo entram com zero para a tela não ter de adivinhar chaves ausentes.
export async function countAdminVehiclesByStatus(): Promise<Record<Status, number>> {
  await requireAdmin();
  const rows = await getDb().select({ status: vehicles.status, total: sql<number>`count(*)::int` }).from(vehicles).groupBy(vehicles.status);
  const counts = Object.fromEntries(vehicleStatus.options.map((status) => [status, 0])) as Record<Status, number>;
  for (const { status, total } of rows) counts[status] = total;
  return counts;
}

const publicStatuses: Status[] = ['published', 'reserved'];
function publicVehicle(vehicle: Vehicle) {
  const { id, slug, type, brand, model, version, year, mileageKm, color, priceCents, description, status, publishedAt } = vehicle;
  return { id, slug, type, brand, model, version, year, mileageKm, color, priceCents, description, status, publishedAt };
}

export async function listPublicVehicles() {
  const rows = await getDb().select().from(vehicles).where(inArray(vehicles.status, publicStatuses)).orderBy(desc(vehicles.publishedAt));
  return rows.map(publicVehicle);
}

// A vitrine só recebe veículos visíveis e sua capa. Fotos privadas do R2 são
// assinadas no pedido, sem persistir URLs que expiram em uma página estática.
export async function listPublicVehiclesWithCover(storage?: PhotoStorage) {
  const rows = await getDb().select({ vehicle: vehicles, cover: {
    storageKey: vehicleImages.storageKey, storageProvider: vehicleImages.storageProvider,
  } }).from(vehicles).leftJoin(vehicleImages,
    and(eq(vehicleImages.vehicleId, vehicles.id), eq(vehicleImages.isCover, true)))
    .where(inArray(vehicles.status, publicStatuses)).orderBy(desc(vehicles.publishedAt));
  const photoUrl = photoUrlResolver(rows.map(({ cover }) => cover), storage);
  return Promise.all(rows.map(async ({ vehicle, cover }) => ({
    ...publicVehicle(vehicle), image: await photoUrl(cover),
  })));
}

export async function getPublicVehicleWithPhotos(slug: string, storage?: PhotoStorage) {
  const vehicle = await getPublicVehicleBySlug(slug);
  if (!vehicle) return null;
  const images = await getDb().select({ storageKey: vehicleImages.storageKey,
    storageProvider: vehicleImages.storageProvider }).from(vehicleImages)
    .where(eq(vehicleImages.vehicleId, vehicle.id)).orderBy(asc(vehicleImages.position));
  const photoUrl = photoUrlResolver(images, storage);
  const urls = (await Promise.all(images.map(photoUrl))).filter((url): url is string => Boolean(url));
  return { ...vehicle, images: urls };
}

export async function getPublicVehicleBySlug(slug: string) {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  const [row] = await getDb().select().from(vehicles)
    .where(and(eq(vehicles.slug, parsed.data), inArray(vehicles.status, [...publicStatuses, 'sold']))).limit(1);
  return row ? publicVehicle(row) : null;
}

// Dados e preço na mesma transação: um "Salvar" na tela, uma versão nova, e nunca o estado
// intermediário de ter salvo um e não o outro. A auditoria continua separando o que mudou —
// 'details_updated' e 'price_changed' —, porque histórico de preço vale por si.
// priceCents indefinido deixa o preço como está; campo vazio na tela significa isso.
export async function updateVehicle(id: string, expectedVersion: number,
  input: { details: unknown; priceCents?: number }) {
  const actor = await requireAdmin();
  const data = detailsInput.parse(input.details);
  const price = input.priceCents === undefined ? undefined : priceInput.parse(input.priceCents);
  if (Object.keys(data).length === 0 && price === undefined) throw new Error('Nenhum dado para atualizar.');
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, idSchema.parse(id))).for('update');
    if (!before) throw new VehicleNotFoundError();
    if (before.status === 'discarded') throw new DiscardedVehicleError();
    if (before.versionNumber !== versionInput.parse(expectedVersion)) throw new StaleVehicleError();
    if (price === 0 && before.status !== 'draft' && before.status !== 'archived') {
      throw new Error('Preço zero não é permitido em anúncio publicado.');
    }
    const [after] = await tx.update(vehicles).set({
      ...data,
      ...(price === undefined ? {} : { priceCents: price }),
      updatedAt: new Date(),
      versionNumber: sql`${vehicles.versionNumber} + 1`,
    }).where(and(eq(vehicles.id, before.id), eq(vehicles.versionNumber, expectedVersion)))
      // A contagem vai no próprio UPDATE: sem consulta extra, e a tela recalcula o que falta para publicar.
      .returning({ ...getTableColumns(vehicles),
        imageCount: sql<number>`(select count(*)::int from ${vehicleImages} where ${vehicleImages.vehicleId} = ${before.id})` });
    if (!after) throw new StaleVehicleError();
    // A tela grava sozinha enquanto ele digita e sempre manda todos os campos; auditar toda chamada
    // lotaria uma tabela append-only (um gatilho impede apagar) de linhas idênticas. Só conta o que
    // mudou de valor: chave ausente (undefined) é "não mencionado", e null explícito é um valor.
    const detailsChanged = Object.entries(data).some(([key, value]) => value !== undefined && value !== before[key as keyof typeof data]);
    if (detailsChanged) await audit(tx, after, actor.userId, 'details_updated', before);
    if (price !== undefined && price !== before.priceCents) await audit(tx, after, actor.userId, 'price_changed', before);
    return after;
  });
}

export async function changeVehicleStatus(id: string, expectedVersion: number, nextStatus: unknown,
  options: { confirmAvailability?: boolean; confirmSale?: boolean } = {}) {
  const actor = await requireAdmin();
  const status = vehicleStatus.parse(nextStatus);
  // Descartar apaga arquivos e dados do rascunho; não pode ser só uma troca de estado.
  if (status === 'discarded') throw new Error('Use a exclusão do rascunho.');
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
    if (status === 'sold' && options.confirmSale !== true) throw new Error('Confirme a venda antes de marcar o anúncio como vendido.');
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
      // Checado antes da versão: um excluído nunca volta a aceitar foto, seja qual for a versão enviada.
      if (before.status === 'discarded') throw new DiscardedVehicleError();
      if (before.versionNumber !== expectedVersion) throw new StaleVehicleError();
      const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(vehicleImages).where(eq(vehicleImages.vehicleId, id));
      const [image] = await tx.insert(vehicleImages).values({ vehicleId: id, storageKey: saved.key,
        storageProvider: 'r2', mimeType: saved.mimeType, sizeBytes: saved.sizeBytes,
        position: count.total, isCover: count.total === 0 }).returning();
      const [after] = await tx.update(vehicles).set({ updatedAt: new Date(), versionNumber: sql`${vehicles.versionNumber} + 1` })
        .where(eq(vehicles.id, id)).returning();
      await audit(tx, after, actor.userId, 'photo_added', before, { imageId: image.id, storageKey: image.storageKey });
      // vehicleVersion acompanha a imagem para a tela poder enviar a foto seguinte sem recarregar:
      // cada foto incrementa a versão do veículo, e a próxima precisa da versão nova.
      return { ...image, vehicleVersion: after.versionNumber };
    });
  } catch (error) {
    try { await photoStorage.delete(saved.key); }
    catch {
      try { await queueUploadRollback(saved.key); }
      catch { console.error('Falha ao registrar limpeza R2 de upload rejeitado.'); }
    }
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
    if (before.status === 'discarded') throw new DiscardedVehicleError();
    if (before.versionNumber !== expectedVersion) throw new StaleVehicleError();
    const images = await tx.select().from(vehicleImages).where(eq(vehicleImages.vehicleId, vehicleId)).orderBy(asc(vehicleImages.position));
    const image = images.find((item) => item.id === imageId);
    if (!image) throw new VehicleNotFoundError();
    if (before.status !== 'draft' && before.status !== 'archived' && images.length === 1) throw new Error('O anúncio precisa manter uma foto.');
    await tx.delete(vehicleImages).where(eq(vehicleImages.id, imageId));
    if (image.storageProvider === 'r2') await queueR2Cleanup(tx, image.storageKey, 'photo_removed');
    if (image.isCover && images.length > 1) {
      const replacement = images.find((item) => item.id !== imageId)!;
      await tx.update(vehicleImages).set({ isCover: true }).where(eq(vehicleImages.id, replacement.id));
    }
    const [after] = await tx.update(vehicles).set({ updatedAt: new Date(), versionNumber: sql`${vehicles.versionNumber} + 1` })
      .where(eq(vehicles.id, vehicleId)).returning();
    await audit(tx, after, actor.userId, 'photo_removed', before, { imageId: image.id, storageKey: image.storageKey });
    return { ...image, vehicleVersion: after.versionNumber };
  });
  if (removed.storageProvider === 'r2') {
    try { await tryDeleteQueuedR2(removed.storageKey, storage ?? createR2Storage()); }
    catch { console.error('Falha ao processar limpeza R2 de foto removida.'); }
  }
  return removed;
}

// Exclusão lógica: o veículo e a auditoria ficam; as fotos R2 entram na fila
// transacional e só são excluídas depois do commit.
export async function discardDraft(vehicleId: string, expectedVersion: number, storage?: PhotoStorage) {
  const actor = await requireAdmin();
  idSchema.parse(vehicleId);
  versionInput.parse(expectedVersion);
  const result = await getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update');
    if (!before) throw new VehicleNotFoundError();
    if (before.versionNumber !== expectedVersion) throw new StaleVehicleError();
    if (!isDiscardable(before)) throw new Error('Só é possível excluir rascunhos que nunca foram publicados.');
    const removed = await tx.select().from(vehicleImages).where(eq(vehicleImages.vehicleId, vehicleId));
    await tx.delete(vehicleImages).where(eq(vehicleImages.vehicleId, vehicleId));
    for (const image of removed) {
      if (image.storageProvider === 'r2') await queueR2Cleanup(tx, image.storageKey, 'draft_discarded');
    }
    const [after] = await tx.update(vehicles).set({ status: 'discarded', updatedAt: new Date(), versionNumber: sql`${vehicles.versionNumber} + 1` })
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.versionNumber, expectedVersion))).returning();
    if (!after) throw new StaleVehicleError();
    await audit(tx, after, actor.userId, 'discarded', before);
    return { removed, versionNumber: after.versionNumber };
  });
  for (const image of result.removed) {
    if (image.storageProvider !== 'r2') continue;
    try { await tryDeleteQueuedR2(image.storageKey, storage ?? createR2Storage()); }
    catch { console.error('Falha ao processar limpeza R2 de rascunho descartado.'); }
  }
  return { status: 'discarded' as const, versionNumber: result.versionNumber };
}

// O índice único parcial vehicle_images_one_cover_uidx admite uma capa por veículo, então a atual
// é desmarcada ANTES de marcar a nova; inverter a ordem violaria o índice no meio da transação.
export async function setCoverPhoto(vehicleId: string, imageId: string, expectedVersion: number) {
  const actor = await requireAdmin();
  idSchema.parse(vehicleId);
  idSchema.parse(imageId);
  versionInput.parse(expectedVersion);
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update');
    if (!before) throw new VehicleNotFoundError();
    // Checado antes da versão: um excluído nunca volta a aceitar escrita, seja qual for a versão enviada.
    if (before.status === 'discarded') throw new DiscardedVehicleError();
    if (before.versionNumber !== expectedVersion) throw new StaleVehicleError();
    const [image] = await tx.select().from(vehicleImages)
      .where(and(eq(vehicleImages.id, imageId), eq(vehicleImages.vehicleId, vehicleId)));
    if (!image) throw new VehicleNotFoundError();
    await tx.update(vehicleImages).set({ isCover: false })
      .where(and(eq(vehicleImages.vehicleId, vehicleId), eq(vehicleImages.isCover, true)));
    await tx.update(vehicleImages).set({ isCover: true }).where(eq(vehicleImages.id, imageId));
    const [after] = await tx.update(vehicles).set({ updatedAt: new Date(), versionNumber: sql`${vehicles.versionNumber} + 1` })
      .where(eq(vehicles.id, vehicleId)).returning();
    await audit(tx, after, actor.userId, 'cover_changed', before, { imageId });
    // Mesmo formato de addPhoto: o cliente encadeia a próxima operação com esta versão.
    return { vehicleVersion: after.versionNumber };
  });
}
