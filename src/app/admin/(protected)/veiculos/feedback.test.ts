import { describe, expect, it } from 'vitest';
import { toFormMessage } from './feedback';

const generic = 'Não foi possível salvar agora. Tente de novo.';

describe('mensagem de formulário', () => {
  it('explica conflito de edição simultânea', () => {
    expect(toFormMessage(new Error('Este anúncio foi alterado. Recarregue antes de salvar.')))
      .toBe('Este anúncio foi alterado. Recarregue antes de salvar.');
  });
  it('explica anúncio inexistente, com ponto final', () => {
    expect(toFormMessage(new Error('Veículo não encontrado'))).toBe('Veículo não encontrado.');
  });
  it('repassa a exigência de publicação ao usuário', () => {
    const message = 'Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto.';
    expect(toFormMessage(new Error(message))).toBe(message);
  });
  it('não vaza detalhe interno de falha inesperada', () => {
    expect(toFormMessage(new Error('connect ECONNREFUSED 10.0.0.1:5432'))).toBe(generic);
  });
  it('usa o texto genérico quando não é um Error', () => {
    expect(toFormMessage('Veículo não encontrado')).toBe(generic);
    expect(toFormMessage(undefined)).toBe(generic);
  });
});
