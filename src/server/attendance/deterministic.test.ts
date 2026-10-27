import { describe, expect, it, vi } from 'vitest';
import type { searchAvailableVehicles } from '@/server/vehicles/agent-catalog';
import { deterministicAnswer } from './deterministic';

const item = { id: '9ef8cf37-e8cf-4f11-93f6-c92ecae72c71', slug: 'honda-titan',
  type: 'motorcycle' as const, brand: 'Honda', model: 'Titan', version: null, year: 2019,
  mileageKm: null, color: null, priceCents: 1150000, versionNumber: 2 };

describe('atendimento determinístico', () => {
  it('consulta apenas anúncios publicados da categoria e apresenta dados vindos do catálogo', async () => {
    const search = vi.fn(async () => ({ items: [item], checkedAt: '2026-10-27T00:00:00.000Z' }));
    const answer = await deterministicAnswer('motorcycles', search as typeof searchAvailableVehicles);
    expect(search).toHaveBeenCalledWith({ type: 'motorcycle', limit: 3 });
    expect(answer.cards).toEqual([{ id: item.id, title: 'Honda Titan', year: 2019,
      priceCents: 1150000, href: '/veiculos/honda-titan' }]);
    expect(answer.handoffRequested).toBe(false);
  });

  it('não inventa anúncios quando o estoque da categoria está vazio', async () => {
    const search = vi.fn(async () => ({ items: [], checkedAt: '2026-10-27T00:00:00.000Z' }));
    const answer = await deterministicAnswer('cars', search as typeof searchAvailableVehicles);
    expect(search).toHaveBeenCalledWith({ type: 'car', limit: 3 });
    expect(answer.cards).toEqual([]);
    expect(answer.text).toContain('Não encontrei anúncios publicados');
  });

  it('encaminha financiamento ao humano sem prometer aprovação nem consultar IA', async () => {
    const search = vi.fn();
    const answer = await deterministicAnswer('financing', search as typeof searchAvailableVehicles);
    expect(search).not.toHaveBeenCalled();
    expect(answer.text).toContain('dependem de análise');
    expect(answer.handoffRequested).toBe(true);
    expect(answer.handoffUrl).toMatch(/^https:\/\/wa\.me\//);
  });
});
