/**
 * O selo da arte — o que a peça anuncia sobre o veículo.
 *
 * Antes isto era "modelo", e eram seis: `new`, `highlight` e `offer` tinham paleta idêntica e
 * diferiam só no texto do selo; `reserved` e `sold` são situação do cadastro, não escolha de quem
 * monta a peça; e `classic` era tema claro, que não sobrevive a um véu escuro sobre foto. Seis
 * opções para três decisões reais. Agora o layout é um só, a paleta é a da marca (`BRAND.palette`)
 * e o que sobra aqui é o rótulo — que é o que de fato mudava.
 *
 * As dimensões saíram daqui junto com o quadrado: quem precisa de formato lê de `destinations.ts`,
 * onde ele é propriedade do destino.
 */

export type ArtBadge = 'new' | 'highlight' | 'offer' | 'reserved' | 'sold';

export const artBadges: { id: ArtBadge; label: string; heading: string }[] = [
  { id: 'new', label: 'Recém-chegado', heading: 'RECÉM-CHEGADO' },
  { id: 'highlight', label: 'Destaque da semana', heading: 'DESTAQUE DA SEMANA' },
  // O selo não pode repetir o rótulo do preço, que já diz "PREÇO DO ANÚNCIO" logo abaixo.
  { id: 'offer', label: 'Preço em destaque', heading: 'PREÇO EM DESTAQUE' },
  { id: 'reserved', label: 'Reservado', heading: 'RESERVADO' },
  { id: 'sold', label: 'Vendido', heading: 'VENDIDO' },
];

/**
 * Trava comercial, não conveniência: veículo vendido ou reservado só oferece o próprio rótulo.
 * Deixar "Destaque da semana" disponível para um carro já vendido é anunciar como disponível o que
 * não está — o anti-objetivo que o estúdio inteiro existe para não cometer.
 *
 * Antes sobrava `classic` nos dois casos, que era uma porta aberta para exatamente isso; com o
 * tema claro fora, a lista de vendido e de reservado tem um item só.
 */
export function badgesForStatus(status: string) {
  if (status === 'sold') return artBadges.filter((badge) => badge.id === 'sold');
  if (status === 'reserved') return artBadges.filter((badge) => badge.id === 'reserved');
  return artBadges.filter((badge) => !['sold', 'reserved'].includes(badge.id));
}
