import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { INVENTORY_VEHICLES } from '@/data/inventory-vehicles';
import { getDb } from '@/server/db/client';
import { vehicleAudit, vehicleImages, vehicles } from '@/server/db/schema';

const SOURCE = 'legacy_static_2026_10_23';

function pngDimensions(bytes: Buffer) {
  if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('Imagem legada inválida.');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export async function importLegacyVehicles() {
  // Validate local files before beginning the all-or-nothing DB transaction.
  const prepared = await Promise.all(INVENTORY_VEHICLES.map(async (item) => {
    if (!/^\/images\/[a-z0-9-]+\.png$/.test(item.image)) throw new Error(`Caminho de imagem inválido: ${item.slug}`);
    const bytes = await readFile(path.join(process.cwd(), 'public', item.image.slice(1)));
    return { item, sizeBytes: bytes.length, ...pngDimensions(bytes) };
  }));
  return getDb().transaction(async (tx) => {
    let created = 0;
    let skipped = 0;
    for (const { item, sizeBytes, width, height } of prepared) {
      const [existing] = await tx.select().from(vehicles)
        .where(and(eq(vehicles.source, SOURCE), eq(vehicles.sourceReference, item.slug))).limit(1);
      if (existing) {
        if (existing.slug !== item.slug) throw new Error(`Referência legada inconsistente: ${item.slug}`);
        skipped++;
        continue;
      }
      const [vehicle] = await tx.insert(vehicles).values({
        slug: item.slug,
        type: item.category === 'moto' ? 'motorcycle' : 'car',
        brand: item.brand,
        model: item.model,
        version: item.version,
        year: item.year,
        mileageKm: item.kilometers,
        color: item.color,
        priceCents: Math.round(item.priceBRL * 100),
        description: item.description,
        status: 'draft',
        source: SOURCE,
        sourceReference: item.slug,
        sourceData: item,
      }).returning();
      await tx.insert(vehicleImages).values({
        vehicleId: vehicle.id,
        storageKey: item.image,
        storageProvider: 'legacy_public',
        position: 0,
        isCover: true,
        mimeType: 'image/png',
        width,
        height,
        sizeBytes,
      });
      await tx.insert(vehicleAudit).values({
        vehicleId: vehicle.id,
        actorUserId: null,
        operation: 'legacy_imported',
        before: null,
        after: { slug: item.slug, status: 'draft', source: SOURCE },
      });
      created++;
    }
    return { source: SOURCE, total: prepared.length, created, skipped, slugs: prepared.map(({ item }) => item.slug) };
  });
}
