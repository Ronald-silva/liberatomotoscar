// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VehicleEditor } from './VehicleEditor';

const { changeStatus, saveVehicle, refresh } = vi.hoisted(() => ({ changeStatus: vi.fn(), saveVehicle: vi.fn(), refresh: vi.fn() }));
vi.mock('../actions', () => ({ changeStatus, saveVehicle, addVehiclePhoto: vi.fn(), removeVehiclePhoto: vi.fn(), setVehicleCover: vi.fn(), discardVehicleDraft: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const fields = { brand: 'Honda', model: 'CG 160', versionName: '', year: '2024', mileageKm: '1200', color: 'Preto', description: '', price: '18.500' };
const props = {
  vehicleId: 'v1', slug: 'honda-cg-160-teste', type: 'motorcycle' as const, status: 'draft' as const, isNew: true, canDiscard: true,
  targets: ['published', 'archived'] as ('published' | 'archived')[], initialVersion: 3,
  initialFields: fields, initialMissing: ['Pelo menos uma foto'], photos: [], currentYear: 2026,
};

beforeEach(() => { changeStatus.mockReset(); saveVehicle.mockReset(); refresh.mockReset(); });
afterEach(cleanup);

it('ordena as três seções e mantém uma ação principal no rodapé', () => {
  render(<VehicleEditor {...props} />);
  expect(screen.getAllByRole('heading', { level: 2 }).slice(0, 3).map((heading) => heading.textContent)).toEqual([
    '1O veículo', '2Fotos', '3Conferir e publicar',
  ]);
  const publish = screen.getByRole('button', { name: 'Publicar anúncio' }) as HTMLButtonElement;
  const management = screen.getByRole('heading', { name: 'Gerenciar anúncio' });
  expect(publish.compareDocumentPosition(management) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(publish.disabled).toBe(true);
  expect(screen.getByText(/Para publicar, complete: Pelo menos uma foto/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Excluir rascunho' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Excluir rascunho' }));
  expect(screen.getByText(/As fotos enviadas serão apagadas/)).toBeTruthy();
});

it('pede confirmação de disponibilidade e publica com a versão atual', async () => {
  changeStatus.mockResolvedValue({ message: 'Estado atualizado.', version: 4 });
  render(<VehicleEditor {...props} initialMissing={[]} photos={[{ id: 'p1', url: null, isCover: true }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Publicar anúncio' }));
  expect(screen.getByText('Este veículo está disponível para venda?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sim, publicar anúncio' }));
  await waitFor(() => expect(changeStatus).toHaveBeenCalledTimes(1));
  const data = changeStatus.mock.calls[0][1] as FormData;
  expect(data.get('version')).toBe('3');
  expect(data.get('confirmAvailability')).toBe('true');
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Anúncio publicado. Situação: Publicado.')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Situação: Publicado' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Excluir rascunho' })).toBeNull();
  expect((screen.getByRole('link', { name: 'Ver anúncio público' }) as HTMLAnchorElement).getAttribute('href'))
    .toBe('/veiculos/honda-cg-160-teste');
});

it('mostra anúncio publicado sem etapas nem rodapé e sem exclusão', () => {
  render(<VehicleEditor {...props} status="published" isNew={false} canDiscard={false}
    targets={['reserved', 'sold', 'archived']} initialMissing={[]} />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Honda CG 160');
  expect(screen.getByRole('heading', { name: 'O veículo' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Publicar anúncio' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Excluir rascunho' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Reservar' })).toBeTruthy();
});

it('só marca vendido após confirmação e envia a versão atual', async () => {
  changeStatus.mockResolvedValue({ message: 'Estado atualizado.', version: 4 });
  render(<VehicleEditor {...props} status="published" isNew={false} canDiscard={false}
    targets={['reserved', 'sold', 'archived']} initialMissing={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Marcar vendido' }));
  expect(changeStatus).not.toHaveBeenCalled();
  expect(screen.getByText(/Confirmar venda/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sim, marcar vendido' }));
  await waitFor(() => expect(changeStatus).toHaveBeenCalledTimes(1));
  const data = changeStatus.mock.calls[0][1] as FormData;
  expect(data.get('status')).toBe('sold');
  expect(data.get('version')).toBe('3');
  expect(data.get('confirmSale')).toBe('true');
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

it('permite cancelar e exige nova confirmação para republicar', async () => {
  changeStatus.mockResolvedValue({ message: 'Estado atualizado.', version: 4 });
  render(<VehicleEditor {...props} status="sold" isNew={false} canDiscard={false}
    targets={['published', 'archived']} initialMissing={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Republicar' }));
  expect(changeStatus).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(changeStatus).not.toHaveBeenCalled();
  expect(screen.queryByText(/disponibilidade foi conferida/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Republicar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sim, republicar' }));
  await waitFor(() => expect(changeStatus).toHaveBeenCalledTimes(1));
  const data = changeStatus.mock.calls[0][1] as FormData;
  expect(data.get('status')).toBe('published');
  expect(data.get('confirmAvailability')).toBe('true');
});
