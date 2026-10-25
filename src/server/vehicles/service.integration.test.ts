import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';

// This suite uses a real, isolated PostgreSQL database. Only the session boundary is mocked.
vi.mock('@/server/authz', () => ({ requireAdmin: async () => ({ userId: 'phase12-audit-actor' }) }));

import { closeDb, getDb } from '@/server/db/client';
import { usersTable, vehicleAudit, vehicleImages, vehicles } from '@/server/db/schema';
import { addPhoto, changeVehicleStatus, createDraft, getPublicVehicleBySlug, listPublicVehicles,
  updateDetails, updatePrice } from './service';

describe.skipIf(!process.env.TEST_DATABASE_URL)('serviços com PostgreSQL real (autorização simulada)', () => {
  beforeAll(async () => {
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('DATABASE_URL deve apontar para TEST_DATABASE_URL.');
    // FK fixture only: no admin grant or login is created in the isolated database.
    await getDb().insert(usersTable).values({ id: 'phase12-audit-actor' }).onConflictDoNothing();
  });
  afterAll(closeDb);

  it('persiste rascunho, preço, foto, publicação, venda e auditoria sem sobrescrever versão antiga', async () => {
    const slug = `teste-${randomUUID()}`;
    const draft = await createDraft({ type: 'motorcycle', slug });
    expect(draft.status).toBe('draft');
    await expect(createDraft({ type: 'motorcycle', slug })).rejects.toThrow();
    await expect(changeVehicleStatus(draft.id, 1, 'published', { confirmAvailability: true })).rejects.toThrow();
    const detailed = await updateDetails(draft.id, 1, { brand: 'Honda', model: 'Pop', year: null, mileageKm: null });
    const priced = await updatePrice(draft.id, detailed.versionNumber, 100_00);
    await expect(updatePrice(draft.id, detailed.versionNumber, 200_00)).rejects.toThrow();
    const storage = { put: vi.fn(async () => ({ key: `drafts/${draft.id}/${randomUUID()}.png`, mimeType: 'image/png' as const, sizeBytes: 8 })), delete: vi.fn(async () => {}) };
    const photo = await addPhoto(draft.id, priced.versionNumber, Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png', storage);
    expect(photo.isCover).toBe(true);
    const published = await changeVehicleStatus(draft.id, priced.versionNumber + 1, 'published', { confirmAvailability: true });
    expect(published.availabilityConfirmedAt).toBeInstanceOf(Date);
    expect((await getPublicVehicleBySlug(slug))?.status).toBe('published');
    expect((await listPublicVehicles()).some((item) => item.slug === slug)).toBe(true);
    const sold = await changeVehicleStatus(draft.id, published.versionNumber, 'sold');
    expect(sold.status).toBe('sold');
    expect((await listPublicVehicles()).some((item) => item.slug === slug)).toBe(false);
    expect((await getPublicVehicleBySlug(slug))?.status).toBe('sold');
    const audits = await getDb().select().from(vehicleAudit).where(eq(vehicleAudit.vehicleId, draft.id));
    expect(audits.map((item) => item.operation)).toEqual(expect.arrayContaining(['created', 'price_changed', 'photo_added', 'published', 'sold']));
    expect(audits.every((item) => item.actorUserId === 'phase12-audit-actor')).toBe(true);
  });

  it('mantém integridade referencial, capa única e rollback da auditoria', async () => {
    const draft = await createDraft({ type: 'car' });
    const key = `drafts/${draft.id}/${randomUUID()}.png`;
    await getDb().insert(vehicleImages).values({ vehicleId: draft.id, storageKey: key, storageProvider: 'r2',
      mimeType: 'image/png', sizeBytes: 8, position: 0, isCover: true });
    await expect(getDb().insert(vehicleImages).values({ vehicleId: draft.id, storageKey: `${key}-2`, storageProvider: 'r2',
      mimeType: 'image/png', sizeBytes: 8, position: 1, isCover: true })).rejects.toThrow();
    await expect(getDb().insert(vehicleImages).values({ vehicleId: randomUUID(), storageKey: `${key}-3`, storageProvider: 'r2',
      mimeType: 'image/png', sizeBytes: 8, position: 0 })).rejects.toThrow();
    await expect(getDb().transaction(async (tx) => {
      await tx.update(vehicles).set({ brand: 'Rollback' }).where(eq(vehicles.id, draft.id));
      await tx.insert(vehicleAudit).values({ vehicleId: draft.id, actorUserId: 'phase12-audit-actor', operation: 'rollback_probe' });
      throw new Error('forçar rollback');
    })).rejects.toThrow('forçar rollback');
    const [row] = await getDb().select().from(vehicles).where(eq(vehicles.id, draft.id));
    const audits = await getDb().select().from(vehicleAudit).where(and(eq(vehicleAudit.vehicleId, draft.id), eq(vehicleAudit.operation, 'rollback_probe')));
    expect(row.brand).toBeNull();
    expect(audits).toHaveLength(0);
    await expect(getDb().execute(sql`INSERT INTO vehicles (slug, type, price_cents, status, source) VALUES (${`bad-${randomUUID()}`}, 'car', -1, 'draft', 'test')`)).rejects.toThrow();
    await expect(getDb().execute(sql`INSERT INTO vehicles (slug, type, status, source) VALUES (${`bad-${randomUUID()}`}, 'car', 'available', 'test')`)).rejects.toThrow();
    await expect(getDb().execute(sql`INSERT INTO vehicles (slug, type, price_cents, status, source, availability_confirmed_at, published_at) VALUES (${`bad-${randomUUID()}`}, 'car', 100, 'published', 'test', now(), now())`)).rejects.toThrow();
    await expect(getDb().execute(sql`INSERT INTO vehicle_images (vehicle_id, storage_key, storage_provider, mime_type, size_bytes, height) VALUES (${draft.id}, ${`bad-${randomUUID()}`}, 'r2', 'image/png', 10, 100)`)).rejects.toThrow();
    await expect(getDb().insert(vehicleImages).values({ vehicleId: draft.id, storageKey: `bad-${randomUUID()}`, storageProvider: 'r2',
      mimeType: 'text/plain', sizeBytes: 8, position: 2 })).rejects.toThrow();
    await expect(getDb().insert(vehicleImages).values({ vehicleId: draft.id, storageKey: '   ', storageProvider: 'r2',
      mimeType: 'image/png', sizeBytes: 8, position: 2 })).rejects.toThrow();
    await expect(getDb().insert(vehicleAudit).values({ vehicleId: draft.id, actorUserId: null, operation: 'price_changed' })).rejects.toThrow();
    const [createdAudit] = await getDb().select().from(vehicleAudit).where(eq(vehicleAudit.vehicleId, draft.id)).limit(1);
    await expect(getDb().update(vehicleAudit).set({ operation: 'tampered' }).where(eq(vehicleAudit.id, createdAudit.id))).rejects.toThrow();
    await expect(getDb().delete(vehicleAudit).where(eq(vehicleAudit.id, createdAudit.id))).rejects.toThrow();
  });

  it('tenta limpar o objeto enviado quando a associação falha por versão antiga', async () => {
    const draft = await createDraft({ type: 'motorcycle' });
    const key = `drafts/${draft.id}/${randomUUID()}.png`;
    const storage = { put: vi.fn(async () => ({ key, mimeType: 'image/png' as const, sizeBytes: 8 })), delete: vi.fn(async () => {}) };
    await expect(addPhoto(draft.id, 2, Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png', storage)).rejects.toThrow();
    expect(storage.delete).toHaveBeenCalledWith(key);
    expect(await getDb().select().from(vehicleImages).where(eq(vehicleImages.vehicleId, draft.id))).toHaveLength(0);
  });
});
