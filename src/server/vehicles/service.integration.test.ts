import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';

// This suite uses a real, isolated PostgreSQL database. Only the session boundary is mocked.
vi.mock('@/server/authz', () => ({ requireAdmin: async () => ({ userId: 'phase12-audit-actor' }) }));

import { closeDb, getDb } from '@/server/db/client';
import { usersTable, vehicleAudit, vehicleImages, vehicles } from '@/server/db/schema';
import { addPhoto, changeVehicleStatus, createDraft, DiscardedVehicleError, discardDraft, getPublicVehicleBySlug, listPublicVehicles,
  removePhoto, setCoverPhoto, StaleVehicleError, updateVehicle, VehicleNotFoundError } from './service';

describe.skipIf(!process.env.TEST_DATABASE_URL)('serviços com PostgreSQL real (autorização simulada)', () => {
  beforeAll(async () => {
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('DATABASE_URL deve apontar para TEST_DATABASE_URL.');
    // FK fixture only: no admin grant or login is created in the isolated database.
    await getDb().insert(usersTable).values({ id: 'phase12-audit-actor' }).onConflictDoNothing();
  });
  afterAll(closeDb);

  it('recusa descartar por changeVehicleStatus e deixa o rascunho intacto', async () => {
    const draft = await createDraft({ type: 'car', slug: `teste-${randomUUID()}` });
    await expect(changeVehicleStatus(draft.id, draft.versionNumber, 'discarded')).rejects.toThrow('Use a exclusão do rascunho.');
    const [row] = await getDb().select().from(vehicles).where(eq(vehicles.id, draft.id));
    expect(row.status).toBe('draft');
    expect(row.versionNumber).toBe(draft.versionNumber);
  });

  it('persiste rascunho, preço, foto, publicação, venda e auditoria sem sobrescrever versão antiga', async () => {
    const slug = `teste-${randomUUID()}`;
    const draft = await createDraft({ type: 'motorcycle', slug });
    expect(draft.status).toBe('draft');
    await expect(createDraft({ type: 'motorcycle', slug })).rejects.toThrow();
    await expect(changeVehicleStatus(draft.id, 1, 'published', { confirmAvailability: true })).rejects.toThrow();
    const detailed = await updateVehicle(draft.id, 1, { details: { brand: 'Honda', model: 'Pop', year: null, mileageKm: null } });
    const priced = await updateVehicle(draft.id, detailed.versionNumber, { details: {}, priceCents: 100_00 });
    await expect(updateVehicle(draft.id, detailed.versionNumber, { details: {}, priceCents: 200_00 })).rejects.toThrow();
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

  describe('discardDraft', () => {
    const fakeStorage = () => ({ put: vi.fn(async () => ({ key: `drafts/x/${randomUUID()}.png`, mimeType: 'image/png' as const, sizeBytes: 8 })), delete: vi.fn(async () => {}) });
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const addImage = (vehicleId: string, storageKey: string, storageProvider: 'r2' | 'legacy_public', position: number) =>
      getDb().insert(vehicleImages).values({ vehicleId, storageKey, storageProvider, mimeType: 'image/png', sizeBytes: 8, position, isCover: position === 0 });

    it('descarta o rascunho, apaga as linhas de imagem e os objetos r2, e mantém a auditoria', async () => {
      const draft = await createDraft({ type: 'car' });
      const key = `drafts/${draft.id}/${randomUUID()}.png`;
      await addImage(draft.id, key, 'r2', 0);
      const storage = fakeStorage();
      // O objeto só pode sair do R2 depois que a transação confirmou: a linha já tem de estar apagada.
      storage.delete.mockImplementation(async () => {
        const rows = await getDb().select().from(vehicleImages).where(eq(vehicleImages.vehicleId, draft.id));
        expect(rows).toHaveLength(0);
      });
      const result = await discardDraft(draft.id, draft.versionNumber, storage);
      expect(result).toEqual({ status: 'discarded', versionNumber: draft.versionNumber + 1 });
      expect(storage.delete).toHaveBeenCalledTimes(1);
      expect(storage.delete).toHaveBeenCalledWith(key);
      const [row] = await getDb().select().from(vehicles).where(eq(vehicles.id, draft.id));
      expect(row.status).toBe('discarded');
      expect(row.versionNumber).toBe(draft.versionNumber + 1);
      const audits = await getDb().select().from(vehicleAudit).where(eq(vehicleAudit.vehicleId, draft.id));
      expect(audits.map((item) => item.operation)).toEqual(expect.arrayContaining(['created', 'discarded']));
    });

    it('não apaga objeto de imagem com provedor legacy_public', async () => {
      const draft = await createDraft({ type: 'motorcycle' });
      await addImage(draft.id, `/fotos/legado-${randomUUID()}.png`, 'legacy_public', 0);
      const storage = fakeStorage();
      await discardDraft(draft.id, draft.versionNumber, storage);
      expect(storage.delete).not.toHaveBeenCalled();
      expect(await getDb().select().from(vehicleImages).where(eq(vehicleImages.vehicleId, draft.id))).toHaveLength(0);
    });

    it('continua descartado quando o R2 falha ao apagar um objeto', async () => {
      const draft = await createDraft({ type: 'car' });
      await addImage(draft.id, `drafts/${draft.id}/${randomUUID()}.png`, 'r2', 0);
      await addImage(draft.id, `drafts/${draft.id}/${randomUUID()}.png`, 'r2', 1);
      const storage = fakeStorage();
      storage.delete.mockRejectedValueOnce(new Error('r2 fora do ar'));
      await expect(discardDraft(draft.id, draft.versionNumber, storage)).resolves.toMatchObject({ status: 'discarded' });
      expect(storage.delete).toHaveBeenCalledTimes(2);
    });

    it('recusa descartar um veículo que já foi publicado', async () => {
      const draft = await createDraft({ type: 'car' });
      const priced = await updateVehicle(draft.id, draft.versionNumber, { details: { brand: 'Fiat', model: 'Uno' }, priceCents: 100_00 });
      const photo = await addPhoto(draft.id, priced.versionNumber, png, 'image/png', fakeStorage());
      const published = await changeVehicleStatus(draft.id, photo.vehicleVersion, 'published', { confirmAvailability: true });
      await expect(discardDraft(draft.id, published.versionNumber, fakeStorage())).rejects.toThrow('Não é possível excluir um anúncio que já foi publicado.');
      // Arquivado e de volta a rascunho: o status é draft, mas já foi publicado um dia.
      const archived = await changeVehicleStatus(draft.id, published.versionNumber, 'archived');
      const reverted = await changeVehicleStatus(draft.id, archived.versionNumber, 'draft');
      expect(reverted.publishedAt).not.toBeNull();
      const storage = fakeStorage();
      await expect(discardDraft(draft.id, reverted.versionNumber, storage)).rejects.toThrow('Não é possível excluir um anúncio que já foi publicado.');
      expect(storage.delete).not.toHaveBeenCalled();
      expect(await getDb().select().from(vehicleImages).where(eq(vehicleImages.vehicleId, draft.id))).toHaveLength(1);
    });

    it('recusa descartar com versão velha', async () => {
      const draft = await createDraft({ type: 'car' });
      await addImage(draft.id, `drafts/${draft.id}/${randomUUID()}.png`, 'r2', 0);
      const storage = fakeStorage();
      await expect(discardDraft(draft.id, draft.versionNumber + 5, storage)).rejects.toBeInstanceOf(StaleVehicleError);
      expect(storage.delete).not.toHaveBeenCalled();
      const [row] = await getDb().select().from(vehicles).where(eq(vehicles.id, draft.id));
      expect(row.status).toBe('draft');
      expect(await getDb().select().from(vehicleImages).where(eq(vehicleImages.vehicleId, draft.id))).toHaveLength(1);
    });

    it('recusa editar, enviar ou remover foto de um veículo descartado', async () => {
      const draft = await createDraft({ type: 'car' });
      const imageKey = `drafts/${draft.id}/${randomUUID()}.png`;
      const [image] = await addImage(draft.id, imageKey, 'r2', 0).returning();
      const { versionNumber } = await discardDraft(draft.id, draft.versionNumber, fakeStorage());
      const storage = fakeStorage();
      const message = 'Este anúncio foi excluído.';
      await expect(updateVehicle(draft.id, versionNumber, { details: { brand: 'Fiat' } })).rejects.toThrow(message);
      await expect(addPhoto(draft.id, versionNumber, png, 'image/png', storage)).rejects.toThrow(message);
      // A foto enviada antes de a recusa acontecer não pode ficar órfã.
      expect(storage.delete).toHaveBeenCalledTimes(1);
      await expect(removePhoto(draft.id, image.id, versionNumber, storage)).rejects.toThrow(message);
      const [row] = await getDb().select().from(vehicles).where(eq(vehicles.id, draft.id));
      expect(row.versionNumber).toBe(versionNumber);
      expect(row.brand).toBeNull();
    });
  });

  describe('setCoverPhoto', () => {
    // Chaves aleatórias: a suíte não limpa linhas entre testes, então nada aqui depende de banco vazio.
    const addImage = (vehicleId: string, position: number) =>
      getDb().insert(vehicleImages).values({ vehicleId, storageKey: `drafts/${vehicleId}/${randomUUID()}.png`, storageProvider: 'r2',
        mimeType: 'image/png', sizeBytes: 8, position, isCover: position === 0 }).returning().then(([row]) => row);
    const covers = async (vehicleId: string) =>
      (await getDb().select().from(vehicleImages).where(and(eq(vehicleImages.vehicleId, vehicleId), eq(vehicleImages.isCover, true)))).map((row) => row.id);
    const setup = async () => {
      const draft = await createDraft({ type: 'car', slug: `teste-${randomUUID()}` });
      const first = await addImage(draft.id, 0);
      const second = await addImage(draft.id, 1);
      return { draft, first, second };
    };

    it('marca a foto escolhida como capa e desmarca a anterior', async () => {
      const { draft, first, second } = await setup();
      await setCoverPhoto(draft.id, second.id, draft.versionNumber);
      expect(await covers(draft.id)).toEqual([second.id]);
      await setCoverPhoto(draft.id, first.id, draft.versionNumber + 1);
      expect(await covers(draft.id)).toEqual([first.id]);
    });

    it('devolve a versão nova do veículo e registra a auditoria', async () => {
      const { draft, second } = await setup();
      const result = await setCoverPhoto(draft.id, second.id, draft.versionNumber);
      expect(result).toEqual({ vehicleVersion: draft.versionNumber + 1 });
      const [row] = await getDb().select().from(vehicles).where(eq(vehicles.id, draft.id));
      expect(row.versionNumber).toBe(draft.versionNumber + 1);
      const [entry] = await getDb().select().from(vehicleAudit).where(and(eq(vehicleAudit.vehicleId, draft.id), eq(vehicleAudit.operation, 'cover_changed')));
      expect(entry.after).toMatchObject({ imageId: second.id });
    });

    it('recusa imagem de outro veículo e não altera nada', async () => {
      const { draft, first } = await setup();
      const other = await setup();
      await expect(setCoverPhoto(draft.id, other.second.id, draft.versionNumber)).rejects.toBeInstanceOf(VehicleNotFoundError);
      expect(await covers(draft.id)).toEqual([first.id]);
      expect(await covers(other.draft.id)).toEqual([other.first.id]);
      const [row] = await getDb().select().from(vehicles).where(eq(vehicles.id, draft.id));
      expect(row.versionNumber).toBe(draft.versionNumber);
    });

    it('recusa com versão velha', async () => {
      const { draft, first, second } = await setup();
      await expect(setCoverPhoto(draft.id, second.id, draft.versionNumber + 5)).rejects.toBeInstanceOf(StaleVehicleError);
      expect(await covers(draft.id)).toEqual([first.id]);
    });

    it('não falha ao definir como capa a foto que já é capa', async () => {
      const { draft, first } = await setup();
      await expect(setCoverPhoto(draft.id, first.id, draft.versionNumber)).resolves.toEqual({ vehicleVersion: draft.versionNumber + 1 });
      expect(await covers(draft.id)).toEqual([first.id]);
    });

    it('recusa veículo descartado antes de olhar a versão', async () => {
      const { draft, first } = await setup();
      const { versionNumber } = await discardDraft(draft.id, draft.versionNumber, { put: vi.fn(), delete: vi.fn(async () => {}) });
      await expect(setCoverPhoto(draft.id, first.id, versionNumber)).rejects.toBeInstanceOf(DiscardedVehicleError);
      await expect(setCoverPhoto(draft.id, first.id, versionNumber + 9)).rejects.toBeInstanceOf(DiscardedVehicleError);
      const [row] = await getDb().select().from(vehicles).where(eq(vehicles.id, draft.id));
      expect(row.versionNumber).toBe(versionNumber);
    });
  });
});
