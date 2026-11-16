import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '@/server/db/client';
import { vehicleImages, vehicles } from '@/server/db/schema';
import { importLegacyVehicles } from './import-legacy';

/**
 * Este teste nunca tinha rodado (faltava `TEST_DATABASE_URL`), e quando rodou contra uma cópia do
 * banco de produção ele reprovou: exigia que os 7 veículos legados estivessem todos em `draft`
 * com `published_at` nulo, e 4 deles estão publicados — porque a loja os publicou, que é o
 * objetivo do produto.
 *
 * A exigência original só vale num banco que nunca foi usado. O que o importador de fato promete,
 * e o que este teste passa a medir, é: traz os 7 slugs, não publica nada do que CRIA, e rodar de
 * novo não duplica nem altera o que a loja já mexeu.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)('importação legada com PostgreSQL real', () => {
  afterAll(closeDb);
  it('traz os sete slugs como rascunhos e é idempotente', async () => {
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('DATABASE_URL deve apontar para TEST_DATABASE_URL.');
    const antes = await getDb().select({ slug: vehicles.slug }).from(vehicles).where(eq(vehicles.source, 'legacy_static_2026_10_23'));
    const jaImportados = new Set(antes.map((row) => row.slug));

    const first = await importLegacyVehicles();
    const second = await importLegacyVehicles();
    expect(first.total).toBe(7);
    expect(first.created + first.skipped).toBe(7);
    expect(second).toMatchObject({ total: 7, created: 0, skipped: 7 });

    const rows = await getDb().select().from(vehicles).where(eq(vehicles.source, first.source));
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.slug).sort()).toEqual([...first.slugs].sort());

    // O importador nunca publica: a regra se mede nas linhas que ESTA execução criou. Num banco
    // já em uso, quem publicou foi a loja, e isso não é defeito do importador.
    const criadas = rows.filter((row) => !jaImportados.has(row.slug));
    expect(criadas).toHaveLength(first.created);
    expect(criadas.every((row) => row.status === 'draft' && row.publishedAt === null)).toBe(true);

    // O que a loja já mexeu não pode voltar atrás na segunda passada.
    const reimportadas = rows.filter((row) => jaImportados.has(row.slug));
    expect(reimportadas).toHaveLength(antes.length);

    const saveiro = rows.find((row) => row.slug === 'volkswagen-saveiro-robust-2024')!;
    expect(saveiro.priceCents).toBe(6_999_900);
    expect(saveiro.sourceData).toBeTruthy();
    const images = await getDb().select().from(vehicleImages).where(eq(vehicleImages.vehicleId, saveiro.id));
    expect(images).toHaveLength(1);
    expect(images[0].storageKey).toBe('/images/volkswagen-saveiro-robust-2024.png');
  });
});
