import { createAnthropic } from '@ai-sdk/anthropic';
import { NoSuchModelError } from 'ai';
import {
  type AnthropicModelId,
  requiresAnthropicNativeStructuredOutput,
} from '../../../foundry-catalog/src/anthropic-models.js';
import { foundryHeaders, resolveFoundryConfig } from '../config.js';
import {
  type FoundryCallOptions,
  type FoundryLanguageModel,
  wrapFoundryLanguageModel,
} from '../middleware.js';
import { resolveModelTarget } from '../models/catalog.js';
import { asRecord } from '../records.js';
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
  const baseProvider = createAnthropic({
    authToken: resolvedConfig.token,
    baseURL: `${resolvedConfig.foundryUrl}/api/v2/llm/proxy/anthropic/v1`,
    headers: foundryHeaders(resolvedConfig),
    name: providerId,
  });

  const createLanguageModel = (modelId: AnthropicModelId): FoundryLanguageModel => {
    const resolvedModel = resolveModelTarget(modelId);
    const usesNativeStructuredOutput =
      requiresAnthropicNativeStructuredOutput(modelId) ||
      requiresAnthropicNativeStructuredOutput(resolvedModel.rid);

    return wrapFoundryLanguageModel(baseProvider(resolvedModel.rid), {
      modelId,
      providerId,
      transformParams: (params) => applyAnthropicCompat(params, usesNativeStructuredOutput),
    });
  };

  return Object.assign((modelId: AnthropicModelId) => createLanguageModel(modelId), {
    specificationVersion: baseProvider.specificationVersion,
    languageModel: createLanguageModel,
    chat: createLanguageModel,
    messages: createLanguageModel,
    embeddingModel: (modelId: string): never => {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
    imageModel: (modelId: string): never => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
  });
}

function applyAnthropicCompat(
  params: FoundryCallOptions,
  usesNativeStructuredOutput: boolean,
): FoundryCallOptions {
  const anthropicOptions = asRecord(params.providerOptions?.anthropic);
  const foundryAnthropicOptions = asRecord(params.providerOptions?.['foundry-anthropic']);

  if (anthropicOptions.toolStreaming === true || foundryAnthropicOptions.toolStreaming === true) {
    throw new Error(
      'Foundry Anthropic does not support toolStreaming=true in Anthropic provider options. Remove the option or set it to false.',
    );
  }

  // Models that reject forced tool use must use the provider's native structured output.
  // Request it explicitly rather than leaving the default 'auto': the SDK resolves 'auto'
  // from the model ID, and these models are addressed by Foundry RID, so 'auto' takes the
  // unknown-model path and still sends the forced JSON tool on supported peer versions.
  const structuredOutputMode = {
    structuredOutputMode: usesNativeStructuredOutput
      ? ('outputFormat' as const)
      : ('jsonTool' as const),
  };

  return {
    ...params,
    providerOptions: {
      ...params.providerOptions,
      anthropic: {
        ...anthropicOptions,
        ...structuredOutputMode,
        toolStreaming: false,
      },
      ...(params.providerOptions?.['foundry-anthropic'] == null
        ? {}
        : {
            'foundry-anthropic': {
              ...foundryAnthropicOptions,
              ...structuredOutputMode,
              toolStreaming: false,
            },
          }),
    },
    ...(params.tools == null
      ? {}
      : { tools: params.tools.map(rejectAnthropicEagerInputStreaming) }),
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
