import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestLanguageModel } from './helpers/test-language-model.js';

const openaiResponsesMock = vi.hoisted(() => vi.fn());
const openaiEmbeddingMock = vi.hoisted(() => vi.fn());
const createOpenAIMock = vi.hoisted(() =>
  vi.fn(() => {
    const provider = ((modelId: string) => openaiResponsesMock(modelId)) as {
      (modelId: string): ReturnType<typeof openaiResponsesMock>;
      responses(modelId: string): ReturnType<typeof openaiResponsesMock>;
      embeddingModel(modelId: string): ReturnType<typeof openaiEmbeddingMock>;
      embedding(modelId: string): ReturnType<typeof openaiEmbeddingMock>;
      specificationVersion: 'v3';
    };

    provider.responses = openaiResponsesMock;
    provider.embeddingModel = openaiEmbeddingMock;
    provider.embedding = openaiEmbeddingMock;
    provider.specificationVersion = 'v3';

    return provider;
  }),
);

const anthropicLanguageModelMock = vi.hoisted(() => vi.fn());
const createAnthropicMock = vi.hoisted(() =>
  vi.fn(() => {
    const provider = ((modelId: string) => anthropicLanguageModelMock(modelId)) as {
      (modelId: string): ReturnType<typeof anthropicLanguageModelMock>;
      specificationVersion: 'v3';
    };

    provider.specificationVersion = 'v3';
    return provider;
  }),
);

const googleLanguageModelMock = vi.hoisted(() => vi.fn());
const createGoogleMock = vi.hoisted(() =>
  vi.fn(() => {
    const provider = ((modelId: string) => googleLanguageModelMock(modelId)) as {
      (modelId: string): ReturnType<typeof googleLanguageModelMock>;
      chat(modelId: string): ReturnType<typeof googleLanguageModelMock>;
      generativeAI(modelId: string): ReturnType<typeof googleLanguageModelMock>;
      specificationVersion: 'v3';
    };

    provider.chat = googleLanguageModelMock;
    provider.generativeAI = googleLanguageModelMock;
    provider.specificationVersion = 'v3';

    return provider;
  }),
);

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: createAnthropicMock,
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGoogleMock,
}));

import { createFoundryAnthropic } from '../providers/anthropic.js';
import { createFoundryGoogle } from '../providers/google.js';
import { createFoundryOpenAI } from '../providers/openai.js';

