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
      // Location relativo preserva o domínio HTTPS visto pelo navegador, mesmo
      // quando o servidor recebe a requisição por um host interno do Railway.
      return new Response(null, { status: 307, headers: {
        Location: photo.storageKey, 'Cache-Control': 'private, no-store',
      } });
    }
    let bytes: Uint8Array;
    try {
      bytes = await createR2Storage().read(photo.storageKey);
    } catch (error) {
      // Nunca registrar chave, URL assinada ou credenciais do R2.
      console.error('Falha ao ler foto da arte no R2', { reason: error instanceof Error ? error.name : 'unknown' });
      return new Response(null, { status: 502, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return new Response(new Uint8Array(bytes), { headers: {
      'Content-Type': photo.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof AccessDeniedError) return new Response(null, { status: 403 });
    if (error instanceof Error && error.name === 'ZodError') return new Response(null, { status: 400 });
    throw error;
  }
}
