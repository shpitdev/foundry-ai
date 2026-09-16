import { readFileSync } from 'node:fs';
import { createXai } from '@ai-sdk/xai';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createFoundryXai } from '../providers/xai.js';
import { createXaiProxyFetch } from '../providers/xai-compat.js';

const config = { foundryUrl: 'https://foundry.example', token: 'test-token' };
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const responseFixture = JSON.parse(fixture('xai-foundry-response.json'));
afterEach(() => vi.unstubAllGlobals());

function sseResponse(sse: string, split = 17) {
  const bytes = new TextEncoder().encode(sse);
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset === bytes.length) return controller.close();
        controller.enqueue(bytes.slice(offset, offset + split));
        offset = Math.min(bytes.length, offset + split);
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

async function consume(model: ReturnType<ReturnType<typeof createFoundryXai>>, options = {}) {
  const result = streamText({ model, prompt: 'Reply OK.', maxRetries: 0, ...options });
  let text = '';
  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (part.type === 'text-delta') text += part.text;
  }
  return text;
}

describe('native xAI compatibility with recorded Foundry responses', () => {
  it('reproduces native schema rejection and restores the recorded completed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(responseFixture)),
    );
    const native = createXai({
      apiKey: config.token,
      baseURL: `${config.foundryUrl}/api/v2/llm/proxy/xai/v1`,
    });
    await expect(
      generateText({
        model: native.responses('grok-4-6'),
        prompt: 'Reply OK.',
        providerOptions: { xai: { store: false } },
        maxRetries: 0,
      }),
    ).rejects.toThrow('Invalid JSON response');
    const result = await generateText({
      model: createFoundryXai(config)('grok-4-6'),
      prompt: 'Reply OK.',
      maxRetries: 0,
    });
    expect(result.text).toBe('OK');
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'reasoning',
          providerMetadata: { xai: { itemId: 'rs_fd53b575-036b-9c83-8de8-9140af7035d7' } },
        }),
      ]),
    );
  });

  it('retains the native missing reasoning-start failure on the historical SSE fixture', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(fixture('xai-foundry-reasoning.sse'))),
    );
    await expect(consume(createFoundryXai(config)('grok-4-6'))).rejects.toMatch(
      /reasoning part .* not found/,
    );
  });

  it.each(['\n', '\r\n'])(
    'executes a tool from the recorded stream and completes its follow-up with %j framing',
    async (newline) => {
      const requests: Record<string, unknown>[] = [];
      const toolStream = fixture('xai-foundry-tool.sse').replace(/\r?\n/g, newline);
      // Follow-up is a small protocol fixture; the first request replays a live tool call.
      const message = {
        type: 'message',
        id: 'msg-final',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'verified', annotations: [] }],
      };
      const final = [
        { type: 'response.created', response: { id: 'resp-final', created_at: 1, model: 'grok' } },
        {
          type: 'response.output_text.delta',
          item_id: message.id,
          output_index: 0,
          content_index: 0,
          delta: 'verified',
        },
        { type: 'response.output_item.done', output_index: 0, item: message },
        {
          type: 'response.completed',
          response: {
            id: 'resp-final',
            created_at: 1,
            model: 'grok',
            status: 'completed',
            output: [message],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
      ]
        .map((event) => `data: ${JSON.stringify(event)}${newline}${newline}`)
        .join('');
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          requests.push((await new Request(input, init).json()) as Record<string, unknown>);
          return sseResponse(requests.length === 1 ? toolStream : final, 1);
        }),
      );
      const execute = vi.fn(async ({ topic }: { topic: string }) => ({
        topic,
        status: 'verified',
      }));
      const text = await consume(createFoundryXai(config)('grok-420-non-reasoning-latest'), {
        tools: { lookup: tool({ inputSchema: z.object({ topic: z.string() }), execute }) },
        stopWhen: stepCountIs(3),
      });
      expect(text).toBe('verified');
      expect(execute).toHaveBeenCalledOnce();
      expect(execute.mock.calls[0][0]).toEqual({ topic: 'oncology' });
      expect(requests).toHaveLength(2);
      expect(requests[1].input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'function_call',
            call_id: expect.any(String),
            id: expect.any(String),
          }),
          expect.objectContaining({
            type: 'function_call_output',
            output: '{"topic":"oncology","status":"verified"}',
          }),
        ]),
      );
    },
  );

  it('preserves errors, explicit invalid fields, and incomplete output without marking it complete', async () => {
    const wireFetch = createXaiProxyFetch();
    const request = () =>
      new Request(`${config.foundryUrl}/api/v2/llm/proxy/xai/v1/responses`, {
        method: 'POST',
        body: '{}',
      });
    const error = Response.json({ error: 'invalid' }, { status: 400 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => error),
    );
    expect(await wireFetch(request())).toBe(error);
    const incomplete = {
      object: 'wrong',
      status: 'incomplete',
      output: [{ type: 'reasoning', id: 'rs', summary: [] }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(incomplete)),
    );
    expect(await (await wireFetch(request())).json()).toEqual(incomplete);
  });

  it('preserves unknown/malformed SSE events and removes stale body headers', async () => {
    const data =
      ': comment\ndata: [DONE]\n\ndata: {"type":"error","message":"upstream failure"}\n\ndata: malformed\n\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(data, {
            headers: {
              'content-type': 'text/event-stream',
              'content-length': '1',
              'content-encoding': 'gzip',
              'x-trace': 'preserved',
            },
          }),
      ),
    );
    const response = await createXaiProxyFetch()(
      `${config.foundryUrl}/api/v2/llm/proxy/xai/v1/responses`,
      { method: 'POST', body: '{"stream":true}' },
    );
    expect(await response.text()).toBe(data);
    expect(response.headers.has('content-length')).toBe(false);
    expect(response.headers.has('content-encoding')).toBe(false);
    expect(response.headers.get('x-trace')).toBe('preserved');
  });
});
