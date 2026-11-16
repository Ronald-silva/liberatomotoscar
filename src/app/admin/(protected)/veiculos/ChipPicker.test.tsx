// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChipPicker } from './ChipPicker';

afterEach(cleanup);

const MARCAS = ['Honda', 'Yamaha', 'Suzuki', 'Shineray', 'Haojue', 'Dafra',
  'Kawasaki', 'Royal Enfield', 'BMW', 'Harley-Davidson', 'Triumph'];

const chips = () => screen.getAllByRole('button').map((botao) => botao.textContent);

describe('escolha por toque, sem a lista inteira na cara', () => {
  it('sem limite, a lista aparece inteira — é o caso da cor curta', () => {
    render(<ChipPicker legend="Cor" options={['Preto', 'Branco']} value="" onChange={vi.fn()} />);
    expect(chips()).toEqual(['Preto', 'Branco', 'Outra']);
    expect(screen.queryByRole('button', { name: /Ver todas/ })).toBeNull();
  });

  it('com limite, mostra o começo da lista e guarda o resto atrás de um toque', () => {
    render(<ChipPicker legend="Marca" options={MARCAS} value="" onChange={vi.fn()}
      otherLabel="Outra marca" visibleCount={6} allLabel="Ver todas as marcas" />);
    expect(chips()).toEqual([...MARCAS.slice(0, 6), 'Ver todas as marcas (11)', 'Outra marca']);
    expect(screen.queryByRole('button', { name: 'Triumph' })).toBeNull();
  });

  it('"Ver todas" abre a lista e some — não é um interruptor que confunde', () => {
    render(<ChipPicker legend="Marca" options={MARCAS} value="" onChange={vi.fn()}
      otherLabel="Outra marca" visibleCount={6} allLabel="Ver todas as marcas" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as marcas (11)' }));
    expect(chips()).toEqual([...MARCAS, 'Outra marca']);
    expect(screen.queryByRole('button', { name: /Ver todas/ })).toBeNull();
  });

  // O defeito que isto impede: cadastrar uma Triumph, voltar amanhã e a tela não mostrar a marca
  // escolhida — parecendo que o cadastro se perdeu.
  it('a opção escolhida aparece mesmo estando além do limite', () => {
    render(<ChipPicker legend="Marca" options={MARCAS} value="Triumph" onChange={vi.fn()}
      otherLabel="Outra marca" visibleCount={6} allLabel="Ver todas as marcas" />);
    const escolhida = screen.getByRole('button', { name: 'Triumph' });
    expect(escolhida.getAttribute('aria-pressed')).toBe('true');
    // E aparece no lugar dela, não jogada para o fim: a ordem da lista não muda.
    expect(chips().indexOf('Triumph')).toBeGreaterThan(chips().indexOf('Honda'));
  });

  it('escolher continua sendo um toque, e trocar também', () => {
    const onChange = vi.fn();
    render(<ChipPicker legend="Marca" options={MARCAS} value="" onChange={onChange} visibleCount={6} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yamaha' }));
    expect(onChange).toHaveBeenCalledWith('Yamaha');
  });

  it('"Outra" segue abrindo o campo livre, com a lista encurtada', () => {
    const onChange = vi.fn();
    render(<ChipPicker legend="Marca" options={MARCAS} value="" onChange={onChange}
      otherLabel="Outra marca" otherPlaceholder="Digite a marca" visibleCount={6} />);
    fireEvent.click(screen.getByRole('button', { name: 'Outra marca' }));
    const campo = screen.getByRole('textbox', { name: 'Marca — digitar' });
    fireEvent.change(campo, { target: { value: 'Mottu' } });
    expect(onChange).toHaveBeenCalledWith('Mottu');
  });

  it('um valor fora da lista nasce com o campo livre aberto, mesmo com limite', () => {
    render(<ChipPicker legend="Marca" options={MARCAS} value="Mottu" onChange={vi.fn()}
      otherLabel="Outra marca" visibleCount={6} allLabel="Ver todas as marcas" />);
    expect((screen.getByRole('textbox', { name: 'Marca — digitar' }) as HTMLInputElement).value).toBe('Mottu');
    expect(screen.getByRole('button', { name: 'Outra marca' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('limite maior que a lista não inventa um "Ver todas" vazio', () => {
    render(<ChipPicker legend="Cor" options={['Preto', 'Branco']} value="" onChange={vi.fn()} visibleCount={6} />);
    expect(screen.queryByRole('button', { name: /Ver todas/ })).toBeNull();
    expect(chips()).toEqual(['Preto', 'Branco', 'Outra']);
  });
});
