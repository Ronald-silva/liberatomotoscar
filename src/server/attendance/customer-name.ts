import { semGritar } from '@/lib/customer-briefing';

/** Perfil da Meta é texto livre: exibir sem gritar e com tamanho adequado ao cartão. */
export function cleanCustomerName(raw: string | null): string | null {
  const name = raw?.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return semGritar(name.slice(0, 40).trimEnd());
}
