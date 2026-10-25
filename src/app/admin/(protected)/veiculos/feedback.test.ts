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
  it.each(['Formato de foto inválido.', 'O anúncio precisa manter uma foto.', 'Foto vazia ou maior que 10 MB.', 'Escolha uma foto para enviar.'])(
    'repassa a mensagem de foto "%s"', (message) => {
      expect(toFormMessage(new Error(message))).toBe(message);
    });
  it.each([
    'Informe o preço em reais, por exemplo 18.500,00.', 'Ano e quilometragem devem ser números inteiros.',
    'O ano deve estar entre 1900 e 2100.', 'A quilometragem informada é grande demais.',
    'Marca, modelo, versão e cor aceitam até 160 caracteres.', 'A descrição aceita até 5000 caracteres.',
    'O preço máximo é R$ 21.474.836,47.', 'Escolha moto ou carro.',
  ])(
    'repassa a mensagem de validação "%s"', (message) => {
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
