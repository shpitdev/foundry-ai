// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/** OpenAI embedding models through Foundry's `/openai/v1/embeddings` route. */
import * as AiError from 'effect/ai/AiError';
import * as EmbeddingModel from 'effect/ai/EmbeddingModel';
import * as AiModel from 'effect/ai/Model';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { FoundryClient } from './FoundryClient.ts';
import { embeddingModels } from './internal/models/openai.ts';
import * as Wire from './internal/openai-embeddings/schema.ts';

export const providerName = 'foundry-openai';

/** A catalog embedding model, whose RID is its name, or another Foundry model RID. */
export type ModelId = keyof typeof embeddingModels | (string & Record<never, never>);

const known: Readonly<Record<string, { readonly dimensions: number } | undefined>> =
  embeddingModels;

export interface Options {
  readonly model: ModelId;
  /**
   * Vector length. Only `text-embedding-3-*` can shorten its vectors, and Foundry rejects
   * `dimensions` for `text-embedding-ada-002` even at its native size, so a catalog model's
   * native size is not sent.
   */
  readonly dimensions?: number | undefined;
}

type Model = AiModel.Model<
  typeof providerName,
  EmbeddingModel.EmbeddingModel | EmbeddingModel.Dimensions,
  FoundryClient
>;

/**
 * The model and its vector length as `EmbeddingModel.Dimensions`: a catalog model's native size
 * unless `dimensions` shortens it. Any other model RID must give `dimensions`.
 */
export const model: {
  (
    modelId: keyof typeof embeddingModels,
    options?: { readonly dimensions?: number | undefined },
  ): Model;
  (modelId: ModelId, options: { readonly dimensions: number }): Model;
} = (modelId: ModelId, options?: { readonly dimensions?: number | undefined }): Model => {
  const dimensions = options?.dimensions ?? known[modelId]?.dimensions;
  return AiModel.make(
    providerName,
    modelId,
    Layer.merge(
      layer({ model: modelId, dimensions }),
      // Unreachable from typed callers: the overloads require `dimensions` for unknown models.
      dimensions === undefined
        ? Layer.effect(
            EmbeddingModel.Dimensions,
            Effect.die(`OpenAiEmbeddingModel.model("${modelId}") needs dimensions`),
          )
        : Layer.succeed(EmbeddingModel.Dimensions, dimensions),
    ),
  );
};

/** Concurrent `embed` calls share one request. */
export const make = Effect.fnUntraced(function* (options: Options) {
  const client = yield* FoundryClient;
  const native = known[options.model]?.dimensions;
  const dimensions = options.dimensions === native ? undefined : options.dimensions;
  // Every vector must match `Dimensions`; an unknown model without `dimensions` is not checked.
  const size = options.dimensions ?? native;
  return yield* EmbeddingModel.make({
    embedMany: Effect.fnUntraced(function* ({ inputs }) {
      const request: Wire.Request = {
        model: options.model,
        input: inputs,
        encoding_format: 'float',
        ...(dimensions === undefined ? {} : { dimensions }),
      };
      const response = yield* client.json({
        path: '/openai/v1/embeddings',
        body: request,
        schema: Wire.Response,
      });
      if (response.data.length !== inputs.length) {
        return yield* invalidResponse(
          `Foundry returned ${response.data.length} embeddings for ${inputs.length} inputs`,
        );
      }
      // With the count checked, in-range and unique indexes cover every input.
      const seen = new Set<number>();
      for (const { index, embedding } of response.data) {
        if (index < 0 || index >= inputs.length || seen.has(index)) {
          return yield* invalidResponse(
            `Foundry returned an out-of-range or duplicate embedding index ${index}`,
          );
        }
        if (size !== undefined && embedding.length !== size) {
          return yield* invalidResponse(
            `Foundry returned ${embedding.length} dimensions at index ${index}, expected ${size}`,
          );
        }
        seen.add(index);
      }
      return {
        results: response.data
          .toSorted((a, b) => a.index - b.index)
          .map(({ embedding }) => [...embedding]),
        usage: { inputTokens: response.usage?.prompt_tokens ?? undefined },
      };
    }),
  });
});

export const layer = (
  options: Options,
): Layer.Layer<EmbeddingModel.EmbeddingModel, never, FoundryClient> =>
  Layer.effect(EmbeddingModel.EmbeddingModel, make(options));

const invalidResponse = (description: string) =>
  AiError.make({
    module: 'OpenAiEmbeddingModel',
    method: 'embedMany',
    reason: new AiError.InvalidResponseError({ description }),
  });
