// @vitest-environment happy-dom
import { isValidElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AccessDeniedError extends Error {}
  return { AccessDeniedError, requireAdmin: vi.fn(), redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }), loadTabCounts: vi.fn() };
});
vi.mock('@/server/authz', () => ({ requireAdmin: mocks.requireAdmin, AccessDeniedError: mocks.AccessDeniedError }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, usePathname: () => '/admin' }));
vi.mock('./tabCounts', () => ({ loadTabCounts: mocks.loadTabCounts }));

import ProtectedAdminLayout from './layout';

beforeEach(() => { vi.resetAllMocks(); mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT'); }); });

it('quem nao e admin vai para o login e nao dispara contagem nenhuma', async () => {
  mocks.requireAdmin.mockRejectedValue(new mocks.AccessDeniedError());
  await expect(ProtectedAdminLayout({ children: 'x' })).rejects.toThrow('NEXT_REDIRECT');
  expect(mocks.redirect).toHaveBeenCalledWith('/admin/login');
  expect(mocks.loadTabCounts).not.toHaveBeenCalled();
});

it('outro erro de autenticacao continua subindo, sem virar redirect', async () => {
  mocks.requireAdmin.mockRejectedValue(new Error('banco fora'));
  await expect(ProtectedAdminLayout({ children: 'x' })).rejects.toThrow('banco fora');
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it('admin recebe a tela e a barra com as contagens', async () => {
  mocks.requireAdmin.mockResolvedValue({ userId: 'a' });
  mocks.loadTabCounts.mockResolvedValue({ agenda: 2, conversas: 1 });
  const tree = await ProtectedAdminLayout({ children: 'conteudo' });
  expect(isValidElement(tree)).toBe(true);
  const { renderToStaticMarkup } = await import('react-dom/server');
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('conteudo');
  expect(html).toContain('Seções do painel');
});
