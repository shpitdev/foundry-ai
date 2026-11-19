import { createProviderRegistry } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestLanguageModel } from './helpers/test-language-model.js';

const openaiLanguageModelMock = vi.hoisted(() => vi.fn<(modelId: string) => unknown>());
const anthropicLanguageModelMock = vi.hoisted(() => vi.fn<(modelId: string) => unknown>());
const createFoundryOpenAIMock = vi.hoisted(() =>
  vi.fn<(config: unknown) => unknown>(() => {
    const provider = ((modelId: string) => openaiLanguageModelMock(modelId)) as {
      (modelId: string): ReturnType<typeof openaiLanguageModelMock>;
      specificationVersion: 'v3';
      languageModel(modelId: string): ReturnType<typeof openaiLanguageModelMock>;
      responses(modelId: string): ReturnType<typeof openaiLanguageModelMock>;
    };

    provider.specificationVersion = 'v3';
    provider.languageModel = openaiLanguageModelMock;
    provider.responses = openaiLanguageModelMock;

    return provider;
  }),
);
const createFoundryAnthropicMock = vi.hoisted(() =>
  vi.fn<(config: unknown) => unknown>(() => {
    const provider = ((modelId: string) => anthropicLanguageModelMock(modelId)) as {
      (modelId: string): ReturnType<typeof anthropicLanguageModelMock>;
      specificationVersion: 'v3';
      languageModel(modelId: string): ReturnType<typeof anthropicLanguageModelMock>;
      chat(modelId: string): ReturnType<typeof anthropicLanguageModelMock>;
      messages(modelId: string): ReturnType<typeof anthropicLanguageModelMock>;
    };

    provider.specificationVersion = 'v3';
    provider.languageModel = anthropicLanguageModelMock;
    provider.chat = anthropicLanguageModelMock;
    provider.messages = anthropicLanguageModelMock;

    return provider;
  }),
);

vi.mock('../providers/openai.js', () => ({
  createFoundryOpenAI: createFoundryOpenAIMock,
}));

vi.mock('../providers/anthropic.js', () => ({
  createFoundryAnthropic: createFoundryAnthropicMock,
}));

import { createFoundryAnthropic } from '../providers/anthropic.js';
import { createFoundryOpenAI } from '../providers/openai.js';

describe('AI SDK registry composition example', () => {
  beforeEach(() => {
    openaiLanguageModelMock.mockReset();
    anthropicLanguageModelMock.mockReset();

    openaiLanguageModelMock.mockImplementation((modelId: string) => {
      return createTestLanguageModel({
        provider: 'foundry-openai',
        modelId,
      }).model;
    });

    anthropicLanguageModelMock.mockImplementation((modelId: string) => {
      return createTestLanguageModel({
        provider: 'foundry-anthropic',
        modelId,
      }).model;
    });
  });

  it('routes openai:model identifiers to the OpenAI adapter', () => {
    const registry = createProviderRegistry({
      anthropic: createFoundryAnthropic({
        foundryUrl: 'https://example.palantirfoundry.com',
        token: 'token',
      }),
      openai: createFoundryOpenAI({
        foundryUrl: 'https://example.palantirfoundry.com',
        token: 'token',
      }),
    });

    const model = registry.languageModel('openai:gpt-5-mini');

    expect(openaiLanguageModelMock).toHaveBeenCalledWith('gpt-5-mini');
    expect(model.provider).toBe('foundry-openai');
  });

  it('routes anthropic:model identifiers to the Anthropic adapter', () => {
    const registry = createProviderRegistry({
      anthropic: createFoundryAnthropic({
        foundryUrl: 'https://example.palantirfoundry.com',
        token: 'token',
      }),
      openai: createFoundryOpenAI({
        foundryUrl: 'https://example.palantirfoundry.com',
        token: 'token',
      }),
    });

    const model = registry.languageModel('anthropic:claude-sonnet-4.6');

    expect(anthropicLanguageModelMock).toHaveBeenCalledWith('claude-sonnet-4.6');
    expect(model.provider).toBe('foundry-anthropic');
  });
});
