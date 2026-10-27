export function artExportProblem(data: {
  vehicle: { status: string; brand: string | null; model: string | null; year: number | null; priceCents: number | null };
  photos: readonly unknown[];
}) {
  const { vehicle, photos } = data;
  if (!['published', 'reserved', 'sold'].includes(vehicle.status)) return 'Publique o anúncio antes de baixar uma arte comercial.';
  if (!vehicle.brand || !vehicle.model || !vehicle.year || !vehicle.priceCents) return 'Complete marca, modelo, ano e preço no cadastro.';
  if (photos.length === 0) return 'Adicione uma foto do veículo no cadastro.';
  return null;
}
