import { beforeEach, describe, expect, it, vi } from 'vitest';

// O serviço real puxa a autenticação (next-auth), que não carrega no Node ESM do Vitest.
const stub = vi.hoisted(() => ({
  StaleVehicleError: class StaleVehicleError extends Error {
    constructor() { super('Este anúncio foi alterado. Recarregue antes de salvar.'); }
  },
  updateVehicle: vi.fn(async (id: string, version: number, input: unknown): Promise<object> => ({ id, version, input })),
  revalidatePath: vi.fn(),
  createDraft: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: '' })),
  redirect: vi.fn((url: string): never => { throw Object.assign(new Error('NEXT_REDIRECT'), { redirectUrl: url }); }),
  addPhoto: vi.fn<(...args: unknown[]) => Promise<object>>(async () => ({})),
  removePhoto: vi.fn<(...args: unknown[]) => Promise<object>>(async () => ({})),
  changeVehicleStatus: vi.fn<(...args: unknown[]) => Promise<object>>(async () => ({})),
}));

vi.mock('@/server/vehicles/service', () => ({ createDraft: stub.createDraft, updateVehicle: stub.updateVehicle, addPhoto: stub.addPhoto, removePhoto: stub.removePhoto, changeVehicleStatus: stub.changeVehicleStatus }));
vi.mock('next/cache', () => ({ revalidatePath: stub.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: stub.redirect, notFound: vi.fn() }));

import { addVehiclePhoto, changeStatus, createVehicle, removeVehiclePhoto, saveVehicle } from './actions';
import { maskMileage, maskPrice } from './masks';

const id = '6f1c1c1e-7c1e-4b59-9a53-2d2f0c1d3a11';
const formDataOf = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const empty = { message: null };

beforeEach(() => { vi.clearAllMocks(); stub.updateVehicle.mockResolvedValue({}); stub.addPhoto.mockResolvedValue({ vehicleVersion: 5 }); stub.removePhoto.mockResolvedValue({}); stub.changeVehicleStatus.mockResolvedValue({}); stub.createDraft.mockResolvedValue({ id }); });

describe('salvar veículo', () => {
  it('pede recarga quando a versão enviada está velha', async () => {
    stub.updateVehicle.mockRejectedValueOnce(new stub.StaleVehicleError());
    const state = await saveVehicle(empty, formDataOf({ id, version: '1', brand: 'Honda' }));
    expect(state.message).toBe('Este anúncio foi alterado. Recarregue antes de salvar.');
    expect(stub.revalidatePath).not.toHaveBeenCalled();
  });

  it('envia dados e preço numa chamada só, com a versão do formulário', async () => {
    await saveVehicle(empty, formDataOf({ id, version: '3', brand: 'Honda', model: 'CG 160', versionName: '', year: '2022', mileageKm: '15000', color: '', description: '', price: '18.500' }));
    expect(stub.updateVehicle).toHaveBeenCalledWith(id, 3, {
      details: { brand: 'Honda', model: 'CG 160', version: null, year: 2022, mileageKm: 15000, color: null, description: null },
      priceCents: 1850000,
    });
  });

  // Com um formulário só, o campo vazio precisa significar "ainda não tem preço" — nunca zerar o
  // que já estava salvo.
  it('campo de preço vazio não mexe no preço salvo', async () => {
    await saveVehicle(empty, formDataOf({ id, version: '3', brand: 'Honda', price: '' }));
    expect(stub.updateVehicle).toHaveBeenCalledWith(id, 3, expect.objectContaining({ priceCents: undefined }));
  });

  it('revalida a lista e a própria página no sucesso', async () => {
    const state = await saveVehicle(empty, formDataOf({ id, version: '1', brand: 'Honda' }));
    expect(state.message).toBe('Veículo salvo.');
    expect(stub.revalidatePath).toHaveBeenCalledWith('/admin');
    expect(stub.revalidatePath).toHaveBeenCalledWith(`/admin/veiculos/${id}`);
  });

  it('recusa ano não numérico sem chamar o serviço', async () => {
    const state = await saveVehicle(empty, formDataOf({ id, version: '1', year: 'dois mil' }));
    expect(state.message).toBeTruthy();
    expect(stub.updateVehicle).not.toHaveBeenCalled();
  });

  it('não vaza erro inesperado', async () => {
    stub.updateVehicle.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    const state = await saveVehicle(empty, formDataOf({ id, version: '1', brand: 'Honda' }));
    expect(state.message).toBe('Não foi possível salvar agora. Tente de novo.');
  });
});

