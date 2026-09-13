import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadata, resolveModelTarget } from '../models/catalog.js';
import { createFoundryThirdParty } from '../providers/third-party.js';

const config = {
  foundryUrl: 'https://foundry.example',
  token: 'test-token',
  attributionRid: 'ri.attribution.test',
  traceParent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
};

afterEach(() => vi.unstubAllGlobals());

describe('third-party routing through the real SDK', () => {
  it.each([
    ['kimi-k2-5', 'openai/v1/chat/completions'],
    ['qwen3-32b', 'openai/v1/chat/completions'],
    ['glm-5', 'openai/v1/chat/completions'],
    ['gemma-4-31b', 'openai/v1/responses'],
    ['nemotron-3-ultra-550b-a55b-nvfp4', 'openai/v1/responses'],
    ['grok-4-6', 'xai/v1/responses'],
  ])('routes alias and RID for %s to %s', async (alias, path) => {
    const rid = resolveModelTarget(alias).rid;
    const requests: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        const body = path.endsWith('chat/completions')
          ? {
              id: 'chat-1',
              created: 1,
              model: rid,
              choices: [
                { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }
          : {
              id: 'resp-1',
              created_at: 1,
              model: rid,
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
            };
        return Response.json(body);
      }),
    );
    const provider = createFoundryThirdParty(config);
    for (const target of [alias, rid]) {
      const result = await generateText({
        model: provider(target),
        prompt: 'Say OK',
        maxRetries: 0,
      });
      expect(result.text).toBe('OK');
    }
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).toBe(`https://foundry.example/api/v2/llm/proxy/${path}`);
      expect(request.headers.get('authorization')).toBe('Bearer test-token');
      expect(request.headers.get('attribution')).toBe('ri.attribution.test');
      expect(request.headers.get('traceParent')).toBe(
        '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
      );
      const body = await request.json();
      expect(body).toMatchObject({ model: rid });
      if (path.endsWith('chat/completions')) {
        expect(body).not.toHaveProperty('store');
      } else {
        expect(body).toHaveProperty('store', false);
      }
    }
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
    await createFoundryThirdParty(config)('grok-4-6').doGenerate({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Remember blue.' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'I remember ',
              providerOptions: { openai: { itemId: 'msg-previous' } },
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

  it('rejects retention before sending a request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      generateText({
        model: createFoundryThirdParty(config)('grok-4-6'),
        prompt: 'test',
        providerOptions: { openai: { store: true } },
        maxRetries: 0,
      }),
    ).rejects.toThrow('store=true');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not guess routes for unavailable, unknown, or other-provider models', () => {
    const provider = createFoundryThirdParty(config);
    expect(() => provider('llama-3-3-nemotron-super-49b-v1-5')).toThrow('no verified');
    expect(() => provider('unknown-model')).toThrow();
    expect(() => provider('gpt-5')).toThrow();
    expect(getModelMetadata('llama-3-3-nemotron-super-49b-v1-5')?.transport).toBe('unavailable');
    expect(getModelMetadata('grok-4-6')?.supportsResponses).toBe(true);
    expect(getModelMetadata('kimi-k2-5')?.supportsResponses).toBe(false);
  });
});
