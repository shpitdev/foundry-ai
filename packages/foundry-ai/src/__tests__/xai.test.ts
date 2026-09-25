import { createProviderRegistry, generateText, NoSuchModelError } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XAI_MODEL_IDS, XAI_MODELS } from '../index.js';
import { MODEL_CATALOG, resolveModelTarget } from '../models/catalog.js';
import { THIRD_PARTY_MODELS } from '../models/third-party-models.js';
import { createFoundryThirdParty } from '../providers/third-party.js';
import { createFoundryXai } from '../providers/xai.js';

describe('xAI catalog identity', () => {
  it('classifies every Grok alias and RID as xai, separate from third-party', () => {
    const grok = Object.entries(MODEL_CATALOG).filter(([id]) => id.startsWith('grok-'));
    expect(grok).toHaveLength(XAI_MODEL_IDS.length);
    expect(grok.map(([id]) => id)).toEqual([...XAI_MODEL_IDS]);
    for (const [alias, metadata] of grok) {
      expect(metadata.provider).toBe('xai');
      expect(resolveModelTarget(metadata.rid).metadata?.provider).toBe('xai');
      expect(THIRD_PARTY_MODELS).not.toHaveProperty(alias);
    }
  });

  it('resolves Grok 4.7 metadata from the Foundry listing', () => {
    expect(XAI_MODELS['grok-4-7']).toMatchObject({
      rid: 'ri.language-model-service..language-model.grok-4-7',
      displayName: 'Grok 4.7',
      lifecycle: 'ga',
      modelIdentifier: 'GROK_4_7',
      modelCreator: 'X_AI',
      provider: 'xai',
      trainingCutoffDate: '2026-05-01T00:00:00Z',
      transport: 'xai-responses',
      performance: { modelClass: 'REASONING' },
      supportsResponses: true,
      supportsVision: true,
    });
    // The listing publishes no cost or speed for this model, so neither is invented.
    expect(XAI_MODELS['grok-4-7'].performance.cost).toBeUndefined();
    expect(XAI_MODELS['grok-4-7'].performance.speed).toBeUndefined();
    expect(XAI_MODELS['grok-4-7'].externalUrl).toBeUndefined();
  });
});

const config = {
  foundryUrl: ' https://foundry.example/// ',
  token: ' test-token ',
  attributionRid: 'ri.attribution.test',
  traceParent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
  traceState: 'vendor=value',
};

afterEach(() => vi.unstubAllGlobals());

type RequestBody = Record<string, unknown> & { input?: unknown[]; messages?: unknown[] };
async function readBody(request: Request): Promise<RequestBody> {
  return (await request.json()) as RequestBody;
}