describe('limites validados antes do serviço', () => {
  it.each([
    [{ year: '1899' }, 'O ano deve estar entre 1900 e 2100.'],
    [{ year: '2101' }, 'O ano deve estar entre 1900 e 2100.'],
    [{ mileageKm: '2.147.483.648' }, 'A quilometragem informada é grande demais.'],
    [{ brand: 'x'.repeat(161) }, 'Marca, modelo, versão e cor aceitam até 160 caracteres.'],
    [{ description: 'x'.repeat(5001) }, 'A descrição aceita até 5000 caracteres.'],
  ])('recusa %j com mensagem própria', async (fields, message) => {
    const state = await saveVehicle(empty, formDataOf({ id, version: '1', ...fields }));
    expect(state.message).toBe(message);
    expect(stub.updateVehicle).not.toHaveBeenCalled();
  });

  it('aceita quilometragem com ponto de milhar', async () => {
    await saveVehicle(empty, formDataOf({ id, version: '1', mileageKm: '15.000' }));
    expect(stub.updateVehicle).toHaveBeenCalledWith(id, 1, expect.objectContaining({
      details: expect.objectContaining({ mileageKm: 15000 }),
    }));
  });

  it('recusa preço acima do máximo e aceita o máximo', async () => {
    const over = await saveVehicle(empty, formDataOf({ id, version: '1', price: '21.474.836,48' }));
    expect(over.message).toBe('O preço máximo é R$ 21.474.836,47.');
    expect(stub.updateVehicle).not.toHaveBeenCalled();
    await saveVehicle(empty, formDataOf({ id, version: '1', price: '21.474.836,47' }));
    expect(stub.updateVehicle).toHaveBeenCalledWith(id, 1, expect.objectContaining({ priceCents: 2147483647 }));
  });
});

describe('preço em reais convertido para centavos', () => {
  it.each([['18500', 1850000], ['18.500', 1850000], ['18500,00', 1850000], ['18.500,00', 1850000], ['R$ 18.500,5', 1850050], ['0', 0]])(
    'converte "%s" em %i centavos', async (typed, cents) => {
      await saveVehicle(empty, formDataOf({ id, version: '2', price: typed }));
      expect(stub.updateVehicle).toHaveBeenCalledWith(id, 2, expect.objectContaining({ priceCents: cents }));
    });

  it.each(['abc', '18,500,00', '1.85', '-5', '18500,001'])('recusa "%s" sem chamar o serviço', async (typed) => {
    const state = await saveVehicle(empty, formDataOf({ id, version: '2', price: typed }));
    expect(state.message).toBeTruthy();
    expect(stub.updateVehicle).not.toHaveBeenCalled();
  });
});

// A máscara da tela e o leitor do servidor são códigos separados; este bloco prova que eles
// concordam, para a tela nunca mostrar um valor que a action vai recusar.
describe('máscara da tela e leitura do servidor combinam', () => {
  it.each([['18500', 1850000], ['1850000', 185000000], ['18500,50', 1850050], ['900', 90000]])(
    'o preço digitado "%s" chega como %i centavos', async (typed, cents) => {
      await saveVehicle(empty, formDataOf({ id, version: '1', price: maskPrice(typed) }));
      expect(stub.updateVehicle).toHaveBeenCalledWith(id, 1, expect.objectContaining({ priceCents: cents }));
    });

  it.each([['150000', 150000], ['12500', 12500], ['980', 980]])(
    'a quilometragem digitada "%s" chega como %i', async (typed, km) => {
      await saveVehicle(empty, formDataOf({ id, version: '1', mileageKm: maskMileage(typed) }));
      expect(stub.updateVehicle).toHaveBeenCalledWith(id, 1, expect.objectContaining({
        details: expect.objectContaining({ mileageKm: km }),
      }));
    });
});

const imageId = '0a5b7c1e-1111-4b59-9a53-2d2f0c1d3a22';
const photoForm = (file: File | string | null, version = '4') => {
  const data = formDataOf({ id, version });
  if (file !== null) data.set('photo', file);
  return data;
};
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'foto.jpg', { type: 'image/jpeg' });

