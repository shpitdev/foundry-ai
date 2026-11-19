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
  it.each(['gemma-4-31b', 'gemma-4-26b-a4b'])(
    'routes alias and RID for %s to Responses',
    async (alias) => {
      const rid = resolveModelTarget(alias).rid;
      const requests: Request[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          requests.push(request);
          return Response.json({
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
          });
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
        expect(request.url).toBe('https://foundry.example/api/v2/llm/proxy/openai/v1/responses');
        expect(request.headers.get('authorization')).toBe('Bearer test-token');
        expect(request.headers.get('attribution')).toBe('ri.attribution.test');
        expect(request.headers.get('traceParent')).toBe(
          '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
        );
        const body = await request.json();
        expect(body).toMatchObject({ model: rid, store: false });
      }
    },
  );

  it('rejects retention before sending a request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      generateText({
        model: createFoundryThirdParty(config)('gemma-4-31b'),
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
    expect(() => provider('grok-4-6')).toThrow();
    expect(() => provider(resolveModelTarget('grok-4-6').rid)).toThrow();
    expect(() => provider('kimi-k2-5')).toThrow();
  });
});
