import { generateText, Output } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createFoundryAnthropic } from '../providers/anthropic.js';

// These cases drive the real @ai-sdk/anthropic peer so they assert the outgoing Anthropic
// wire body. The SDK resolves its default 'auto' structured-output mode from the model ID,
// and this adapter addresses models by Foundry RID, so only a real request shows which
// structured-output strategy is actually sent.

const config = {
  foundryUrl: 'https://foundry.example',
  token: 'test-token',
};
const OPUS_55_RID = 'ri.language-model-service..language-model.anthropic-claude-5-5-opus';
const schema = z.object({ answer: z.string().min(1) });

afterEach(() => vi.unstubAllGlobals());

type AnthropicBody = {
  output_config?: { format?: { type?: string; schema?: unknown } };
  tools?: Array<{ name: string }>;
  tool_choice?: unknown;
};

function captureBodies() {
  const bodies: AnthropicBody[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
      const body = (await new Request(input, init).json()) as AnthropicBody;
      bodies.push(body);
      // A forced JSON tool expects the answer back as tool input, not as text.
      const usesJsonTool = body.tools?.some((tool) => tool.name === 'json') === true;
      return Response.json({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'foundry',
        content: usesJsonTool
          ? [{ type: 'tool_use', id: 'tool_1', name: 'json', input: { answer: 'ok' } }]
          : [{ type: 'text', text: '{"answer":"ok"}' }],
        stop_reason: usesJsonTool ? 'tool_use' : 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }),
  );
  return bodies;
}

async function requestStructuredOutput(target: string) {
  const bodies = captureBodies();

  await generateText({
    model: createFoundryAnthropic(config)(target),
    output: Output.object({ schema, name: 'answer' }),
    prompt: 'Return the answer as JSON.',
    maxOutputTokens: 1024,
    maxRetries: 0,
  });

  return bodies.at(-1) as AnthropicBody;
}

describe('Foundry Anthropic structured output', () => {
  it.each(['claude-opus-5.5', OPUS_55_RID])(
    'sends a native output format and no forced tool for %s',
    async (target) => {
      const body = await requestStructuredOutput(target);

      expect(body.output_config?.format?.type).toBe('json_schema');
      expect(body.output_config?.format?.schema).toMatchObject({
        type: 'object',
        required: ['answer'],
      });
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
    },
  );

  it.each(['claude-opus-5', 'ri.language-model-service..language-model.anthropic-claude-5-opus'])(
    'keeps the forced JSON tool for %s',
    async (target) => {
      const body = await requestStructuredOutput(target);

      expect(body.output_config).toBeUndefined();
      expect(body.tools?.map((tool) => tool.name)).toEqual(['json']);
      expect(body.tool_choice).toMatchObject({ type: 'any' });
    },
  );

  it('does not let caller options downgrade Opus 5.5 to the forced JSON tool', async () => {
    const bodies = captureBodies();

    await generateText({
      model: createFoundryAnthropic(config)('claude-opus-5.5'),
      output: Output.object({ schema, name: 'answer' }),
      prompt: 'Return the answer as JSON.',
      maxOutputTokens: 1024,
      maxRetries: 0,
      providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
    });

    expect(bodies.at(-1)?.output_config?.format?.type).toBe('json_schema');
    expect(bodies.at(-1)?.tools).toBeUndefined();
  });
});
