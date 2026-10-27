import { z } from 'zod';

export const demoRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  state: z.string().max(20_000).nullable().default(null),
}).strict();

export const leadFactSchema = z.object({
  field: z.enum(['category', 'model', 'budget', 'payment', 'trade_in', 'timeline', 'visit', 'negotiation', 'purpose']),
  quote: z.string().trim().min(2).max(120),
}).strict();

export const agentOutputSchema = z.object({
  vehicleIds: z.array(z.uuid()).max(3),
  question: z.string().trim().max(180).nullable(),
  stage: z.enum(['researching', 'requirements_defined', 'ready_for_seller']),
  facts: z.array(leadFactSchema).max(7),
  nextAction: z.enum(['show_options', 'ask_preference', 'ask_budget', 'ask_timeline', 'human_trade_in', 'human_financing', 'human_visit', 'human_requested', 'continue_research']),
  wantsHuman: z.boolean(),
}).strict();

export type AgentOutput = z.infer<typeof agentOutputSchema>;

export const nextActionLabels: Record<AgentOutput['nextAction'], string> = {
  show_options: 'Apresentar opções e confirmar o veículo de maior interesse.',
  ask_preference: 'Perguntar qual categoria ou modelo prefere.',
  ask_budget: 'Entender a faixa de orçamento.',
  ask_timeline: 'Entender quando pretende comprar.',
  human_trade_in: 'Pedir avaliação da troca ao vendedor.',
  human_financing: 'Encaminhar dúvidas de financiamento ao vendedor.',
  human_visit: 'Combinar uma visita com o vendedor.',
  human_requested: 'Atendimento humano solicitado.',
  continue_research: 'Manter contato e ajudar a comparar opções.',
};
