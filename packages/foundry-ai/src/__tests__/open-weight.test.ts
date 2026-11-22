import { generateText, NoSuchModelError, Output, stepCountIs, streamText, tool } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { MODEL_CATALOG, resolveModelRid } from '../index.js';
import { createFoundryDeepSeek } from '../providers/deepseek.js';
import { createFoundryGemma } from '../providers/gemma.js';
import { createFoundryMoonshot } from '../providers/moonshot.js';
import { createFoundryNvidia } from '../providers/nvidia.js';
import { createFoundryQwen } from '../providers/qwen.js';
import { createFoundryZai } from '../providers/zai.js';

const config = {
  foundryUrl: 'https://foundry.example///',
  token: 'test-token',
  attributionRid: 'ri.attribution.test',
  traceParent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
};
const proxy = 'https://foundry.example/api/v2/llm/proxy/openai/v1';
const usage = { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 };
const makers = [
  ['deepseek', createFoundryDeepSeek, 'qwen3-32b', 'chat/completions', simpleChatOutput],
  ['nvidia', createFoundryNvidia, 'deepseek-v3.2', 'chat/completions', simpleChatOutput],
  ['qwen', createFoundryQwen, 'deepseek-v3.2', 'chat/completions', simpleChatOutput],
  ['moonshot', createFoundryMoonshot, 'deepseek-v3.2', 'chat/completions', simpleChatOutput],
  ['zai', createFoundryZai, 'deepseek-v3.2', 'chat/completions', simpleChatOutput],
  ['gemma', createFoundryGemma, 'deepseek-v3.2', 'responses', responsesOutput],
] as const;

afterEach(() => vi.unstubAllGlobals());

function stubFetch(respond: (index: number) => Response) {
  const requests: Array<{ request: Request; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const body = (await request.json()) as Record<string, unknown>;
      requests.push({ request, body });
      return respond(requests.length - 1);
    }),
  );
  return requests;
}

function chatOutput(message: Record<string, unknown>, finishReason = 'stop') {
  return Response.json({
    choices: [{ message: { role: 'assistant', ...message }, finish_reason: finishReason }],
    usage,
  });
}

function simpleChatOutput() {
  return chatOutput({ content: 'OK' });
}

function responsesOutput() {
  return Response.json({
    id: 'response-1',
    created_at: 1,
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'msg-1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'OK', annotations: [] }],
      },
    ],
    usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 },
  });
}

const routes = makers.flatMap(([maker, create, , path, respond]) =>
  Object.entries(MODEL_CATALOG)
    .filter(([, model]) => model.provider === maker)
    .flatMap(([alias, { rid }]) =>
      [alias, rid].map((target) => ({ maker, create, path, respond, target, rid })),
    ),
);

describe('open-weight provider routing', () => {
  it.each(routes)(
    '$maker sends $target as a RID',
    async ({ maker, create, path, respond, target, rid }) => {
      const requests = stubFetch(respond);
      const model = create(config).languageModel(target);
      expect(model.modelId).toBe(target);
      expect(model.provider).toBe(`foundry-${maker}`);
      const { text } = await generateText({ model, prompt: 'OK' });
      expect(text).toBe('OK');
      const request = requests[0]?.request;
      expect(request?.url).toBe(`${proxy}/${path}`);
      expect(request?.headers.get('authorization')).toBe('Bearer test-token');
      expect(request?.headers.get('attribution')).toBe(config.attributionRid);
      expect(request?.headers.get('traceparent')).toBe(config.traceParent);
      expect(requests[0]?.body.model).toBe(rid);
    },
  );

  it.each(makers)(
    '%s rejects foreign IDs and accepts enrollment-specific RIDs',
    async (_maker, create, foreign, _path, respond) => {
      const provider = create(config);
      expect(() => provider(foreign)).toThrow(NoSuchModelError);
      expect(() => provider(resolveModelRid(foreign))).toThrow(NoSuchModelError);
      expect(() => provider('custom-alias')).toThrow(NoSuchModelError);
      expect(() => provider('constructor')).toThrow(NoSuchModelError);
      const raw = 'ri.language-model-service..language-model.enrollment-specific-model';
      const requests = stubFetch(respond);
      await generateText({ model: provider(raw), prompt: 'OK' });
      expect(requests[0]?.body.model).toBe(raw);
    },
  );

  it('sends Gemma Responses without storing, reasoning or parallel tool controls', async () => {
    const requests = stubFetch(responsesOutput);
    await generateText({
      model: createFoundryGemma(config).responses('gemma-4-31b'),
      prompt: 'OK',
      maxOutputTokens: 20,
      reasoning: 'high',
      providerOptions: {
        openai: {
          store: true,
          reasoningEffort: 'high',
          reasoningSummary: 'auto',
          parallelToolCalls: true,
        },
      },
    });
    expect(requests[0]?.body).toMatchObject({ store: false, max_output_tokens: 20 });
    expect(requests[0]?.body).not.toHaveProperty('reasoning');
    expect(requests[0]?.body).not.toHaveProperty('include');
    expect(requests[0]?.body).not.toHaveProperty('parallel_tool_calls');
  });
});