describe('adicionar foto', () => {
  it('converte o arquivo em bytes e repassa versão e tipo ao serviço', async () => {
    const state = await addVehiclePhoto(empty, photoForm(jpeg()));
    expect(state.message).toBe('Foto adicionada.');
    const [calledId, version, body, mime] = stub.addPhoto.mock.calls[0];
    expect([calledId, version, mime]).toEqual([id, 4, 'image/jpeg']);
    expect(body).toBeInstanceOf(Uint8Array);
    expect(Array.from(body as Uint8Array)).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  it('revalida a lista e a página, porque a foto incrementa a versão', async () => {
    await addVehiclePhoto(empty, photoForm(jpeg()));
    expect(stub.revalidatePath).toHaveBeenCalledWith('/admin');
    expect(stub.revalidatePath).toHaveBeenCalledWith(`/admin/veiculos/${id}`);
  });

  it('traduz arquivo que não é imagem de verdade', async () => {
    stub.addPhoto.mockRejectedValueOnce(new Error('Formato de foto inválido.'));
    const state = await addVehiclePhoto(empty, photoForm(jpeg()));
    expect(state.message).toBe('Formato de foto inválido.');
    expect(stub.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([null, 'texto', new File([], 'vazio.jpg', { type: 'image/jpeg' })])('recusa envio sem arquivo utilizável', async (file) => {
    const state = await addVehiclePhoto(empty, photoForm(file));
    expect(state.message).toBe('Escolha uma foto para enviar.');
    expect(stub.addPhoto).not.toHaveBeenCalled();
  });

  it('pede recarga quando a versão está velha', async () => {
    stub.addPhoto.mockRejectedValueOnce(new stub.StaleVehicleError());
    expect((await addVehiclePhoto(empty, photoForm(jpeg()))).message).toBe('Este anúncio foi alterado. Recarregue antes de salvar.');
  });

  it('não vaza erro inesperado', async () => {
    stub.addPhoto.mockRejectedValueOnce(new Error('R2 secret abc'));
    expect((await addVehiclePhoto(empty, photoForm(jpeg()))).message).toBe('Não foi possível salvar agora. Tente de novo.');
  });

  // Sem a versão nova de volta, a segunda foto de uma seleção múltipla seria recusada por
  // "anúncio alterado": cada foto incrementa a versão do veículo.
  it('devolve a versão nova para a foto seguinte poder ir sem recarregar', async () => {
    stub.addPhoto.mockResolvedValueOnce({ vehicleVersion: 9 });
    expect(await addVehiclePhoto(empty, photoForm(jpeg()))).toEqual({ message: 'Foto adicionada.', version: 9 });
  });

  it('não inventa versão quando a foto falha', async () => {
    stub.addPhoto.mockRejectedValueOnce(new stub.StaleVehicleError());
    expect((await addVehiclePhoto(empty, photoForm(jpeg()))).version).toBeUndefined();
  });
});

describe('remover foto', () => {
  const removeForm = () => formDataOf({ id, version: '5', imageId });

  it('repassa veículo, foto e versão e revalida', async () => {
    const state = await removeVehiclePhoto(empty, removeForm());
    expect(state.message).toBe('Foto removida.');
    expect(stub.removePhoto).toHaveBeenCalledWith(id, imageId, 5);
    expect(stub.revalidatePath).toHaveBeenCalledWith(`/admin/veiculos/${id}`);
  });

  it('impede remover a última foto de anúncio publicado', async () => {
    stub.removePhoto.mockRejectedValueOnce(new Error('O anúncio precisa manter uma foto.'));
    expect((await removeVehiclePhoto(empty, removeForm())).message).toBe('O anúncio precisa manter uma foto.');
    expect(stub.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('mudar estado', () => {
  const statusForm = (status: string, extra: Record<string, string> = {}) => formDataOf({ id, version: '6', status, ...extra });

  it('repassa veículo, versão e novo estado, e revalida lista e página', async () => {
    const state = await changeStatus(empty, statusForm('reserved'));
    expect(state.message).toBe('Estado atualizado.');
    expect(stub.changeVehicleStatus).toHaveBeenCalledWith(id, 6, 'reserved', { confirmAvailability: false });
    expect(stub.revalidatePath).toHaveBeenCalledWith('/admin');
    expect(stub.revalidatePath).toHaveBeenCalledWith(`/admin/veiculos/${id}`);
  });

  it('só envia a confirmação quando o campo vale exatamente "true"', async () => {
    await changeStatus(empty, statusForm('published', { confirmAvailability: 'true' }));
    expect(stub.changeVehicleStatus).toHaveBeenLastCalledWith(id, 6, 'published', { confirmAvailability: true });
    await changeStatus(empty, statusForm('published', { confirmAvailability: 'on' }));
    expect(stub.changeVehicleStatus).toHaveBeenLastCalledWith(id, 6, 'published', { confirmAvailability: false });
  });

  it('pede a confirmação quando o serviço a exige', async () => {
    stub.changeVehicleStatus.mockRejectedValueOnce(new Error('Confirme a disponibilidade para publicar.'));
    expect((await changeStatus(empty, statusForm('published'))).message).toBe('Confirme a disponibilidade para publicar.');
  });

  it('explica o que falta para publicar', async () => {
    stub.changeVehicleStatus.mockRejectedValueOnce(new Error('Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto.'));
    const state = await changeStatus(empty, statusForm('published', { confirmAvailability: 'true' }));
    expect(state.message).toBe('Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto.');
    expect(stub.revalidatePath).not.toHaveBeenCalled();
  });

  it('recusa transição não permitida que chegue por POST', async () => {
    stub.changeVehicleStatus.mockRejectedValueOnce(new Error('Mudança de estado não permitida.'));
    expect((await changeStatus(empty, statusForm('sold'))).message).toBe('Mudança de estado não permitida.');
  });

  it('pede recarga quando a versão está velha', async () => {
    stub.changeVehicleStatus.mockRejectedValueOnce(new stub.StaleVehicleError());
    expect((await changeStatus(empty, statusForm('archived'))).message).toBe('Este anúncio foi alterado. Recarregue antes de salvar.');
  });

  it('não vaza erro inesperado', async () => {
    stub.changeVehicleStatus.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    expect((await changeStatus(empty, statusForm('archived'))).message).toBe('Não foi possível salvar agora. Tente de novo.');
  });
});

describe('cadastrar veículo', () => {
  it('cria rascunho de moto e leva para a edição', async () => {
    await expect(createVehicle(empty, formDataOf({ type: 'motorcycle' }))).rejects.toMatchObject({ redirectUrl: `/admin/veiculos/${id}` });
    expect(stub.createDraft).toHaveBeenCalledWith({ type: 'motorcycle' });
    expect(stub.revalidatePath).toHaveBeenCalledWith('/admin');
  });

  it('cria rascunho de carro', async () => {
    await expect(createVehicle(empty, formDataOf({ type: 'car' }))).rejects.toMatchObject({ redirectUrl: `/admin/veiculos/${id}` });
    expect(stub.createDraft).toHaveBeenCalledWith({ type: 'car' });
  });

  it('recusa tipo de veículo desconhecido sem chamar o serviço', async () => {
    const state = await createVehicle(empty, formDataOf({ type: 'caminhao' }));
    expect(state.message).toBe('Escolha moto ou carro.');
    expect(stub.createDraft).not.toHaveBeenCalled();
    expect(stub.redirect).not.toHaveBeenCalled();
  });

  it('recusa envio sem tipo', async () => {
    expect((await createVehicle(empty, new FormData())).message).toBe('Escolha moto ou carro.');
    expect(stub.createDraft).not.toHaveBeenCalled();
  });

  it('não vaza falha do serviço e não redireciona', async () => {
    stub.createDraft.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    const state = await createVehicle(empty, formDataOf({ type: 'car' }));
    expect(state.message).toBe('Não foi possível salvar agora. Tente de novo.');
    expect(stub.redirect).not.toHaveBeenCalled();
  });

  // Com revalidatePath dentro do try, uma falha dele virava mensagem de erro com o rascunho JÁ
  // criado: a pessoa tocava de novo e nascia um órfão por toque. O redirecionamento tem de
  // acontecer mesmo assim, porque o veículo existe.
  it('não transforma falha de revalidação em erro de criação', async () => {
    stub.revalidatePath.mockImplementationOnce(() => { throw new Error('falha ao revalidar'); });
    await expect(createVehicle(empty, formDataOf({ type: 'motorcycle' })))
      .rejects.toMatchObject({ redirectUrl: `/admin/veiculos/${id}` });
    expect(stub.createDraft).toHaveBeenCalledTimes(1);
  });
});
