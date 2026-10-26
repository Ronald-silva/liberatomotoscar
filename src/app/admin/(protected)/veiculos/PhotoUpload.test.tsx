// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotoUpload } from './PhotoUpload';
import type { VehicleDraft } from './[id]/useVehicleDraft';

const { addVehiclePhoto, refresh } = vi.hoisted(() => ({ addVehiclePhoto: vi.fn(), refresh: vi.fn() }));
vi.mock('./actions', () => ({ addVehiclePhoto }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const draft = () => ({
  enqueue: vi.fn((job: (version: number) => Promise<unknown>) => job(3)),
  photoAdded: vi.fn(),
}) as unknown as VehicleDraft;

beforeEach(() => {
  addVehiclePhoto.mockReset();
  refresh.mockReset();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 640, height: 480, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['foto'], { type: 'image/jpeg' })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('separa câmera de galeria com atributos corretos', () => {
  render(<PhotoUpload vehicleId="v1" draft={draft()} />);
  const camera = screen.getByLabelText('Tirar foto') as HTMLInputElement;
  const gallery = screen.getByLabelText('Escolher da galeria') as HTMLInputElement;
  expect(camera.getAttribute('capture')).toBe('environment');
  expect(camera.multiple).toBe(false);
  expect(gallery.hasAttribute('capture')).toBe(false);
  expect(gallery.multiple).toBe(true);
});

it('envia fotos em fila, anuncia o progresso e atualiza a galeria', async () => {
  let release: (state: { message: string; version: number }) => void = () => {};
  addVehiclePhoto.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
    .mockResolvedValueOnce({ message: 'Foto adicionada.', version: 5 });
  const state = draft();
  let version = 3;
  vi.mocked(state.enqueue).mockImplementation((job) => job(version++));
  render(<PhotoUpload vehicleId="v1" draft={state} />);
  const gallery = screen.getByLabelText('Escolher da galeria') as HTMLInputElement;
  const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })];
  fireEvent.change(gallery, { target: { files } });
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Enviando foto 1 de 2'));
  await act(async () => { release({ message: 'Foto adicionada.', version: 4 }); });
  await waitFor(() => expect(addVehiclePhoto).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(state.photoAdded).toHaveBeenCalledTimes(2));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByText('2 fotos adicionadas.')).toBeTruthy();
});

it('explica quando a imagem não pode ser preparada', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode'); }));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bad');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(Image.prototype, 'decode').mockRejectedValue(new Error('decode'));
  render(<PhotoUpload vehicleId="v1" draft={draft()} />);
  fireEvent.change(screen.getByLabelText('Tirar foto'), { target: { files: [new File(['x'], 'bad.heic', { type: 'image/heic' })] } });
  await waitFor(() => expect(screen.getByText('Não foi possível preparar esta foto. Tente outra.')).toBeTruthy());
  expect(addVehiclePhoto).not.toHaveBeenCalled();
});
