import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import { foundryHeaders, resolveFoundryConfig } from '../config.js';
import { wrapFoundryLanguageModel } from '../middleware.js';
import { ZAI_MODELS } from '../models/zai-models.js';
import { isRecord } from '../records.js';
import type { FoundryConfig } from '../types.js';
import {
  languageOnly,
  type OpenWeightLanguageProvider,
  type OpenWeightMaker,
  resolveOpenWeightRid,
} from './open-weight-model.js';

export interface OpenWeightChatProvider<Id extends string> extends OpenWeightLanguageProvider<Id> {
  chat: OpenWeightLanguageProvider<Id>['languageModel'];
}

export function createOpenWeightChat<Id extends string>(
  config: FoundryConfig,
  maker: Exclude<OpenWeightMaker, 'gemma'>,
  callerName: string,
): OpenWeightChatProvider<Id> {
  const resolved = resolveFoundryConfig(config, callerName);
  const providerId = `foundry-${maker}`;
  const base = createOpenAICompatible({
    name: maker,
    baseURL: `${resolved.foundryUrl}/api/v2/llm/proxy/openai/v1`,
    apiKey: resolved.token,
    headers: foundryHeaders(resolved),
    includeUsage: true,
    supportsStructuredOutputs: true,
    transformRequestBody: (body) => shapeChatRequest(body, maker),
  });

  const chat = (modelId: Id) => {
    const rid = resolveOpenWeightRid(maker, modelId);
    const model = wrapFoundryLanguageModel(base.chatModel(rid), { modelId, providerId });
    // Kimi's reasoning_content is already decoded by the compatible SDK. Of the GLMs,
    // only GLM-5 exposes reasoning spans; GLM-5.3 reports reasoning token counts.
    const tagged = maker === 'zai' ? rid === ZAI_MODELS['glm-5'].rid : maker !== 'moonshot';
    return tagged
      ? wrapLanguageModel({
          model,
          middleware: extractReasoningMiddleware({ tagName: 'reasoning' }),
        })
      : model;
  };

  return Object.assign(chat, {
    ...languageOnly,
    specificationVersion: base.specificationVersion,
    languageModel: chat,
    chat,
  });
}

function shapeChatRequest(
  body: Record<string, unknown>,
  maker: Exclude<OpenWeightMaker, 'gemma'>,
): Record<string, unknown> {
  const { parallel_tool_calls: _parallel, messages, ...rest } = body;
  if (maker === 'zai' && !supportsZaiEffort(rest.model, rest.reasoning_effort)) {
    delete rest.reasoning_effort;
  }
  return {
    ...rest,
    messages: Array.isArray(messages)
      ? messages.map((message: unknown) => {
          if (!isRecord(message) || message.role !== 'assistant') {
            return message;
          }
          // Foundry rejects replayed reasoning, including in tool loops.
          const {
            reasoning_content: _reasoning,
            reasoning: _alternateReasoning,
            ...assistant
          } = message;
          return assistant;
        })
      : messages,
  };
}

function supportsZaiEffort(model: unknown, effort: unknown): boolean {
  switch (effort) {
    case 'low':
    case 'medium':
    case 'high':
      return true;
    case 'none':
      return model === ZAI_MODELS['glm-5'].rid;
    case 'xhigh':
    case 'max':
      return model === ZAI_MODELS['glm-5.3'].rid;
    default:
      return false;
  }
}
