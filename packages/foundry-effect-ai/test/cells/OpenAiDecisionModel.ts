import { expect } from '@effect/vitest';
import type * as AiError from 'effect/ai/AiError';
import * as Decision from 'effect/ai/Decision';
import * as DecisionModel from 'effect/ai/DecisionModel';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Random from 'effect/Random';
import * as Schema from 'effect/Schema';
import * as OpenAiDecisionModel from '../../src/OpenAiDecisionModel.ts';
import type { Cell, Env } from '../harness.ts';

const rid = 'ri.language-model-service..language-model.gpt-6-luna';
const ticket =
  'My order 1234 arrived with a cracked screen. I need a replacement today or I will cancel.';
// 128x128 solid red PNG.
const redPng =
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAAxElEQVR42u3RMQ0AAAjAsPk3DTLgaDIFa1M6zAIAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABAADAAgAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAjAixYgaMOy89oM6gAAAABJRU5ErkJggg==';

const withLuna =
  (env: Env) =>
  <A, R>(effect: Effect.Effect<A, AiError.AiError, R>) =>
    Effect.provide(effect, Layer.provide(OpenAiDecisionModel.model('gpt-6-luna'), env.client()));

/** The error an effect must fail with; success is a defect. */
const failure = <A, R>(effect: Effect.Effect<A, AiError.AiError, R>) =>
  effect.pipe(Effect.flip, Effect.orDie);

/** The one decisions request a cell sent, with `questions` and `input` as given. */
const expectRequest = (env: Env, body: object) => {
  if (!env.live) {
    expect(env.requests).toEqual([
      expect.objectContaining({
        url: 'https://example.palantirfoundry.com/api/v2/llm/proxy/openai/v1/decisions',
        body: { model: rid, ...body },
      }),
    ]);
  }
};

const damaged = Decision.probability({
  instructions: 'Does the customer report damage?',
  criteria: { false: 'No damage is mentioned.', true: 'The item arrived damaged.' },
});

