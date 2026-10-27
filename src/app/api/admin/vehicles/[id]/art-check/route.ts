import { AccessDeniedError } from '@/server/authz';
import { artExportProblem, getArtVehicleData } from '@/server/art-studio/vehicle-art-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await getArtVehicleData(id);
    if (!data) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 });
    const version = Number(new URL(request.url).searchParams.get('version'));
    if (!Number.isSafeInteger(version) || version !== data.vehicle.versionNumber) {
      return Response.json({ error: 'O anúncio mudou. Recarregue a página antes de baixar.' }, { status: 409 });
    }
    const problem = artExportProblem(data);
    if (problem) return Response.json({ error: problem }, { status: 409 });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AccessDeniedError) return Response.json({ error: 'Acesso negado.' }, { status: 403 });
    if (error instanceof Error && error.name === 'ZodError') return Response.json({ error: 'Anúncio inválido.' }, { status: 400 });
    throw error;
  }
}
