// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotoGallery } from './PhotoGallery';
import type { VehicleDraft } from './[id]/useVehicleDraft';

const { removeVehiclePhoto, setVehicleCover, refresh } = vi.hoisted(() => ({ removeVehiclePhoto: vi.fn(), setVehicleCover: vi.fn(), refresh: vi.fn() }));
vi.mock('./actions', () => ({ removeVehiclePhoto, setVehicleCover }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const draft = () => ({ enqueue: vi.fn((job: (version: number) => Promise<unknown>) => job(3)), photoRemoved: vi.fn() }) as unknown as VehicleDraft;
const photos = [{ id: 'capa', isCover: true, url: null }, { id: 'outra', isCover: false, url: null }];

beforeEach(() => { removeVehiclePhoto.mockReset(); setVehicleCover.mockReset(); refresh.mockReset(); });
afterEach(cleanup);

it('oferece definir capa somente na foto sem capa', async () => {
  setVehicleCover.mockResolvedValue({ message: 'Capa atualizada.', version: 4 });
  render(<PhotoGallery vehicleId="v1" draft={draft()} photos={photos} />);
  expect(screen.getAllByRole('button', { name: 'Definir como capa' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Definir como capa' }));
  await waitFor(() => expect(setVehicleCover).toHaveBeenCalledTimes(1));
  const data = setVehicleCover.mock.calls[0][1] as FormData;
  expect(data.get('imageId')).toBe('outra');
  expect(data.get('version')).toBe('3');
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

it('pede confirmação antes de remover e avisa o rascunho depois', async () => {
  removeVehiclePhoto.mockResolvedValue({ message: 'Foto removida.', version: 4 });
  const state = draft();
  render(<PhotoGallery vehicleId="v1" draft={state} photos={[photos[0]]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
  expect(removeVehiclePhoto).not.toHaveBeenCalled();
  expect(screen.getByText('Remover esta foto?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sim, remover' }));
  await waitFor(() => expect(removeVehiclePhoto).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(state.photoRemoved).toHaveBeenCalledTimes(1));
  expect(refresh).toHaveBeenCalledTimes(1);
});