export const cells: Readonly<Record<string, Cell>> = {
  boolean: (env) =>
    Effect.gen(function* () {
      const definition = Decision.make({ input: Schema.String, decisions: { damaged } });
      const response = yield* withLuna(env)(DecisionModel.decide(definition, { input: ticket }));
      expect(response.answers.damaged.probability).toBeGreaterThan(0.8);
      expect(response.modelId).toBe('gpt-6-luna');
      expect(response.usage.inputTokens).toBeGreaterThan(0);
      expectRequest(env, {
        input: ticket,
        questions: [
          {
            type: 'predicate',
            name: 'damaged',
            instructions:
              'Does the customer report damage?\n\nfalse: No damage is mentioned.\ntrue: The item arrived damaged.',
          },
        ],
      });
    }),

  choice: (env) =>
    Effect.gen(function* () {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          team: Decision.classify({
            instructions: 'Which team should handle this ticket?',
            criteria: {
              billing: 'Payments, invoices and refunds.',
              shipping: 'Delivery problems and damaged items.',
              other: null,
            },
          }),
        },
      });
      const { answers } = yield* withLuna(env)(DecisionModel.decide(definition, { input: ticket }));
      expect(answers.team.label).toBe('shipping');
      expect(Object.keys(answers.team.probabilities).toSorted()).toEqual([
        'billing',
        'other',
        'shipping',
      ]);
      expectRequest(env, {
        input: ticket,
        questions: [
          {
            type: 'choice',
            name: 'team',
            instructions: 'Which team should handle this ticket?',
            choices: [
              { value: 'billing', description: 'Payments, invoices and refunds.' },
              { value: 'shipping', description: 'Delivery problems and damaged items.' },
              { value: 'other' },
            ],
          },
        ],
      });
    }),

  // Core rejects a classify answer that lacks any label's probability, so a pass shows Foundry
  // returns the whole distribution for 20 choices.
  'wide-choice': (env) =>
    Effect.gen(function* () {
      const criteria = Object.fromEntries(
        Array.from({ length: 20 }, (_, index) => [
          `c${index}`,
          index === 7 ? 'Damaged or broken items.' : `Questions about topic ${index}.`,
        ]),
      );
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          category: Decision.classify({
            instructions: 'Which category fits the ticket?',
            criteria,
          }),
        },
      });
      const { answers } = yield* withLuna(env)(DecisionModel.decide(definition, { input: ticket }));
      expect(answers.category.label).toBe('c7');
      expect(Object.keys(answers.category.probabilities)).toHaveLength(20);
    }),

  score: (env) =>
    Effect.gen(function* () {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          urgency: Decision.rate({
            instructions: 'How urgent is this ticket?',
            criteria: [
              { label: 'low', description: 'Can wait a week.' },
              { label: 'medium', description: 'Should be handled this week.' },
              { label: 'high', description: 'Needs action today.' },
            ],
          }),
        },
      });
      const { answers } = yield* withLuna(env)(DecisionModel.decide(definition, { input: ticket }));
      expect(answers.urgency.label).toBe('high');
      expect(answers.urgency.rating).toBeGreaterThan(1);
      expect(Object.keys(answers.urgency.probabilities)).toEqual(['low', 'medium', 'high']);
      expectRequest(env, {
        input: ticket,
        questions: [
          {
            type: 'score',
            name: 'urgency',
            instructions: 'How urgent is this ticket?',
            levels: [
              { label: 'low', description: 'Can wait a week.' },
              { label: 'medium', description: 'Should be handled this week.' },
              { label: 'high', description: 'Needs action today.' },
            ],
          },
        ],
      });
    }),

  'json-state': (env) =>
    Effect.gen(function* () {
      const definition = Decision.make({
        input: Schema.Struct({ id: Schema.Finite, body: Schema.String, priority: Schema.String }),
        decisions: {
          urgent: Decision.probability({ instructions: 'Is the ticket priority p1?' }),
        },
      });
      const { answers } = yield* withLuna(env)(
        DecisionModel.decide(definition, { input: { id: 1234, body: ticket, priority: 'p1' } }),
      );
      expect(answers.urgent.probability).toBeGreaterThan(0.8);
      expectRequest(env, {
        input: `{"id":1234,"body":"${ticket}","priority":"p1"}`,
        questions: [
          { type: 'predicate', name: 'urgent', instructions: 'Is the ticket priority p1?' },
        ],
      });
    }),

  // Core replaces the image with a UUID from `Random`; the seed makes the golden request stable.
  'image-state': (env) =>
    Effect.gen(function* () {
      const definition = Decision.make({
        input: Schema.Struct({ note: Schema.String, photo: Decision.Image }),
        decisions: {
          color: Decision.classify({
            instructions: 'What color fills the photo?',
            criteria: { red: null, green: null, blue: null },
          }),
        },
      });
      const note = 'Customer photo of the returned case.';
      const reference = '7d692528-48a3-47bc-af17-a6c40198d709';
      const remote = yield* failure(
        withLuna(env)(
          DecisionModel.decide(definition, {
            input: {
              note,
              photo: { mediaType: 'image/png', data: new URL('https://example.com/photo.png') },
            },
          }),
        ),
      );
      expect(remote.reason._tag).toBe('InvalidUserInputError');
      expect(env.requests).toHaveLength(0);

      const { answers } = yield* withLuna(env)(
        DecisionModel.decide(definition, {
          input: { note, photo: { mediaType: 'image/png', data: redPng } },
        }),
      ).pipe(Random.withSeed('image-state'));
      expect(answers.color.label).toBe('red');
      expectRequest(env, {
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: `{"note":"${note}","photo":"${reference}"}` },
              { type: 'input_text', text: `Image ${reference}:` },
              { type: 'input_image', image_url: `data:image/png;base64,${redPng}` },
            ],
          },
        ],
        questions: [
          {
            type: 'choice',
            name: 'color',
            instructions: 'What color fills the photo?',
            choices: [{ value: 'red' }, { value: 'green' }, { value: 'blue' }],
          },
        ],
      });
    }),

  // Synthetic: the suite never sends a prompt Foundry refuses. A refusal with a null name
  // refuses every decision it left unanswered.
  refusal: (env) =>
    Effect.gen(function* () {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          damaged,
          urgent: Decision.probability({ instructions: 'Does the customer need action today?' }),
        },
      });
      const decide = withLuna(env)(DecisionModel.decide(definition, { input: ticket }));
      const settle = withLuna(env)(DecisionModel.decideSettled(definition, { input: ticket }));

      expect((yield* failure(decide)).reason._tag).toBe('ContentPolicyError');
      for (const { outcomes } of [yield* settle, yield* settle]) {
        expect(outcomes.damaged).toMatchObject({ _tag: 'Failure', failure: { reason: 'Refused' } });
        expect(outcomes.urgent).toMatchObject({ _tag: 'Success', success: { probability: 0.9 } });
      }
    }),
};