function captureRequests() {
  const requests: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const body = await readBody(request.clone());
      if (body.stream) {
        return new Response('data: [DONE]\n\n', {
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      return Response.json(
        request.url.endsWith('/chat/completions')
          ? {
              id: 'chat-1',
              created: 1,
              model: body.model,
              choices: [
                { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }
          : {
              id: 'resp-1',
              created_at: 1,
              model: body.model,
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
              usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
            },
      );
    }),
  );
  return requests;
}

describe('xAI routing through the real SDK', () => {
  it.each(['responses', 'chat'] as const)(
    'routes every Grok alias and RID through %s',
    async (route) => {
      const requests = captureRequests();
      const provider = createFoundryXai(config);
      for (const alias of XAI_MODEL_IDS) {
        expect(XAI_MODELS[alias].supportsResponses).toBe(true);
        for (const target of [alias, XAI_MODELS[alias].rid]) {
          const model = provider[route](target);
          expect(model.modelId).toBe(target);
          expect(model.provider).toBe('foundry-xai');
          expect(model.specificationVersion).toBe(provider.specificationVersion);
          const result = await generateText({ model, prompt: 'Say OK', maxRetries: 0 });
          expect(result.text).toBe('OK');
          const request = requests.at(-1)!;
          expect(request.url).toBe(
            `https://foundry.example/api/v2/llm/proxy/xai/v1/${route === 'chat' ? 'chat/completions' : 'responses'}`,
          );
          expect(request.method).toBe('POST');
          expect(request.headers.get('authorization')).toBe('Bearer test-token');
          expect(request.headers.get('attribution')).toBe(config.attributionRid);
          expect(request.headers.get('traceparent')).toBe(config.traceParent);
          expect(request.headers.get('tracestate')).toBe(config.traceState);
          const body = await readBody(request);
          expect(body.model).toBe(XAI_MODELS[alias].rid);
          if (route === 'chat') expect(body).not.toHaveProperty('store');
          else expect(body.store).toBe(false);
        }
      }
      expect(requests).toHaveLength(XAI_MODEL_IDS.length * 2);
    },
  );

  it('defaults callable, languageModel and registry calls to Responses with xAI identity', async () => {
    const requests = captureRequests();
    const xai = createFoundryXai(config);
    const registry = createProviderRegistry({
      xai,
      'third-party': createFoundryThirdParty(config),
    });
    for (const model of [
      xai('grok-4-6'),
      xai.languageModel('grok-4-6'),
      registry.languageModel('xai:grok-4-6'),
    ]) {
      expect(model.provider).toBe('foundry-xai');
      await generateText({ model, prompt: 'OK', maxRetries: 0 });
    }
    expect(requests).toHaveLength(3);
    expect(requests.every((r) => r.url.endsWith('/xai/v1/responses'))).toBe(true);
    expect(() => registry.languageModel('third-party:grok-4-6')).toThrow(NoSuchModelError);
    expect(() => registry.embeddingModel('xai:grok-4-6')).toThrow(NoSuchModelError);
    expect(() => registry.imageModel('xai:grok-4-6')).toThrow(NoSuchModelError);
  });

  it.each(['responses', 'chat'] as const)(
    'passes unknown enrollment IDs unchanged on %s and rejects known foreign models',
    async (route) => {
      const requests = captureRequests();
      const xai = createFoundryXai(config);
      for (const id of ['custom-grok', 'ri.language-model-service..language-model.custom-grok']) {
        await generateText({ model: xai[route](id), prompt: 'OK', maxRetries: 0 });
        expect((await readBody(requests.at(-1)!)).model).toBe(id);
      }
      for (const id of ['gpt-5', 'kimi-k3', resolveModelTarget('kimi-k3').rid]) {
        expect(() => xai[route](id)).toThrow(NoSuchModelError);
      }
    },
  );

  it.each(['responses', 'chat'] as const)(
    'rejects store=true before generate or stream fetch on %s',
    async (route) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      for (const method of ['doGenerate', 'doStream'] as const) {
        await expect(
          createFoundryXai(config)
            [route]('grok-4-6')
            [method]({
              prompt: [{ role: 'user', content: [{ type: 'text', text: 'OK' }] }],
              providerOptions: { xai: { store: true } },
            }),
        ).rejects.toThrow('Foundry xAI does not support providerOptions.xai.store=true');
      }
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['responses', 'chat'] as const)(
    'preserves options, headers and cancellation with store=false on %s',
    async (route) => {
      const requests = captureRequests();
      const controller = new AbortController();
      await createFoundryXai(config)
        [route]('grok-4-6')
        .doGenerate({
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'OK' }] }],
          providerOptions: { xai: { store: false, reasoningEffort: 'low' } },
          headers: { 'x-request-id': 'custom-request' },
          abortSignal: controller.signal,
        });
      const request = requests[0];
      const body = await readBody(request);
      expect(route === 'responses' ? body.reasoning : body.reasoning_effort).toEqual(
        route === 'responses' ? { effort: 'low' } : 'low',
      );
      expect(request.headers.get('x-request-id')).toBe('custom-request');
      if (route === 'responses') expect(body.store).toBe(false);
      else expect(body).not.toHaveProperty('store');
      controller.abort();
      expect(request.signal.aborted).toBe(true);
    },
  );

  it.each(['responses', 'chat'] as const)(
    'applies governance and history conversion to streaming requests on %s',
    async (route) => {
      const requests = captureRequests();
      const result = await createFoundryXai(config)
        [route]('grok-4-6')
        .doStream({
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Remember blue.' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'Blue.' }] },
            { role: 'user', content: [{ type: 'text', text: 'Which color?' }] },
          ],
        });
      await result.stream.pipeTo(new WritableStream());
      const body = await readBody(requests[0]);
      expect(body.stream).toBe(true);
      if (route === 'responses') {
        expect(body.store).toBe(false);
        expect(body.input?.[1]).toEqual({ role: 'assistant', content: 'Blue.' });
      } else {
        expect(body).not.toHaveProperty('store');
        expect(body).not.toHaveProperty('input');
        expect(body.messages?.[1]).toEqual({ role: 'assistant', content: 'Blue.' });
      }
    },
  );

  it('preserves tool calls and results during Responses assistant normalization', async () => {
    const requests = captureRequests();
    await createFoundryXai(config)('grok-4-6').doGenerate({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Look up blue.' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Checking.' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: { color: 'blue' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'lookup',
              output: { type: 'json', value: { status: 'verified' } },
            },
          ],
        },
      ],
    });
    const body = await readBody(requests[0]);
    expect(body.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'Look up blue.' }] },
      { role: 'assistant', content: 'Checking.' },
      {
        type: 'function_call',
        id: 'call-1',
        status: 'completed',
        call_id: 'call-1',
        name: 'lookup',
        arguments: '{"color":"blue"}',
      },
      { type: 'function_call_output', call_id: 'call-1', output: '{"status":"verified"}' },
    ]);
  });

  it('validates configuration at construction', () => {
    expect(() => createFoundryXai({ ...config, token: ' ' })).toThrow(
      'createFoundryXai requires config.token',
    );
    expect(() => createFoundryXai({ ...config, foundryUrl: ' ' })).toThrow(
      'createFoundryXai requires config.foundryUrl',
    );
    expect(() => createFoundryXai({ ...config, traceParent: 'bad' })).toThrow('traceParent');
  });
  it('sends assistant history as text on the xAI proxy', async () => {
    let body: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
        body = (await new Request(input, init).json()) as Record<string, unknown>;
        return Response.json({ id: 'resp-1', created_at: 1, status: 'completed', output: [] });
      }),
    );
    await createFoundryXai(config)('grok-4-6').doGenerate({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Remember blue.' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'I remember ',
              providerOptions: { xai: { itemId: 'msg-previous' } },
            },
            { type: 'text', text: 'blue.' },
          ],
        },
        { role: 'user', content: [{ type: 'text', text: 'Which color?' }] },
      ],
    });
    expect(body?.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'Remember blue.' }] },
      { role: 'assistant', content: 'I remember ' },
      { role: 'assistant', content: 'blue.' },
      { role: 'user', content: [{ type: 'input_text', text: 'Which color?' }] },
    ]);
  });
});
