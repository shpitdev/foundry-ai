import { createAnthropic } from '@ai-sdk/anthropic';
import { NoSuchModelError } from 'ai';
import { resolveFoundryConfig } from '../config.js';
import {
  type FoundryCallOptions,
  type FoundryLanguageModel,
  wrapFoundryLanguageModel,
} from '../middleware.js';
import type { AnthropicModelId } from '../models/anthropic-models.js';
import { resolveModelTarget } from '../models/catalog.js';
import type { FoundryConfig } from '../types.js';

type FoundryFunctionTool = NonNullable<FoundryCallOptions['tools']>[number];

export interface FoundryAnthropicProvider {
  (modelId: AnthropicModelId): FoundryLanguageModel;
  specificationVersion: FoundryLanguageModel['specificationVersion'];
  languageModel(modelId: AnthropicModelId): FoundryLanguageModel;
  chat(modelId: AnthropicModelId): FoundryLanguageModel;
  messages(modelId: AnthropicModelId): FoundryLanguageModel;
  embeddingModel(modelId: string): never;
  imageModel(modelId: string): never;
}

export function createFoundryAnthropic(config: FoundryConfig): FoundryAnthropicProvider {
  const providerId = 'foundry-anthropic';
  const resolvedConfig = resolveFoundryConfig(config, 'createFoundryAnthropic');
  const headers =
    resolvedConfig.attributionRid || resolvedConfig.traceParent || resolvedConfig.traceState
      ? {
          ...(resolvedConfig.attributionRid ? { attribution: resolvedConfig.attributionRid } : {}),
          ...(resolvedConfig.traceParent ? { traceParent: resolvedConfig.traceParent } : {}),
          ...(resolvedConfig.traceState ? { traceState: resolvedConfig.traceState } : {}),
        }
      : undefined;
  const baseProvider = createAnthropic({
    authToken: resolvedConfig.token,
    baseURL: `${resolvedConfig.foundryUrl}/api/v2/llm/proxy/anthropic/v1`,
    headers,
    name: providerId,
  });

  const createLanguageModel = (modelId: AnthropicModelId): FoundryLanguageModel => {
    const resolvedModel = resolveModelTarget(modelId);

    return wrapFoundryLanguageModel(baseProvider(resolvedModel.rid), {
      modelId,
      providerId,
      transformParams: applyAnthropicCompat,
    });
  };

  function provider(modelId: AnthropicModelId): FoundryLanguageModel {
    return createLanguageModel(modelId);
  }

  const callableProvider = provider as FoundryAnthropicProvider;

  callableProvider.specificationVersion = baseProvider.specificationVersion;
  callableProvider.languageModel = createLanguageModel;
  callableProvider.chat = createLanguageModel;
  callableProvider.messages = createLanguageModel;
  callableProvider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  callableProvider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return callableProvider;
}

function applyAnthropicCompat(params: FoundryCallOptions): FoundryCallOptions {
  const anthropicOptions = asRecord(params.providerOptions?.anthropic);
  const foundryAnthropicOptions = asRecord(params.providerOptions?.['foundry-anthropic']);

  if (anthropicOptions.toolStreaming === true || foundryAnthropicOptions.toolStreaming === true) {
    throw new Error(
      'Foundry Anthropic does not support toolStreaming=true in Anthropic provider options. Remove the option or set it to false.',
    );
  }

  return {
    ...params,
    providerOptions: {
      ...(params.providerOptions ?? {}),
      anthropic: {
        ...anthropicOptions,
        structuredOutputMode: 'jsonTool',
        toolStreaming: false,
      },
      ...(params.providerOptions?.['foundry-anthropic'] != null
        ? {
            'foundry-anthropic': {
              ...foundryAnthropicOptions,
              structuredOutputMode: 'jsonTool',
              toolStreaming: false,
            },
          }
        : {}),
    },
    ...(params.tools != null
      ? { tools: params.tools.map(rejectAnthropicEagerInputStreaming) }
      : {}),
  };
}

function rejectAnthropicEagerInputStreaming(tool: FoundryFunctionTool): FoundryFunctionTool {
  if (tool.type !== 'function') {
    return tool;
  }

  const anthropicOptions = asRecord(tool.providerOptions?.anthropic);

  if (anthropicOptions.eagerInputStreaming === true) {
    throw new Error(
      'Foundry Anthropic does not support tool providerOptions.anthropic.eagerInputStreaming=true. Remove the option or set it to false.',
    );
  }

  return tool;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
