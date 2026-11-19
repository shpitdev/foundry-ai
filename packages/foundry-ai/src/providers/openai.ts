import { createOpenAI } from '@ai-sdk/openai';
import { NoSuchModelError } from 'ai';
import { resolveFoundryConfig } from '../config.js';
import {
  type FoundryCallOptions,
  type FoundryLanguageModel,
  wrapFoundryLanguageModel,
} from '../middleware.js';
import { resolveModelTarget } from '../models/catalog.js';
import {
  isKnownOpenAIReasoningTarget,
  type OpenAIDecisionModelId,
  type OpenAIEmbeddingModelId,
  type OpenAIModelId,
} from '../models/openai-models.js';
import type { FoundryConfig } from '../types.js';

type BaseOpenAIProvider = ReturnType<typeof createOpenAI>;
type FoundryEmbeddingModel = ReturnType<BaseOpenAIProvider['embeddingModel']>;
type FoundryFunctionTool = NonNullable<FoundryCallOptions['tools']>[number];
/** AI SDK decision model; `never` with SDK versions that predate the Decisions API. */
export type FoundryDecisionModel = BaseOpenAIProvider extends {
  decisionModel(modelId: string): infer Model;
}
  ? Model
  : never;

export interface FoundryOpenAIProvider {
  (modelId: OpenAIModelId): FoundryLanguageModel;
  specificationVersion: FoundryLanguageModel['specificationVersion'];
  languageModel(modelId: OpenAIModelId): FoundryLanguageModel;
  responses(modelId: OpenAIModelId): FoundryLanguageModel;
  embeddingModel(modelId: OpenAIEmbeddingModelId): FoundryEmbeddingModel;
  embedding(modelId: OpenAIEmbeddingModelId): FoundryEmbeddingModel;
  /** GPT-6 Luna through Foundry's `/decisions` route. Needs an `@ai-sdk/openai` release with `decisionModel`. */
  decisionModel(modelId: OpenAIDecisionModelId): FoundryDecisionModel;
  imageModel(modelId: string): never;
}

export function createFoundryOpenAI(config: FoundryConfig): FoundryOpenAIProvider {
  const providerId = 'foundry-openai';
  const resolvedConfig = resolveFoundryConfig(config, 'createFoundryOpenAI');
  const headers =
    resolvedConfig.attributionRid || resolvedConfig.traceParent || resolvedConfig.traceState
      ? {
          ...(resolvedConfig.attributionRid ? { attribution: resolvedConfig.attributionRid } : {}),
          ...(resolvedConfig.traceParent ? { traceParent: resolvedConfig.traceParent } : {}),
          ...(resolvedConfig.traceState ? { traceState: resolvedConfig.traceState } : {}),
        }
      : undefined;
  const baseProvider = createOpenAI({
    apiKey: resolvedConfig.token,
    baseURL: `${resolvedConfig.foundryUrl}/api/v2/llm/proxy/openai/v1`,
    headers,
    name: providerId,
  });

  const createLanguageModel = (modelId: OpenAIModelId): FoundryLanguageModel => {
    const resolvedModel = resolveModelTarget(modelId);
    if (resolvedModel.metadata?.inputTypes.includes('OPEN_AI_REALTIME')) {
      throw new NoSuchModelError({
        modelId,
        modelType: 'languageModel',
        message:
          'Use createFoundryRealtime from @shpitdev/foundry-ai/realtime for realtime models (AI SDK 7).',
      });
    }
    const shouldForceReasoning =
      isKnownOpenAIReasoningTarget(modelId) || isKnownOpenAIReasoningTarget(resolvedModel.rid);

    return wrapFoundryLanguageModel(baseProvider.responses(resolvedModel.rid), {
      modelId,
      providerId,
      transformParams: (params) => applyOpenAICompat(params, shouldForceReasoning),
    });
  };

  const createEmbeddingModel = (modelId: OpenAIEmbeddingModelId): FoundryEmbeddingModel => {
    const resolvedModel = resolveModelTarget(modelId);
    return baseProvider.embeddingModel(resolvedModel.rid);
  };

  const createDecisionModel = (modelId: OpenAIDecisionModelId): FoundryDecisionModel => {
    const decisionProvider = baseProvider as Partial<
      Record<'decisionModel', (modelId: string) => FoundryDecisionModel>
    >;
    if (typeof decisionProvider.decisionModel !== 'function') {
      throw new Error(
        'Foundry OpenAI decision models need an @ai-sdk/openai release with decisionModel.',
      );
    }
    return decisionProvider.decisionModel(resolveModelTarget(modelId).rid);
  };

  function provider(modelId: OpenAIModelId): FoundryLanguageModel {
    return createLanguageModel(modelId);
  }

  const callableProvider = provider as FoundryOpenAIProvider;

  callableProvider.specificationVersion = baseProvider.specificationVersion;
  callableProvider.languageModel = createLanguageModel;
  callableProvider.responses = createLanguageModel;
  callableProvider.embeddingModel = createEmbeddingModel;
  callableProvider.embedding = createEmbeddingModel;
  callableProvider.decisionModel = createDecisionModel;
  callableProvider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return callableProvider;
}

function applyOpenAICompat(
  params: FoundryCallOptions,
  shouldForceReasoning: boolean,
): FoundryCallOptions {
  const openaiOptions = asRecord(params.providerOptions?.openai);

  if (openaiOptions.store === true) {
    throw new Error(
      'Foundry OpenAI does not support providerOptions.openai.store=true. Remove the store option or set it to false.',
    );
  }

  return {
    ...params,
    providerOptions: {
      ...(params.providerOptions ?? {}),
      openai: {
        ...openaiOptions,
        ...(openaiOptions.forceReasoning == null && shouldForceReasoning
          ? { forceReasoning: true }
          : {}),
        store: false,
      },
    },
    ...(params.tools != null ? { tools: params.tools.map(applyOpenAIFunctionToolCompat) } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function applyOpenAIFunctionToolCompat(tool: FoundryFunctionTool): FoundryFunctionTool {
  if (tool.type !== 'function' || tool.strict != null) {
    return tool;
  }

  return {
    ...tool,
    strict: true,
  };
}
