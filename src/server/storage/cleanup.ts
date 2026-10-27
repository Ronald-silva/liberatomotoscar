import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { storageCleanupJobs, vehicleImages } from '@/server/db/schema';
import { createR2Storage, isR2PhotoKey, type PhotoStorage, type R2PhotoStorage } from './r2';

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
type CleanupReason = typeof storageCleanupJobs.$inferInsert.reason;

function configuredBucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error('R2_BUCKET não configurado.');
  return bucket;
}

export async function queueR2Cleanup(tx: Tx, key: string, reason: CleanupReason) {
  const inserted = await tx.insert(storageCleanupJobs).values({ bucket: configuredBucket(), storageKey: key, reason })
    .onConflictDoNothing().returning({ key: storageCleanupJobs.storageKey });
  return inserted.length > 0;
}

// Upload sem associação não participa da transação que acabou de falhar.
export async function queueUploadRollback(key: string) {
  await getDb().transaction((tx) => queueR2Cleanup(tx, key, 'upload_rollback'));
}

function safeErrorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : 'UnknownError';
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : 'StorageError';
}

export async function tryDeleteQueuedR2(key: string, storage: PhotoStorage = createR2Storage()) {
  const db = getDb();
  const jobFilter = and(eq(storageCleanupJobs.bucket, configuredBucket()), eq(storageCleanupJobs.storageKey, key));
  const [job] = await db.select().from(storageCleanupJobs).where(jobFilter).limit(1);
  if (!job || job.status === 'done') return 'already_done' as const;
  const [reference] = await db.select({ id: vehicleImages.id }).from(vehicleImages)
    .where(eq(vehicleImages.storageKey, key)).limit(1);
  if (reference) {
    await db.update(storageCleanupJobs).set({ lastErrorCode: 'still_referenced', updatedAt: new Date(),
      attempts: sql`${storageCleanupJobs.attempts} + 1` }).where(jobFilter);
    return 'still_referenced' as const;
  }
  try {
    await storage.delete(key);
    await db.update(storageCleanupJobs).set({ status: 'done', lastErrorCode: null, resolvedAt: new Date(),
      updatedAt: new Date(), attempts: sql`${storageCleanupJobs.attempts} + 1` })
      .where(jobFilter);
    return 'deleted' as const;
  } catch (error) {
    await db.update(storageCleanupJobs).set({ lastErrorCode: safeErrorCode(error), updatedAt: new Date(),
      attempts: sql`${storageCleanupJobs.attempts} + 1` }).where(jobFilter);
    return 'failed' as const;
  }
}

export async function retryPendingR2Cleanup(storage: PhotoStorage = createR2Storage(), limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Limite de limpeza inválido.');
  const jobs = await getDb().select({ key: storageCleanupJobs.storageKey }).from(storageCleanupJobs)
    .where(and(eq(storageCleanupJobs.bucket, configuredBucket()), eq(storageCleanupJobs.status, 'pending')))
    .orderBy(asc(storageCleanupJobs.createdAt)).limit(limit);
  const result = { checked: jobs.length, deleted: 0, failed: 0, stillReferenced: 0 };
  for (const job of jobs) {
    const outcome = await tryDeleteQueuedR2(job.key, storage);
    if (outcome === 'deleted') result.deleted += 1;
    if (outcome === 'failed') result.failed += 1;
    if (outcome === 'still_referenced') result.stillReferenced += 1;
  }
  return result;
}

// Varredura para objetos históricos que ficaram fora da fila, com quarentena de 24 h.
// Nunca considera caminhos legados nem objetos recentemente enviados.
export async function queueOldR2Orphans(storage: R2PhotoStorage, options: {
  now?: Date; maxPages?: number;
} = {}) {
  const now = options.now ?? new Date();
  const maxPages = options.maxPages ?? 10;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('Limite de páginas inválido.');
  let continuationToken: string | undefined;
  const result = { scanned: 0, queued: 0, skippedRecent: 0, skippedInvalid: 0, pages: 0 };
  do {
    const page = await storage.listPage('drafts/', continuationToken);
    result.pages += 1;
    for (const object of page.objects) {
      result.scanned += 1;
      if (!isR2PhotoKey(object.key)) { result.skippedInvalid += 1; continue; }
      if (!object.modifiedAt || now.getTime() - object.modifiedAt.getTime() < 24 * 60 * 60 * 1000) {
        result.skippedRecent += 1; continue;
      }
      const [reference] = await getDb().select({ id: vehicleImages.id }).from(vehicleImages)
        .where(eq(vehicleImages.storageKey, object.key)).limit(1);
      if (reference) continue;
      if (await getDb().transaction((tx) => queueR2Cleanup(tx, object.key, 'orphan_scan'))) result.queued += 1;
    }
    continuationToken = page.nextToken;
  } while (continuationToken && result.pages < maxPages);
  return { ...result, hasMore: Boolean(continuationToken) };
}
