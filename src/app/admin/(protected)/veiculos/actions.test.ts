import { beforeEach, describe, expect, it, vi } from 'vitest';

// O serviço real puxa a autenticação (next-auth), que não carrega no Node ESM do Vitest.
const stub = vi.hoisted(() => ({
  StaleVehicleError: class StaleVehicleError extends Error {
    constructor() { super('Este anúncio foi alterado. Recarregue antes de salvar.'); }
  },
  updateDetails: vi.fn(async (id: string, version: number, input: unknown): Promise<object> => ({ id, version, input })),
  updatePrice: vi.fn(async (id: string, version: number, cents: number): Promise<object> => ({ id, version, cents })),
  revalidatePath: vi.fn(),
}));

vi.mock('@/server/vehicles/service', () => ({ updateDetails: stub.updateDetails, updatePrice: stub.updatePrice }));
vi.mock('next/cache', () => ({ revalidatePath: stub.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { saveDetails, savePrice } from './actions';

const id = '6f1c1c1e-7c1e-4b59-9a53-2d2f0c1d3a11';
const formDataOf = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const empty = { message: null };

beforeEach(() => { vi.clearAllMocks(); stub.updateDetails.mockResolvedValue({}); stub.updatePrice.mockResolvedValue({}); });

describe('salvar dados', () => {
  it('pede recarga quando a versão enviada está velha', async () => {
    stub.updateDetails.mockRejectedValueOnce(new stub.StaleVehicleError());
    const state = await saveDetails(empty, formDataOf({ id, version: '1', brand: 'Honda' }));
    expect(state.message).toBe('Este anúncio foi alterado. Recarregue antes de salvar.');
    expect(stub.revalidatePath).not.toHaveBeenCalled();
  });

  it('envia os campos tipados e vazios como nulos, com a versão do formulário', async () => {
    await saveDetails(empty, formDataOf({ id, version: '3', brand: 'Honda', model: 'CG 160', versionName: '', year: '2022', mileageKm: '15000', color: '', description: '' }));
    expect(stub.updateDetails).toHaveBeenCalledWith(id, 3, {
      brand: 'Honda', model: 'CG 160', version: null, year: 2022, mileageKm: 15000, color: null, description: null,
    });
  });

  it('revalida a lista e a própria página no sucesso', async () => {
    const state = await saveDetails(empty, formDataOf({ id, version: '1', brand: 'Honda' }));
    expect(state.message).toBe('Dados salvos.');
    expect(stub.revalidatePath).toHaveBeenCalledWith('/admin');
    expect(stub.revalidatePath).toHaveBeenCalledWith(`/admin/veiculos/${id}`);
  });

  it('recusa ano não numérico sem chamar o serviço', async () => {
    const state = await saveDetails(empty, formDataOf({ id, version: '1', year: 'dois mil' }));
    expect(state.message).toBeTruthy();
    expect(stub.updateDetails).not.toHaveBeenCalled();
  });

  it('não vaza erro inesperado', async () => {
    stub.updateDetails.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    const state = await saveDetails(empty, formDataOf({ id, version: '1', brand: 'Honda' }));
    expect(state.message).toBe('Não foi possível salvar agora. Tente de novo.');
  });
});

describe('salvar preço', () => {
  it.each([['18500', 1850000], ['18.500', 1850000], ['18500,00', 1850000], ['18.500,00', 1850000], ['R$ 18.500,5', 1850050], ['0', 0]])(
    'converte "%s" em reais para centavos', async (typed, cents) => {
      await savePrice(empty, formDataOf({ id, version: '2', price: typed }));
      expect(stub.updatePrice).toHaveBeenCalledWith(id, 2, cents);
    });

  it.each(['abc', '', '18,500,00', '1.85', '-5', '18500,001'])('recusa "%s" sem chamar o serviço', async (typed) => {
    const state = await savePrice(empty, formDataOf({ id, version: '2', price: typed }));
    expect(state.message).toBeTruthy();
    expect(stub.updatePrice).not.toHaveBeenCalled();
  });

  it('revalida a lista e a própria página no sucesso', async () => {
    const state = await savePrice(empty, formDataOf({ id, version: '2', price: '1000' }));
    expect(state.message).toBe('Preço salvo.');
    expect(stub.revalidatePath).toHaveBeenCalledWith('/admin');
    expect(stub.revalidatePath).toHaveBeenCalledWith(`/admin/veiculos/${id}`);
  });

  it('pede recarga quando a versão está velha', async () => {
    stub.updatePrice.mockRejectedValueOnce(new stub.StaleVehicleError());
    const state = await savePrice(empty, formDataOf({ id, version: '1', price: '1000' }));
    expect(state.message).toBe('Este anúncio foi alterado. Recarregue antes de salvar.');
  });
});
