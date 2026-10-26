// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormState } from '../actions';
import { STALE_MESSAGE } from '../feedback';
import { useVehicleDraft, type DraftFields } from './useVehicleDraft';

// A action de verdade é `'use server'` e puxa o serviço, que puxa autenticação e banco: nada
// disso carrega em teste. O dublê fica no lugar do módulo inteiro.
const { saveVehicle } = vi.hoisted(() => ({ saveVehicle: vi.fn() }));
vi.mock('../actions', () => ({ saveVehicle }));

// Vitest não injeta globais; `act` do React exige esta marca para não avisar a cada render.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const FIELDS: DraftFields = {
  brand: 'Honda', model: '', versionName: '', year: '', mileageKm: '',
  color: '', description: '', price: '',
};

const MISSING = ['Modelo', 'Preço', 'Pelo menos uma foto'];

function setup(initialMissing: readonly string[] = MISSING) {
  return renderHook(() => useVehicleDraft({
    vehicleId: 'veiculo-1', initialVersion: 3, initialFields: FIELDS, initialMissing,
  }));
}

const okState = (version: number, missing: readonly string[] = []): FormState =>
  ({ message: 'Veículo salvo.', version, missing });

// Devolve a versão seguinte à que o formulário mandou, como o serviço faz.
const bumping = async (_state: FormState, data: FormData): Promise<FormState> =>
  okState(Number(data.get('version')) + 1);

const sentVersions = () => saveVehicle.mock.calls.map((call) => (call[1] as FormData).get('version'));

// A fila encadeia promessas: uma volta de microtarefa não basta para a escrita chegar ao fim.
async function settle() {
  await act(async () => { for (let turn = 0; turn < 8; turn += 1) await Promise.resolve(); });
}

