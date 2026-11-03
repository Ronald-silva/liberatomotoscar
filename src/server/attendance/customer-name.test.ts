import { expect, it } from 'vitest';
import { cleanCustomerName } from './customer-name';

it('trata caixa alta e preserva nomes curtos e siglas', () => {
  expect(cleanCustomerName('MARCOS ANDRADE DA SILVA')).toBe('Marcos andrade da silva');
  expect(cleanCustomerName('Ana')).toBe('Ana');
  expect(cleanCustomerName('JR')).toBe('JR');
});

it('limita o cartão e ignora nome vazio', () => {
  expect(cleanCustomerName('x'.repeat(80))?.length).toBeLessThanOrEqual(40);
  expect(cleanCustomerName('   ')).toBeNull();
  expect(cleanCustomerName(null)).toBeNull();
});
