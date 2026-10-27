import { asc, eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/authz';
import { getDb } from '@/server/db/client';
import { vehicleImages, vehicles } from '@/server/db/schema';
import { idSchema } from '@/server/vehicles/validation';
export { artExportProblem } from './policy';

export async function getArtVehicleData(id: string) {
  await requireAdmin();
  const vehicleId = idSchema.parse(id);
  const db = getDb();
  const [[vehicle], photos] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1),
    db.select({ id: vehicleImages.id, storageKey: vehicleImages.storageKey,
      storageProvider: vehicleImages.storageProvider, mimeType: vehicleImages.mimeType,
      isCover: vehicleImages.isCover }).from(vehicleImages)
      .where(eq(vehicleImages.vehicleId, vehicleId)).orderBy(asc(vehicleImages.position)),
  ]);
  if (!vehicle || vehicle.status === 'discarded') return null;
  return { vehicle, photos };
}

