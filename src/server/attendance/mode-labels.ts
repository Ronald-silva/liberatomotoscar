import type { AttendanceMode } from './settings';

/** Os três modos da Dayse no WhatsApp, na ordem em que a tela os mostra. Texto simples, sem emoji. */
export const whatsappModes: readonly { value: AttendanceMode; label: string; description: string }[] = [
  { value: 'ai', label: 'Dayse responde sozinha',
    // Financiamento e troca ela NÃO responde: `prompt.ts:84` manda chamar vendedor, e `:79` proíbe
    // prometer aprovação. Dizer que ela responde sobre financiamento aqui faria o painel afirmar o
    // que o agente tem instrução explícita de não fazer.
    description: 'Responde sobre o estoque, preços e endereço, e chama um vendedor quando o cliente fala de financiamento, de troca ou pede uma pessoa.' },
  { value: 'deterministic', label: 'Atendimento por menu',
    description: 'Só oferece opções prontas (ver motos, ver carros, financiamento, troca e falar com vendedor), sem conversa aberta.' },
  { value: 'disabled', label: 'Dayse desligada',
    description: 'Nenhuma resposta automática. As mensagens chegam e a equipe responde.' },
];
