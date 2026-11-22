import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import { foundryHeaders, resolveFoundryConfig } from '../config.js';
import { wrapFoundryLanguageModel } from '../middleware.js';
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
    transformRequestBody: shapeChatRequest,
  });

  const chat = (modelId: Id) => {
    const model = wrapFoundryLanguageModel(base.chatModel(resolveOpenWeightRid(maker, modelId)), {
      modelId,
      providerId,
    });
    // The compatible SDK already decodes Kimi's separate reasoning_content field.
    return maker === 'moonshot'
      ? model
      : wrapLanguageModel({
          model,
          middleware: extractReasoningMiddleware({ tagName: 'reasoning' }),
        });
  };

  return Object.assign(chat, {
    ...languageOnly,
    specificationVersion: base.specificationVersion,
    languageModel: chat,
    chat,
  });
}

function shapeChatRequest(body: Record<string, unknown>): Record<string, unknown> {
  const { parallel_tool_calls: _parallel, messages, ...rest } = body;
  return {
    ...rest,
    messages: Array.isArray(messages)
      ? messages.map((message: unknown) => {
          if (!isRecord(message) || message.role !== 'assistant') {
            return message;
          }
          // Foundry rejects replayed reasoning, including in Kimi tool loops.
          const { reasoning_content: _reasoning, ...assistant } = message;
          return assistant;
        })
      : messages,
  };
}
