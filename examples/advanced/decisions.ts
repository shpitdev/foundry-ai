import { loadFoundryConfig } from '@nyrra/foundry-ai';
import { createFoundryOpenAI } from '@nyrra/foundry-ai/openai';
import { experimental_decide as decide } from 'ai';

const openai = createFoundryOpenAI(loadFoundryConfig());

const { answers, usage } = await decide({
  model: openai.decisionModel('gpt-6-luna'),
  state: 'My order arrived with a cracked screen. I need a replacement before Friday.',
  questions: {
    damaged: { type: 'boolean', instructions: 'Does the customer report a damaged item?' },
    route: {
      type: 'choice',
      instructions: 'Which team should handle this ticket?',
      criteria: {
        billing: 'Payments, invoices, and refunds.',
        shipping: 'Delivery problems and damaged items.',
        other: null,
      },
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent is this ticket?',
      criteria: ['Can wait a week.', 'Should be handled this week.', 'Needs action today.'],
    },
  },
});

console.log(JSON.stringify({ answers, usage }, null, 2));
