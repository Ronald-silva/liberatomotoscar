// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InventoryPager } from './InventoryPager';
import { InventorySearch } from './InventorySearch';
import { parseStatusFilter, StatusFilter } from './StatusFilter';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
    <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

const counts = { draft: 2, published: 3, reserved: 1, sold: 0, archived: 4, discarded: 0 };

describe('filtro do estoque', () => {
  it('mapeia o estado da URL e ignora valores desconhecidos', () => {
    expect(parseStatusFilter('rascunho')).toBe('draft');
    expect(parseStatusFilter('publicado')).toBe('published');
    expect(parseStatusFilter('qualquer')).toBeUndefined();
    expect(parseStatusFilter(['rascunho'])).toBeUndefined();
  });

  it('oferece links com contagem e marca o filtro ativo', () => {
    render(<StatusFilter counts={counts} active="draft" />);
    expect(screen.getByRole('link', { name: 'Tudo (10)' }).getAttribute('href')).toBe('/admin');
    expect(screen.getByRole('link', { name: 'Rascunhos (2)' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Publicados (3)' }).getAttribute('href')).toBe('/admin?estado=publicado');
    expect(screen.queryByRole('link', { name: /Descartados/ })).toBeNull();
  });

  it('mostra descartados quando existem e não inventa contagens após falha', () => {
    render(<StatusFilter counts={{ ...counts, discarded: 1 }} active="discarded" />);
    expect(screen.getByRole('link', { name: 'Descartados (1)' }).getAttribute('aria-current')).toBe('page');
    cleanup();
    render(<StatusFilter counts={null} />);
    expect(screen.getByRole('link', { name: 'Tudo' })).toBeTruthy();
    expect(screen.queryByText('(0)')).toBeNull();
  });

  // O defeito que isto impede: buscar "honda", tocar em "Publicados" e ver o estoque inteiro.
  it('toda ficha de estado leva a busca em vigor consigo', () => {
    render(<StatusFilter counts={counts} active="published" search="honda fan" />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toContain('busca=honda+fan');
      expect(link.getAttribute('href')).not.toContain('pagina=');
    }
  });
});

describe('busca do estoque', () => {
  it('é um formulário GET para /admin, com campo de busca de verdade', () => {
    const { container } = render(<InventorySearch search="" total={11} />);
    const form = container.querySelector('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/admin');
    expect(form.getAttribute('role')).toBe('search');
    const campo = screen.getByRole('searchbox', { name: /Buscar no estoque/ }) as HTMLInputElement;
    expect(campo.name).toBe('busca');
    expect(campo.type).toBe('search');
  });

  it('a ficha de estado aberta viaja escondida; a página, não', () => {
    const { container } = render(<InventorySearch search="honda" status="published" total={2} />);
    const escondidos = [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')];
    expect(escondidos.map((campo) => [campo.name, campo.value])).toEqual([['estado', 'publicado']]);
    expect(container.querySelector('input[name="pagina"]')).toBeNull();
  });

  it('o campo volta preenchido com o que foi buscado', () => {
    render(<InventorySearch search="citroën c3" total={1} />);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('citroën c3');
  });

  it('diz quantos achou, no singular e no plural, e oferece desfazer', () => {
    const { rerender } = render(<InventorySearch search="honda" total={2} />);
    expect(screen.getByRole('status').textContent).toContain('2 veículos para honda');
    rerender(<InventorySearch search="honda" total={1} />);
    expect(screen.getByRole('status').textContent).toContain('1 veículo para honda');
    rerender(<InventorySearch search="honda" total={0} />);
    expect(screen.getByRole('status').textContent).toContain('Nenhum veículo para honda');
    expect(screen.getByRole('link', { name: 'Limpar busca' }).getAttribute('href')).toBe('/admin');
  });

  it('sem busca não há resumo nem link de limpar', () => {
    render(<InventorySearch search="" total={11} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Limpar busca' })).toBeNull();
  });

  // A contagem falhou no servidor: a tela diz que buscou, sem inventar um número.
  it('sem contagem o resumo não inventa quantidade', () => {
    render(<InventorySearch search="honda" total={null} />);
    const resumo = screen.getByRole('status').textContent ?? '';
    expect(resumo).toContain('honda');
    expect(resumo).not.toMatch(/\d/);
  });
});

describe('páginas do estoque', () => {
  it('com uma página só, não desenha nada — é o caso do estoque de hoje', () => {
    const { container } = render(<InventoryPager search="" page={1} pages={1} />);
    expect(container.innerHTML).toBe('');
  });

  it('a primeira página não oferece anterior clicável', () => {
    render(<InventoryPager search="" page={1} pages={3} />);
    expect(screen.queryByRole('link', { name: 'Anterior' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Próxima' }).getAttribute('href')).toBe('/admin?pagina=2');
    expect(screen.getByRole('status').textContent).toBe('Página 1 de 3');
  });

  it('a última página não oferece próxima clicável', () => {
    render(<InventoryPager search="" page={3} pages={3} />);
    expect(screen.queryByRole('link', { name: 'Próxima' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Anterior' }).getAttribute('href')).toBe('/admin?pagina=2');
  });

  it('virar a página preserva a ficha de estado e a busca', () => {
    render(<InventoryPager status="draft" search="honda" page={2} pages={4} />);
    const nav = screen.getByRole('navigation', { name: 'Páginas do estoque' });
    expect(within(nav).getByRole('link', { name: 'Anterior' }).getAttribute('href')).toBe('/admin?estado=rascunho&busca=honda');
    expect(within(nav).getByRole('link', { name: 'Próxima' }).getAttribute('href')).toBe('/admin?estado=rascunho&busca=honda&pagina=3');
  });

  it('uma página fora da faixa é tratada como a borda mais próxima, não como erro', () => {
    render(<InventoryPager search="" page={99} pages={3} />);
    expect(screen.getByRole('status').textContent).toBe('Página 3 de 3');
    expect(screen.queryByRole('link', { name: 'Próxima' })).toBeNull();
  });
});
