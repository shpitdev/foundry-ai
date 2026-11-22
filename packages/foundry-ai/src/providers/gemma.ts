import { createOpenAI } from '@ai-sdk/openai';
import { foundryHeaders, resolveFoundryConfig } from '../config.js';
import { wrapFoundryLanguageModel } from '../middleware.js';
import type { GemmaModelId } from '../models/gemma-models.js';
import type { FoundryConfig } from '../types.js';
import {
  languageOnly,
  type OpenWeightLanguageProvider,
  resolveOpenWeightRid,
} from './open-weight-model.js';

export interface FoundryGemmaProvider extends OpenWeightLanguageProvider<GemmaModelId> {
  responses: OpenWeightLanguageProvider<GemmaModelId>['languageModel'];
}

export function createFoundryGemma(config: FoundryConfig): FoundryGemmaProvider {
  const resolved = resolveFoundryConfig(config, 'createFoundryGemma');
  const providerId = 'foundry-gemma';
  const base = createOpenAI({
    name: providerId,
    baseURL: `${resolved.foundryUrl}/api/v2/llm/proxy/openai/v1`,
    apiKey: resolved.token,
    headers: foundryHeaders(resolved),
  });

  const responses = (modelId: GemmaModelId) =>
    wrapFoundryLanguageModel(base.responses(resolveOpenWeightRid('gemma', modelId)), {
      modelId,
      providerId,
      // Gemma supports neither OpenAI-specific request options nor generic reasoning controls.
      transformParams: ({ reasoning: _reasoning, providerOptions: _options, ...params }) => ({
        ...params,
        providerOptions: { openai: { store: false } },
      }),
    });

  return Object.assign(responses, {
    ...languageOnly,
    specificationVersion: base.specificationVersion,
    languageModel: responses,
    responses,
  });
}