async function tick(ms = 800) {
  await act(async () => { vi.advanceTimersByTime(ms); });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  saveVehicle.mockReset();
  saveVehicle.mockImplementation(bumping);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('dono do rascunho no cliente', () => {
  it('grava 800 ms depois da última digitação, uma vez só', async () => {
    const { result } = setup();

    act(() => { result.current.set('model', 'C'); });
    act(() => { result.current.set('model', 'CG'); });
    act(() => { result.current.set('model', 'CG 160'); });
    await tick(799);
    expect(saveVehicle).not.toHaveBeenCalled();

    await tick(1);
    expect(saveVehicle).toHaveBeenCalledTimes(1);
    const data = saveVehicle.mock.calls[0][1] as FormData;
    expect(data.get('id')).toBe('veiculo-1');
    expect(data.get('version')).toBe('3');
    expect(data.get('model')).toBe('CG 160');
    expect(data.get('brand')).toBe('Honda');

    // Sem nada novo digitado, o tempo passando não gera outra escrita.
    await tick(5000);
    expect(saveVehicle).toHaveBeenCalledTimes(1);
  });

  it('grava imediatamente quando o campo perde o foco', async () => {
    const { result } = setup();

    act(() => { result.current.set('price', '18.500'); });
    await act(async () => { result.current.flush(); });
    await settle();
    expect(saveVehicle).toHaveBeenCalledTimes(1);
    expect((saveVehicle.mock.calls[0][1] as FormData).get('price')).toBe('18.500');

    // O `flush` cancelou o temporizador: o tempo correndo não repete a mesma escrita.
    await tick(2000);
    expect(saveVehicle).toHaveBeenCalledTimes(1);
  });

  it('não grava nada quando a pessoa só passa pelos campos sem mudar valor', async () => {
    const { result } = setup();

    await act(async () => { result.current.flush(); });
    await settle();
    await tick(2000);

    expect(saveVehicle).not.toHaveBeenCalled();
    expect(result.current.saveState).toBe('idle');
  });

  it('mantém o valor digitado quando a gravação falha e expõe retry', async () => {
    saveVehicle.mockImplementationOnce(async () => ({ message: 'Não foi possível salvar agora. Tente de novo.' }));
    const { result } = setup();

    act(() => { result.current.set('price', '18.500'); });
    await tick();

    expect(result.current.fields.price).toBe('18.500');
    expect(result.current.saveState).toBe('error');
    expect(result.current.message).toBe('Não foi possível salvar agora. Tente de novo.');
    expect(result.current.isStale).toBe(false);
    // Só a escrita que deu certo avança a versão.
    expect(result.current.version).toBe(3);

    await act(async () => { result.current.retry(); });
    await settle();

    expect(saveVehicle).toHaveBeenCalledTimes(2);
    expect(sentVersions()).toEqual(['3', '3']);
    expect((saveVehicle.mock.calls[1][1] as FormData).get('price')).toBe('18.500');
    expect(result.current.saveState).toBe('saved');
    expect(result.current.message).toBeNull();
    expect(result.current.version).toBe(4);
  });

  it('não tenta de novo sozinho depois de uma falha', async () => {
    saveVehicle.mockImplementation(async () => ({ message: 'Não foi possível salvar agora. Tente de novo.' }));
    const { result } = setup();

    act(() => { result.current.set('color', 'Preto'); });
    await tick();
    await tick(10000);

    expect(saveVehicle).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe('error');
  });

  it('avança a versão com a que a action devolveu', async () => {
    saveVehicle.mockImplementation(async () => okState(9));
    const { result } = setup();

    act(() => { result.current.set('year', '2020'); });
    await tick();
    expect(result.current.version).toBe(9);

    // A escrita seguinte, venha de onde vier, já sai com a versão nova.
    const job = vi.fn(async (version: number) => ({ message: 'Foto adicionada.', version: version + 1 }));
    await act(async () => { await result.current.enqueue(job); });
    expect(job).toHaveBeenCalledWith(9);
    expect(result.current.version).toBe(10);
  });

  it('serializa: a segunda escrita espera a primeira terminar', async () => {
    let release: (state: FormState) => void = () => {};
    saveVehicle.mockImplementationOnce(() => new Promise<FormState>((resolve) => { release = resolve; }));
    const { result } = setup();

    act(() => { result.current.set('model', 'CG 160'); });
    await tick();
    expect(saveVehicle).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe('saving');

    const job = vi.fn(async (version: number) => ({ message: 'Foto adicionada.', version: version + 1 }));
    act(() => { void result.current.enqueue(job); });
    await settle();
    expect(job).not.toHaveBeenCalled();

    await act(async () => { release(okState(4)); });
    await settle();

    expect(job).toHaveBeenCalledTimes(1);
    expect(job).toHaveBeenCalledWith(4);
    expect(result.current.version).toBe(5);
    expect(result.current.saveState).toBe('saved');
  });

  it('não perde a fila de fotos quando uma gravação entra no meio', async () => {
    const { result } = setup();
    const seen: number[] = [];
    const photo = () => result.current.enqueue(async (version) => {
      seen.push(version);
      return { message: 'Foto adicionada.', version: version + 1 };
    });

    // Imita o PhotoUpload: uma foto por vez, esperando a anterior.
    await act(async () => { await photo(); });

    // A pessoa digita e a pausa de 800 ms cai no meio da fila de fotos.
    act(() => { result.current.set('color', 'Preto'); });
    await tick();

    await act(async () => { await photo(); await photo(); });

    // Nenhuma foto recebeu versão velha: 3 → 4 (foto), 4 → 5 (gravação), 5 → 6, 6 → 7.
    expect(seen).toEqual([3, 5, 6]);
    expect(sentVersions()).toEqual(['4']);
    expect(result.current.version).toBe(7);
  });

  it('mostra a mensagem de anúncio alterado quando a action devolve StaleVehicleError', async () => {
    saveVehicle.mockImplementation(async () => ({ message: STALE_MESSAGE }));
    const { result } = setup();

    act(() => { result.current.set('model', 'CG 160'); });
    await tick();

    expect(result.current.saveState).toBe('error');
    expect(result.current.message).toBe(STALE_MESSAGE);
    expect(result.current.isStale).toBe(true);
    expect(result.current.version).toBe(3);
    expect(result.current.fields.model).toBe('CG 160');
  });

  it('vira mensagem conhecida quando a escrita nem chega ao servidor', async () => {
    saveVehicle.mockImplementation(async () => { throw new Error('Failed to fetch'); });
    const { result } = setup();

    act(() => { result.current.set('model', 'CG 160'); });
    await tick();

    expect(result.current.saveState).toBe('error');
    expect(result.current.message).toBe('Não foi possível salvar agora. Tente de novo.');
    expect(result.current.fields.model).toBe('CG 160');
  });

  it('atualiza missing com o que a action devolveu', async () => {
    saveVehicle.mockImplementation(async () => okState(4, ['Pelo menos uma foto']));
    const { result } = setup();
    expect(result.current.missing).toEqual(MISSING);

    act(() => { result.current.set('model', 'CG 160'); });
    await tick();

    expect(result.current.missing).toEqual(['Pelo menos uma foto']);
  });

  it('não apaga as pendências quando a gravação falha', async () => {
    saveVehicle.mockImplementation(async () => ({ message: STALE_MESSAGE }));
    const { result } = setup();

    act(() => { result.current.set('model', 'CG 160'); });
    await tick();

    // Lista vazia significa "não falta nada"; ausente significa "não sei" — o que estava fica.
    expect(result.current.missing).toEqual(MISSING);
  });

  it('grava o que foi digitado durante uma gravação em voo', async () => {
    let release: (state: FormState) => void = () => {};
    saveVehicle.mockImplementationOnce(() => new Promise<FormState>((resolve) => { release = resolve; }));
    const { result } = setup();

    act(() => { result.current.set('model', 'CG'); });
    await tick();
    expect(saveVehicle).toHaveBeenCalledTimes(1);

    act(() => { result.current.set('model', 'CG 160'); });
    await act(async () => { result.current.flush(); });
    await settle();
    // Uma escrita em voo por vez: a segunda não começou.
    expect(saveVehicle).toHaveBeenCalledTimes(1);

    await act(async () => { release(okState(4)); });
    await settle();

    expect(saveVehicle).toHaveBeenCalledTimes(2);
    expect(sentVersions()).toEqual(['3', '4']);
    expect((saveVehicle.mock.calls[1][1] as FormData).get('model')).toBe('CG 160');
  });

  it('não grava depois de a tela sair do ar', async () => {
    const { result, unmount } = setup();

    act(() => { result.current.set('model', 'CG 160'); });
    unmount();
    await tick();

    expect(saveVehicle).not.toHaveBeenCalled();
  });
});
