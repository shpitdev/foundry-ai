import { APICallError, experimental_decide as decide } from 'ai';
import { describe, expect, it } from 'vitest';
import { OPENAI_DECISION_MODEL_IDS, OPENAI_MODELS } from '../models/openai-models.js';
import { createFoundryOpenAI } from '../providers/openai.js';
import { loadLiveFoundryConfig } from './helpers/live-foundry.js';

/** 16x16 solid red PNG. */
const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mO4IyJCEmIY1TCqYfhqAAACcQQQFd0BdQAAAABJRU5ErkJggg==';
const config = loadLiveFoundryConfig();
const openai = createFoundryOpenAI(config);
const ticket =
  'My order 1234 arrived with a cracked screen. I need a replacement today or I will cancel.';

describe.each(OPENAI_DECISION_MODEL_IDS)('%s decisions', (modelId) => {
  const rid = OPENAI_MODELS[modelId].rid;
  const model = openai.decisionModel(modelId);

  it.each([modelId, rid])('answers a boolean question through %s', async (target) => {
    const result = await decide({
      model: openai.decisionModel(target),
      state: ticket,
      questions: { damaged: { type: 'boolean', instructions: 'Does the customer report damage?' } },
    });
    expect(result.answers.damaged.probability).toBeGreaterThan(0.8);
    expect(result.response.modelId).toMatch(/^gpt-6-luna/);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('answers a boolean question defined only by criteria', async () => {
    const result = await decide({
      model,
      state: ticket,
      questions: {
        deadline: { type: 'boolean', criteria: { true: 'The customer states a deadline.' } },
      },
    });
    expect(result.answers.deadline.probability).toBeGreaterThan(0.8);
  });

  it('answers choice, score, and boolean questions in one call', async () => {
    const result = await decide({
      model,
      state: ticket,
      questions: {
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
        churn: { type: 'boolean', instructions: 'Does the customer threaten to cancel?' },
      },
    });
    expect(result.answers.route.choice).toBe('shipping');
    expect(Object.keys(result.answers.route.probabilities ?? {}).sort()).toEqual([
      'billing',
      'other',
      'shipping',
    ]);
    expect(result.answers.urgency.score).toBeGreaterThan(1);
    expect(result.answers.urgency.score).toBeLessThanOrEqual(2);
    expect(Object.keys(result.answers.urgency.probabilities ?? {})).toEqual(['0', '1', '2']);
    expect(result.answers.churn.probability).toBeGreaterThan(0.8);
    expect(result.providerMetadata?.openai).toMatchObject({
      confidence: { route: expect.any(Number), urgency: expect.any(Number) },
    });
  });

  it('uses JSON object state', async () => {
    const result = await decide({
      model,
      state: { ticket: { id: 1234, body: ticket, priority: 'p1' } },
      questions: {
        highPriority: { type: 'boolean', instructions: 'Is the ticket priority p1?' },
      },
    });
    expect(result.answers.highPriority.probability).toBeGreaterThan(0.8);
  });

  it('uses mixed text, JSON, and image state', async () => {
    const result = await decide({
      model,
      state: [
        { type: 'text', text: 'Customer photo and order record:' },
        { type: 'json', value: { orderId: 1234, item: 'phone case', color: 'red' } },
        { type: 'file', mediaType: 'image/png', data: RED_PNG },
      ],
      questions: {
        color: {
          type: 'choice',
          instructions: 'What color fills the attached image?',
          criteria: { red: null, green: null, blue: null },
        },
        matches: {
          type: 'boolean',
          instructions: 'Does the image color match the color in the order record?',
        },
      },
    });
    expect(result.answers.color.choice).toBe('red');
    expect(result.answers.matches.probability).toBeGreaterThan(0.5);
  });

  it('accepts a safety identifier', async () => {
    const result = await decide({
      model,
      state: ticket,
      questions: { damaged: { type: 'boolean', instructions: 'Does the customer report damage?' } },
      providerOptions: { openai: { safetyIdentifier: 'foundry-ai-live-test' } },
    });
    expect(result.warnings).toEqual([]);
    expect(result.answers.damaged.probability).toBeGreaterThan(0.8);
  });

  it('answers the maximum of 400 questions', async () => {
    const questions = Object.fromEntries(
      Array.from({ length: 400 }, (_, index) => [
        `q${index}`,
        { type: 'boolean' as const, instructions: `Does the text contain the number ${index}?` },
      ]),
    );
    const result = await decide({ model, state: 'Order 1234 shipped in 3 boxes.', questions });
    expect(Object.keys(result.answers)).toHaveLength(400);
    expect(result.answers.q3?.probability).toBeGreaterThan(0.5);
    expect(result.answers.q7?.probability).toBeLessThan(0.5);
  });
});

describe('Foundry decisions proxy contract', () => {
  it('rejects models without Decisions support', async () => {
    await expect(
      decide({
        model: openai.decisionModel('gpt-6-sol'),
        state: ticket,
        questions: { damaged: { type: 'boolean', instructions: 'Is damage reported?' } },
      }),
    ).rejects.toSatisfy(
      (error) =>
        APICallError.isInstance(error) &&
        error.statusCode === 404 &&
        String(error.responseBody).includes('LanguageModelNotAvailable'),
    );
  });

  it('still rejects prompt_cache_key', async () => {
    const response = await fetch(`${config.foundryUrl}/api/v2/llm/proxy/openai/v1/decisions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODELS['gpt-6-luna'].rid,
        prompt_cache_key: 'foundry-ai-live-test',
        input: ticket,
        questions: [{ type: 'predicate', name: 'damaged', instructions: 'Is damage reported?' }],
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('prompt_cache_key');
  });
});
