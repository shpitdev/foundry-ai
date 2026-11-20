// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/** OpenAI decision models (GPT-6 Luna) through Foundry's `/openai/v1/decisions` route. */
import * as AiError from 'effect/ai/AiError';
import type * as Decision from 'effect/ai/Decision';
import * as DecisionModel from 'effect/ai/DecisionModel';
import * as AiModel from 'effect/ai/Model';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Result from 'effect/Result';
import { FoundryClient } from './FoundryClient.ts';
import { models } from './internal/models/openai.ts';
import * as Wire from './internal/openai-decisions/schema.ts';

export const providerName = 'foundry-openai';

/** A catalog alias of a model that serves Decisions. */
export type ModelId = keyof typeof models;

export const model = (
  modelId: ModelId,
): AiModel.Model<typeof providerName, DecisionModel.DecisionModel, FoundryClient> =>
  AiModel.make(providerName, modelId, layer({ model: modelId }));

/**
 * String state is sent as `input` unchanged and other state as JSON text. With images, `input`
 * becomes one user message: the state, then each image after a label naming the reference that
 * replaces it in the state. Foundry rejects remote image URLs, so they fail with
 * `InvalidUserInputError` before sending. A refusal without a question name refuses every
 * decision it left unanswered.
 */
export const make = Effect.fnUntraced(function* (options: { readonly model: ModelId }) {
  const client = yield* FoundryClient;
  const rid = models[options.model].rid;
  return yield* DecisionModel.make({
    probabilityPrecision: 2,
    supportsImages: true,
    decide: Effect.fnUntraced(function* ({ state, decisions, images }) {
      const inlineImages: Array<{ readonly reference: string; readonly url: string }> = [];
      for (const { reference, image } of images ?? []) {
        const url = imageUrl(image);
        if (url === undefined) {
          return yield* AiError.make({
            module: 'OpenAiDecisionModel',
            method: 'decide',
            reason: new AiError.InvalidUserInputError({
              description: 'Foundry decisions accept base64 or data URL images, not remote URLs',
            }),
          });
        }
        inlineImages.push({ reference, url });
      }
      const text = stateText(state);
      const request: Wire.Request = {
        model: rid,
        input:
          images === undefined
            ? text
            : [
                {
                  role: 'user',
                  content: [
                    { type: 'input_text', text },
                    ...inlineImages.flatMap(({ reference, url }) => [
                      { type: 'input_text' as const, text: `Image ${reference}:` },
                      { type: 'input_image' as const, image_url: url },
                    ]),
                  ],
                },
              ],
        questions: Object.entries(decisions).map(([name, decision]) =>
          encodeQuestion(name, decision),
        ),
      };
      const response = yield* client.json({
        path: '/openai/v1/decisions',
        body: request,
        schema: Wire.Response,
      });
      const answers = decodeAnswers(decisions, response.answers);
      if (Result.isFailure(answers)) {
        return yield* AiError.make({
          module: 'OpenAiDecisionModel',
          method: 'decide',
          reason: new AiError.InvalidResponseError({ description: answers.failure }),
        });
      }
      return {
        answers: answers.success,
        usage: {
          inputTokens: response.usage?.input_tokens ?? undefined,
          outputTokens: response.usage?.output_tokens ?? undefined,
        },
        id: response.id ?? undefined,
        modelId: response.model ?? undefined,
        // Usage subcounts (cache reads and writes, reasoning, total) as Foundry reports them.
        metadata:
          response.usage == null ? undefined : { [providerName]: { usage: response.usage } },
      };
    }),
  });
});

export const layer = (options: {
  readonly model: ModelId;
}): Layer.Layer<DecisionModel.DecisionModel, never, FoundryClient> =>
  Layer.effect(DecisionModel.DecisionModel, make(options));

type Question = Exclude<Decision.Any, Decision.Locate>;

const stateText = (state: unknown): string =>
  typeof state === 'string' ? state : JSON.stringify(state);

const describe = (description: Decision.Description): string =>
  typeof description === 'string' ? description : JSON.stringify(description);

const imageUrl = (image: DecisionModel.ProviderImage['image']): string | undefined => {
  if (typeof image.data === 'string') {
    return `data:${image.mediaType};base64,${image.data}`;
  }
  return image.data.protocol === 'data:' ? image.data.href : undefined;
};

const encodeQuestion = (name: string, decision: Question): Wire.Question => {
  const instructions = describe(decision.instructions);
  if (decision._tag === 'Probability') {
    return {
      type: 'predicate',
      name,
      instructions:
        decision.criteria === undefined
          ? instructions
          : `${instructions}\n\nfalse: ${describe(decision.criteria.false)}\ntrue: ${describe(decision.criteria.true)}`,
    };
  }
  if (decision._tag === 'Classify') {
    return {
      type: 'choice',
      name,
      instructions,
      choices: Object.entries(decision.criteria).map(([value, description]) =>
        description === null ? { value } : { value, description: describe(description) },
      ),
    };
  }
  return {
    type: 'score',
    name,
    instructions,
    levels: decision.criteria.map(({ label, description }) => ({
      label,
      description: describe(description),
    })),
  };
};

/** Duplicate names or probability keys are ambiguous; the last one would silently win. */
const decodeAnswers = (
  decisions: Readonly<Record<string, Question>>,
  wire: ReadonlyArray<typeof Wire.Answer.Type>,
): Result.Result<Record<string, DecisionModel.ProviderAnswer>, string> => {
  const answers = new Map<string, DecisionModel.ProviderAnswer>();
  let refusedUnnamed = false;
  for (const answer of wire) {
    if (answer.name === null) {
      refusedUnnamed = true;
      continue;
    }
    if (answers.has(answer.name)) {
      return Result.fail(`Foundry returned more than one answer for decision "${answer.name}"`);
    }
    if (
      answer.type !== 'refusal' &&
      answer.type !== 'predicate' &&
      new Set(answer.probabilities.map(({ value }) => value)).size !== answer.probabilities.length
    ) {
      return Result.fail(`Foundry returned duplicate probabilities for decision "${answer.name}"`);
    }
    switch (answer.type) {
      case 'refusal':
        answers.set(answer.name, { _tag: 'Refusal' });
        break;
      case 'predicate':
        answers.set(answer.name, { _tag: 'Probability', probability: answer.probability });
        break;
      case 'choice':
        answers.set(answer.name, {
          _tag: 'Classify',
          label: answer.choice,
          probabilities: Object.fromEntries(
            answer.probabilities.map(({ value, probability }) => [value, probability]),
          ),
          confidence: answer.confidence ?? undefined,
        });
        break;
      case 'score': {
        const decision = decisions[answer.name];
        const levels = decision?._tag === 'Rate' ? decision.criteria : [];
        answers.set(answer.name, {
          _tag: 'Rate',
          rating: answer.score,
          probabilities: Object.fromEntries(
            answer.probabilities.flatMap(({ value, probability }) => {
              const level = levels[value];
              return level === undefined ? [] : [[level.label, probability]];
            }),
          ),
          confidence: answer.confidence ?? undefined,
        });
        break;
      }
    }
  }
  if (refusedUnnamed) {
    for (const name of Object.keys(decisions)) {
      if (!answers.has(name)) {
        answers.set(name, { _tag: 'Refusal' });
      }
    }
  }
  return Result.succeed(Object.fromEntries(answers));
};
