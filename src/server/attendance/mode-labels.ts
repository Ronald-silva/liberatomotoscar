import type { AttendanceMode } from './settings';

/** Os três modos da Dayse no WhatsApp, na ordem em que a tela os mostra. Texto simples, sem emoji. */
export const whatsappModes: readonly { value: AttendanceMode; label: string; description: string }[] = [
  { value: 'ai', label: 'Dayse responde sozinha',
    description: 'Responde sobre o estoque, preços, endereço e financiamento, e chama um vendedor quando o cliente pede.' },
  { value: 'deterministic', label: 'Atendimento por menu',
    description: 'Só oferece opções prontas (ver motos, ver carros, financiamento, troca e falar com vendedor), sem conversa aberta.' },
  { value: 'disabled', label: 'Dayse desligada',
    description: 'Nenhuma resposta automática. As mensagens chegam e a equipe responde.' },
];
