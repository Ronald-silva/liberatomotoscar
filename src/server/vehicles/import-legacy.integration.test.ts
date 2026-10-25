import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '@/server/db/client';
import { vehicleImages, vehicles } from '@/server/db/schema';
import { importLegacyVehicles } from './import-legacy';

describe.skipIf(!process.env.TEST_DATABASE_URL)('importação legada com PostgreSQL real', () => {
  afterAll(closeDb);
  it('preserva os sete slugs como rascunhos e é idempotente', async () => {
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('DATABASE_URL deve apontar para TEST_DATABASE_URL.');
    const first = await importLegacyVehicles();
    const second = await importLegacyVehicles();
    expect(first.total).toBe(7);
    expect(first.created + first.skipped).toBe(7);
    expect(second).toMatchObject({ total: 7, created: 0, skipped: 7 });
    const rows = await getDb().select().from(vehicles).where(eq(vehicles.source, first.source));
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.status === 'draft' && row.publishedAt === null)).toBe(true);
    expect(rows.map((row) => row.slug).sort()).toEqual([...first.slugs].sort());
    const saveiro = rows.find((row) => row.slug === 'volkswagen-saveiro-robust-2024')!;
    expect(saveiro.priceCents).toBe(6_999_900);
    expect(saveiro.sourceData).toBeTruthy();
    const images = await getDb().select().from(vehicleImages).where(eq(vehicleImages.vehicleId, saveiro.id));
    expect(images).toHaveLength(1);
    expect(images[0].storageKey).toBe('/images/volkswagen-saveiro-robust-2024.png');
  });
});
