import { AccessDeniedError } from '@/server/authz';
import { getArtVehicleData } from '@/server/art-studio/vehicle-art-data';
import { createR2Storage } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  try {
    const { id, photoId } = await params;
    const data = await getArtVehicleData(id);
    const photo = data?.photos.find((item) => item.id === photoId);
    if (!photo) return new Response(null, { status: 404 });
    if (photo.storageProvider === 'legacy_public') {
      if (!/^\/images\/[a-zA-Z0-9._-]+$/.test(photo.storageKey)) return new Response(null, { status: 404 });
      return Response.redirect(new URL(photo.storageKey, _request.url));
    }
    const url = await createR2Storage().signedReadUrl!(photo.storageKey);
    const source = await fetch(url, { cache: 'no-store' });
    if (!source.ok || !source.body) return new Response(null, { status: 502 });
    return new Response(source.body, { headers: {
      'Content-Type': photo.mimeType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof AccessDeniedError) return new Response(null, { status: 403 });
    if (error instanceof Error && error.name === 'ZodError') return new Response(null, { status: 400 });
    throw error;
  }
}
