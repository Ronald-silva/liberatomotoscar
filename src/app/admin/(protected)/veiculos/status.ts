export const statusLabels = { draft: 'Rascunho', published: 'Publicado', reserved: 'Reservado', sold: 'Vendido', archived: 'Arquivado' } as const;
export type VehicleStatus = keyof typeof statusLabels;

// Rótulo do botão que leva o veículo a cada estado de destino.
export const actionLabels: Record<VehicleStatus, string> = {
  draft: 'Voltar para rascunho', published: 'Publicar', reserved: 'Reservar', sold: 'Marcar vendido', archived: 'Arquivar',
};

// Sempre devolve a base da etiqueta; a classe do estado só entra se existir, nunca "undefined".
export function badgeClassName(styles: Record<string, string>, status: string): string {
  return [styles.badge, styles[`badge_${status}`]].filter(Boolean).join(' ');
}