it('extracts tagged reasoning before parsing structured output', async () => {
  const requests = stubFetch(() =>
    chatOutput({ content: '<reasoning>Consider it.</reasoning>{"ok":true}' }),
  );
  const result = await generateText({
    model: createFoundryDeepSeek(config)('deepseek-v3.2'),
    prompt: 'Return JSON.',
    output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
    providerOptions: { deepseek: { reasoningEffort: 'high' } },
  });
  expect(result.output).toEqual({ ok: true });
  expect(result.finalStep.reasoningText).toBe('Consider it.');
  expect(requests[0]?.body).toMatchObject({
    reasoning_effort: 'high',
    response_format: { type: 'json_schema', json_schema: { strict: true } },
  });
});

it.each([
  ['Qwen', () => createFoundryQwen(config).chat('qwen3-32b'), 'qwen'],
  ['GLM-5', () => createFoundryZai(config).chat('glm-5'), 'zai'],
] as const)(
  '%s splits streamed reasoning tags and retains terminal usage',
  async (_name, model, key) => {
    const chunks = [
      '<reas',
      'oning>First</rea',
      'soning><reason',
      'ing>Second</reason',
      'ing>{"ok":',
      'true}',
    ];
    const responses = [
      ...chunks.map((content) => ({ choices: [{ delta: { content } }] })),
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage },
    ];
    const requests = stubFetch(
      () =>
        new Response(
          responses.map((response) => `data: ${JSON.stringify(response)}\n\n`).join(''),
          {
            headers: { 'content-type': 'text/event-stream' },
          },
        ),
    );
    const result = streamText({
      model: model(),
      prompt: 'Think first, then output JSON.',
      providerOptions: { [key]: { reasoningEffort: 'high', parallel_tool_calls: false } },
    });
    const { reasoningText: reasoning } = await result.finalStep;
    expect(reasoning).toContain('First');
    expect(reasoning).toContain('Second');
    expect(reasoning).not.toContain('<');
    expect(await result.text).toBe('{"ok":true}');
    expect(await result.usage).toMatchObject({ inputTokens: 4, outputTokens: 3 });
    expect(requests[0]?.body).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: 'high',
    });
    expect(requests[0]?.body).not.toHaveProperty('parallel_tool_calls');
  },
);

it.each([
  ['glm-5', 'none', 'none'],
  ['glm-5', 'max', undefined],
  ['glm-5.3', 'none', undefined],
  [resolveModelRid('glm-5.3'), 'xhigh', 'xhigh'],
  ['glm-5.3', 'max', 'max'],
] as const)('Z.ai only sends supported effort: %s with %s', async (id, effort, sent) => {
  const requests = stubFetch(simpleChatOutput);
  await generateText({
    model: createFoundryZai(config)(id),
    prompt: 'Reply OK.',
    maxOutputTokens: 8192,
    providerOptions: { zai: { reasoningEffort: effort } },
  });
  expect(requests[0]?.body.reasoning_effort).toBe(sent);
  expect(requests[0]?.body.max_tokens).toBe(8192);
});

it('returns GLM-5.3 reasoning token usage without extracting reasoning from its text', async () => {
  const content = '<reasoning>literal text</reasoning>';
  stubFetch(() =>
    Response.json({
      choices: [{ message: { content, role: 'assistant' }, finish_reason: 'stop' }],
      usage: { ...usage, completion_tokens_details: { reasoning_tokens: 2 } },
    }),
  );
  const result = await generateText({
    model: createFoundryZai(config)('glm-5.3'),
    prompt: 'Show the reasoning tag as text.',
    providerOptions: { zai: { reasoningEffort: 'high' } },
  });
  expect(result.text).toBe(content);
  expect(result.finalStep.reasoning).toEqual([]);
  expect(result.usage.outputTokenDetails?.reasoningTokens).toBe(2);
});

it('exposes Kimi reasoning but does not replay it in the next tool-loop request', async () => {
  const responses = [
    chatOutput(
      {
        content: null,
        reasoning_content: 'I need the lookup result.',
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' } },
        ],
      },
      'tool_calls',
    ),
    chatOutput({ content: 'verified' }),
  ];
  const requests = stubFetch((step) => responses[step]);
  const result = await generateText({
    model: createFoundryMoonshot(config)('kimi-k3.1-pro-highspeed'),
    prompt: 'Look up the status.',
    stopWhen: stepCountIs(2),
    providerOptions: { moonshot: { parallel_tool_calls: true } },
    tools: {
      lookup: tool({ inputSchema: z.object({}), execute: () => ({ status: 'verified' }) }),
    },
  });
  expect(result.steps[0]?.reasoningText).toBe('I need the lookup result.');
  expect(result.text).toBe('verified');
  expect(requests).toHaveLength(2);
  for (const { body } of requests) {
    expect(body).not.toHaveProperty('parallel_tool_calls');
  }
  expect(requests[1]?.body.messages).toMatchObject([
    { role: 'user' },
    { role: 'assistant', tool_calls: [{ id: 'call-1' }] },
    { role: 'tool', tool_call_id: 'call-1' },
  ]);
  expect(JSON.stringify(requests[1]?.body.messages)).not.toContain('reasoning_content');
});
