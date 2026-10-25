// Não importa o serviço de propósito: ele puxa a autenticação, que não carrega em teste.
// Só mensagens conhecidas do domínio chegam ao usuário; o resto vira o texto genérico.
const GENERIC = 'Não foi possível salvar agora. Tente de novo.';

const KNOWN = new Map<string, string>([
  ['Veículo não encontrado', 'Veículo não encontrado.'],
  ['Este anúncio foi alterado. Recarregue antes de salvar.', 'Este anúncio foi alterado. Recarregue antes de salvar.'],
  ['Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto.', 'Para publicar, informe marca, modelo, preço maior que zero e pelo menos uma foto.'],
  ['Mudança de estado não permitida.', 'Mudança de estado não permitida.'],
  ['O anúncio precisa manter uma foto.', 'O anúncio precisa manter uma foto.'],
  ['Preço zero não é permitido em anúncio publicado.', 'Preço zero não é permitido em anúncio publicado.'],
  ['Confirme a disponibilidade para publicar.', 'Confirme a disponibilidade para publicar.'],
  ['Nenhum dado para atualizar.', 'Nenhum dado para atualizar.'],
  ['Formato de foto inválido.', 'Formato de foto inválido.'],
  ['Foto vazia ou maior que 10 MB.', 'Foto vazia ou maior que 10 MB.'],
  ['Escolha uma foto para enviar.', 'Escolha uma foto para enviar.'],
  ['Informe o preço em reais, por exemplo 18.500,00.', 'Informe o preço em reais, por exemplo 18.500,00.'],
  ['Ano e quilometragem devem ser números inteiros.', 'Ano e quilometragem devem ser números inteiros.'],
  ['O ano deve estar entre 1900 e 2100.', 'O ano deve estar entre 1900 e 2100.'],
  ['A quilometragem informada é grande demais.', 'A quilometragem informada é grande demais.'],
  ['Marca, modelo, versão e cor aceitam até 160 caracteres.', 'Marca, modelo, versão e cor aceitam até 160 caracteres.'],
  ['A descrição aceita até 5000 caracteres.', 'A descrição aceita até 5000 caracteres.'],
  ['O preço máximo é R$ 21.474.836,47.', 'O preço máximo é R$ 21.474.836,47.'],
  ['Escolha moto ou carro.', 'Escolha moto ou carro.'],
]);

export function toFormMessage(error: unknown): string {
  return KNOWN.get(error instanceof Error ? error.message : '') ?? GENERIC;
}