describe('provider adapters', () => {
  const config = {
    foundryUrl: 'https://example.palantirfoundry.com/',
    token: 'token-123',
    attributionRid: 'ri.attribution.main',
  };

  let openAIState: ReturnType<typeof createTestLanguageModel>['state'] | undefined;
  let anthropicState: ReturnType<typeof createTestLanguageModel>['state'] | undefined;

  beforeEach(() => {
    openaiResponsesMock.mockReset();
    openaiEmbeddingMock.mockReset();
    anthropicLanguageModelMock.mockReset();
    googleLanguageModelMock.mockReset();

    openaiResponsesMock.mockImplementation((modelId: string) => {
      const testModel = createTestLanguageModel({
        provider: 'foundry-openai.responses',
        modelId,
      });

      openAIState = testModel.state;
      return testModel.model;
    });

    anthropicLanguageModelMock.mockImplementation((modelId: string) => {
      const testModel = createTestLanguageModel({
        provider: 'foundry-anthropic.messages',
        modelId,
      });

      anthropicState = testModel.state;
      return testModel.model;
    });

    googleLanguageModelMock.mockImplementation((modelId: string) => {
      const testModel = createTestLanguageModel({
        provider: 'foundry-google.chat',
        modelId,
      });

      return testModel.model;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates an OpenAI provider with normalized config and observability headers', () => {
    createFoundryOpenAI({
      foundryUrl: ' https://example.palantirfoundry.com/// ',
      token: ' token-123 ',
      attributionRid: ' ri.attribution.main ',
      traceParent: ' 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01 ',
      traceState: ' vendor=value ',
    });

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'token-123',
      baseURL: 'https://example.palantirfoundry.com/api/v2/llm/proxy/openai/v1',
      headers: {
        attribution: 'ri.attribution.main',
        traceParent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        traceState: 'vendor=value',
      },
      name: 'foundry-openai',
    });
  });

  it('leaves OpenAI headers undefined when optional config is absent', () => {
    createFoundryOpenAI({
      foundryUrl: 'https://example.palantirfoundry.com',
      token: 'token-123',
    });

    expect(createOpenAIMock).toHaveBeenCalledWith(expect.objectContaining({ headers: undefined }));
  });

  it('sets only the OpenAI attribution header when trace context is absent', () => {
    createFoundryOpenAI(config);

    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { attribution: 'ri.attribution.main' } }),
    );
  });

  it('maps OpenAI aliases to RIDs and preserves raw RID passthrough', () => {
    const openai = createFoundryOpenAI(config);
    const rawRid = 'ri.language-model-service..language-model.gpt-5-2';

    const aliasModel = openai('gpt-5-mini');
    const rawModel = openai(rawRid);

    expect(openaiResponsesMock).toHaveBeenNthCalledWith(
      1,
      'ri.language-model-service..language-model.gpt-5-mini',
    );
    expect(openaiResponsesMock).toHaveBeenNthCalledWith(2, rawRid);
    expect(aliasModel.provider).toBe('foundry-openai');
    expect(aliasModel.modelId).toBe('gpt-5-mini');
    expect(rawModel.modelId).toBe(rawRid);
    expect(openai.specificationVersion).toBe('v3');
    expect(openai.languageModel).toBeTypeOf('function');
    expect(openai.responses).toBeTypeOf('function');
  });

  it('resolves OpenAI embedding aliases and passes through unknown model ids', () => {
    const openai = createFoundryOpenAI(config);
    const customModelId = 'custom-embedding-model';
    const aliasModel = { modelId: 'small' };
    const rawModel = { modelId: 'raw' };
    openaiEmbeddingMock.mockReturnValueOnce(aliasModel).mockReturnValueOnce(rawModel);

    expect(openai.embeddingModel('text-embedding-3-small')).toBe(aliasModel);
    expect(openai.embedding(customModelId)).toBe(rawModel);
    expect(openaiEmbeddingMock).toHaveBeenNthCalledWith(1, 'text-embedding-3-small');
    expect(openaiEmbeddingMock).toHaveBeenNthCalledWith(2, customModelId);
  });

  it('adds only the OpenAI compatibility options required by the Foundry proxy', async () => {
    const openai = createFoundryOpenAI(config);

    await openai('gpt-5-mini').doGenerate({
      prompt: [],
      providerOptions: {
        custom: { traceId: 'trace-123' },
        openai: {
          reasoningEffort: 'high',
        },
      },
      tools: [
        {
          type: 'function',
          name: 'searchRegulations',
          description: 'Search the regulation corpus.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      ],
    });

    expect(openAIState?.lastGenerateParams).toEqual({
      prompt: [],
      providerOptions: {
        custom: { traceId: 'trace-123' },
        openai: {
          forceReasoning: true,
          reasoningEffort: 'high',
          store: false,
        },
      },
      tools: [
        {
          type: 'function',
          name: 'searchRegulations',
          description: 'Search the regulation corpus.',
          strict: true,
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      ],
    });
  });

  it('preserves explicit OpenAI tool strict values', async () => {
    const openai = createFoundryOpenAI(config);

    await openai('gpt-5-mini').doGenerate({
      prompt: [],
      tools: [
        {
          type: 'function',
          name: 'keepStrictFalse',
          description: 'Keep strict false when the caller sets it.',
          inputSchema: { type: 'object', properties: {} },
          strict: false,
        },
        {
          type: 'function',
          name: 'keepStrictTrue',
          description: 'Keep strict true when the caller sets it.',
          inputSchema: { type: 'object', properties: {} },
          strict: true,
        },
      ],
    });

    expect(openAIState?.lastGenerateParams?.tools).toEqual([
      {
        type: 'function',
        name: 'keepStrictFalse',
        description: 'Keep strict false when the caller sets it.',
        inputSchema: { type: 'object', properties: {} },
        strict: false,
      },
      {
        type: 'function',
        name: 'keepStrictTrue',
        description: 'Keep strict true when the caller sets it.',
        inputSchema: { type: 'object', properties: {} },
        strict: true,
      },
    ]);
  });

  it('preserves an explicit OpenAI forceReasoning override', async () => {
    const openai = createFoundryOpenAI(config);

    await openai('gpt-5-mini').doGenerate({
      prompt: [],
      providerOptions: {
        openai: {
          forceReasoning: false,
        },
      },
    });

    expect(openAIState?.lastGenerateParams?.providerOptions).toEqual({
      openai: {
        forceReasoning: false,
        store: false,
      },
    });
  });

  it('fails early when a caller opts into OpenAI stored responses', async () => {
    const openai = createFoundryOpenAI(config);

    await expect(
      openai('gpt-5-mini').doGenerate({
        prompt: [],
        providerOptions: {
          openai: {
            store: true,
          },
        },
      }),
    ).rejects.toThrow(/providerOptions\.openai\.store=true/);
    expect(openAIState?.lastGenerateParams).toBeUndefined();
  });

  it('validates OpenAI config inputs at runtime', () => {
    expect(() =>
      createFoundryOpenAI({
        foundryUrl: '   ',
        token: 'token-123',
      }),
    ).toThrow(/config\.foundryUrl/);
    expect(() =>
      createFoundryOpenAI({
        foundryUrl: 'https://example.palantirfoundry.com',
        token: '   ',
      }),
    ).toThrow(/config\.token/);
  });

  it('creates an Anthropic provider using authToken instead of apiKey', () => {
    createFoundryAnthropic({
      ...config,
      traceParent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      traceState: 'vendor=value',
    });

    expect(createAnthropicMock).toHaveBeenCalledWith({
      authToken: 'token-123',
      baseURL: 'https://example.palantirfoundry.com/api/v2/llm/proxy/anthropic/v1',
      headers: {
        attribution: 'ri.attribution.main',
        traceParent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        traceState: 'vendor=value',
      },
      name: 'foundry-anthropic',
    });
  });

  it('leaves Anthropic headers undefined when optional config is absent', () => {
    createFoundryAnthropic({
      foundryUrl: 'https://example.palantirfoundry.com',
      token: 'token-123',
    });

    expect(createAnthropicMock).toHaveBeenCalledWith(
      expect.objectContaining({ headers: undefined }),
    );
  });

  it('sets only the Anthropic attribution header when trace context is absent', () => {
    createFoundryAnthropic(config);

    expect(createAnthropicMock).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { attribution: 'ri.attribution.main' } }),
    );
  });

  it('maps Anthropic aliases to RIDs and preserves raw RID passthrough', () => {
    const anthropic = createFoundryAnthropic(config);
    const rawRid = 'ri.language-model-service..language-model.anthropic-claude-4-6-sonnet';

    const aliasModel = anthropic('claude-sonnet-4.6');
    const rawModel = anthropic(rawRid);

    expect(anthropicLanguageModelMock).toHaveBeenNthCalledWith(
      1,
      'ri.language-model-service..language-model.anthropic-claude-4-6-sonnet',
    );
    expect(anthropicLanguageModelMock).toHaveBeenNthCalledWith(2, rawRid);
    expect(aliasModel.provider).toBe('foundry-anthropic');
    expect(aliasModel.modelId).toBe('claude-sonnet-4.6');
    expect(rawModel.modelId).toBe(rawRid);
    expect(anthropic.languageModel).toBeTypeOf('function');
    expect(anthropic.chat).toBeTypeOf('function');
    expect(anthropic.messages).toBeTypeOf('function');
  });

  it('preserves supported Anthropic provider options', async () => {
    const anthropic = createFoundryAnthropic(config);

    await anthropic('claude-sonnet-4.6').doGenerate({
      prompt: [],
      providerOptions: {
        anthropic: {
          disableParallelToolUse: true,
          effort: 'low',
          sendReasoning: true,
          structuredOutputMode: 'jsonTool',
          thinking: { type: 'enabled', budgetTokens: 512 },
          toolStreaming: false,
        },
      },
    });

    expect(anthropicState?.lastGenerateParams).toEqual({
      prompt: [],
      providerOptions: {
        anthropic: {
          disableParallelToolUse: true,
          effort: 'low',
          sendReasoning: true,
          structuredOutputMode: 'jsonTool',
          thinking: { type: 'enabled', budgetTokens: 512 },
          toolStreaming: false,
        },
      },
    });
  });

  it('disables Anthropic eager input streaming for tool requests', async () => {
    const anthropic = createFoundryAnthropic(config);

    await anthropic('claude-sonnet-5').doGenerate({
      prompt: [],
      providerOptions: {
        anthropic: {
          disableParallelToolUse: true,
        },
      },
      tools: [
        {
          type: 'function',
          name: 'searchRegulations',
          description: 'Search the regulation corpus.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      ],
    });

    expect(anthropicState?.lastGenerateParams).toEqual({
      prompt: [],
      providerOptions: {
        anthropic: {
          disableParallelToolUse: true,
          structuredOutputMode: 'jsonTool',
          toolStreaming: false,
        },
      },
      tools: [
        {
          type: 'function',
          name: 'searchRegulations',
          description: 'Search the regulation corpus.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      ],
    });
  });

  it('disables Anthropic eager input streaming for synthetic structured-output tools', async () => {
    const anthropic = createFoundryAnthropic(config);

    await anthropic('claude-sonnet-5').doStream({
      prompt: [],
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      },
    });

    expect(anthropicState?.lastStreamParams).toEqual({
      prompt: [],
      providerOptions: {
        anthropic: {
          structuredOutputMode: 'jsonTool',
          toolStreaming: false,
        },
      },
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      },
    });
  });

  it('fails early when Anthropic eager tool streaming is explicitly enabled', async () => {
    const anthropic = createFoundryAnthropic(config);
    const params = {
      prompt: [],
      tools: [
        {
          type: 'function' as const,
          name: 'searchRegulations',
          description: 'Search the regulation corpus.',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    };

    await expect(
      anthropic('claude-sonnet-5').doGenerate({
        ...params,
        providerOptions: {
          anthropic: {
            toolStreaming: true,
          },
        },
      }),
    ).rejects.toThrow(/toolStreaming=true/);

    await expect(
      anthropic('claude-sonnet-5').doGenerate({
        ...params,
        providerOptions: {
          'foundry-anthropic': {
            toolStreaming: true,
          },
        },
      }),
    ).rejects.toThrow(/toolStreaming=true/);

    await expect(
      anthropic('claude-sonnet-5').doGenerate({
        prompt: [],
        tools: [
          {
            ...params.tools[0],
            providerOptions: {
              anthropic: {
                eagerInputStreaming: true,
              },
            },
          },
        ],
      }),
    ).rejects.toThrow(/providerOptions\.anthropic\.eagerInputStreaming=true/);
    expect(anthropicState?.lastGenerateParams).toBeUndefined();
  });

  it('validates Anthropic config inputs at runtime', () => {
    expect(() =>
      createFoundryAnthropic({
        foundryUrl: 'https://example.palantirfoundry.com',
        token: '',
      }),
    ).toThrow(/config\.token/);
  });

  it('creates a Google provider with the normalized Foundry proxy URL and auth rewrite', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    createFoundryGoogle({
      foundryUrl: ' https://example.palantirfoundry.com/// ',
      token: ' token-123 ',
      attributionRid: ' ri.attribution.main ',
      traceParent: ' 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01 ',
      traceState: ' vendor=value ',
    });

    expect(createGoogleMock).toHaveBeenCalledWith({
      apiKey: 'token-123',
      baseURL: 'https://example.palantirfoundry.com/api/v2/llm/proxy/google/v1',
      fetch: expect.any(Function),
      headers: {
        attribution: 'ri.attribution.main',
        traceParent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        traceState: 'vendor=value',
      },
      name: 'foundry-google',
    });

    const googleCalls = createGoogleMock.mock.calls as Array<unknown[]>;
    const googleOptions = (googleCalls[0]?.[0] ?? {}) as {
      fetch?: typeof fetch;
    };
    await googleOptions?.fetch?.(
      'https://example.test/v1/models/gemini-2.5-flash:generateContent',
      {
        headers: {
          'x-goog-api-key': 'token-123',
          'x-test': '1',
        },
      },
    );

    const proxiedRequest = fetchSpy.mock.calls[0]?.[0];

    expect(proxiedRequest).toBeInstanceOf(Request);
    expect((proxiedRequest as Request).headers.get('Authorization')).toBe('Bearer token-123');
    expect((proxiedRequest as Request).headers.get('x-goog-api-key')).toBeNull();
    expect((proxiedRequest as Request).headers.get('x-test')).toBe('1');

    fetchSpy.mockRestore();
  });

  it('leaves Google headers undefined when optional config is absent', () => {
    createFoundryGoogle({
      foundryUrl: 'https://example.palantirfoundry.com',
      token: 'token-123',
    });

    expect(createGoogleMock).toHaveBeenCalledWith(expect.objectContaining({ headers: undefined }));
  });

  it('sets only the Google attribution header when trace context is absent', () => {
    createFoundryGoogle(config);

    expect(createGoogleMock).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { attribution: 'ri.attribution.main' } }),
    );
  });

  it('maps Google aliases to RIDs and preserves raw RID passthrough', () => {
    const google = createFoundryGoogle(config);
    const rawRid = 'ri.language-model-service..language-model.gemini-3-1-flash-lite';

    const aliasModel = google('gemini-2.5-flash');
    const rawModel = google(rawRid);

    expect(googleLanguageModelMock).toHaveBeenNthCalledWith(
      1,
      'ri.language-model-service..language-model.gemini-2-5-flash',
    );
    expect(googleLanguageModelMock).toHaveBeenNthCalledWith(2, rawRid);
    expect(aliasModel.provider).toBe('foundry-google');
    expect(aliasModel.modelId).toBe('gemini-2.5-flash');
    expect(rawModel.modelId).toBe(rawRid);
    expect(google.languageModel).toBeTypeOf('function');
    expect(google.chat).toBeTypeOf('function');
    expect(google.generativeAI).toBeTypeOf('function');
  });

  it('validates Google config inputs at runtime', () => {
    expect(() =>
      createFoundryGoogle({
        foundryUrl: '   ',
        token: 'token-123',
      }),
    ).toThrow(/config\.foundryUrl/);
  });

  it('keeps Anthropic and Google embedding models unsupported', () => {
    expect(() => createFoundryAnthropic(config).embeddingModel('embedding-model')).toThrow(
      /embeddingModel/,
    );
    expect(() => createFoundryGoogle(config).embeddingModel('embedding-model')).toThrow(
      /embeddingModel/,
    );
  });
});
