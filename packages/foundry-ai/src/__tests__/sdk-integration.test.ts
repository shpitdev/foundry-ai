import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { webSearch } from '@exalabs/ai-sdk';
import { generateText, stepCountIs } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveCapabilityRecorder } from './helpers/live-capabilities.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('executes the Exa tool with SDK 7 and persists harness events and spans offline', async () => {
  vi.stubEnv('FOUNDRY_URL', 'https://example.palantirfoundry.com');
  vi.stubEnv('FOUNDRY_TOKEN', 'test-token');
  const runId = `sdk-smoke-${crypto.randomUUID()}`;
  const artifactRoot = join(import.meta.dirname, '../../../../.memory/sdk-smoke');
  const artifactDir = join(artifactRoot, runId);
  vi.stubEnv('LIVE_CAPABILITY_RUN_ID', runId);
  vi.stubEnv('LIVE_CAPABILITY_ARTIFACT_DIR', artifactRoot);
  const fetchMock = vi
    .fn()
    .mockResolvedValue(Response.json({ results: [{ title: 'Fixture result' }] }));
  vi.stubGlobal('fetch', fetchMock);
  const usage = {
    inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 2, text: 2, reasoning: 0 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'search-1',
            toolName: 'webSearch',
            input: '{"query":"SDK documentation"}',
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'Found the documentation.' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
    ],
  });
  const recorder = new LiveCapabilityRecorder();
  const result = await recorder.runCase(
    {
      capability: 'tool-calling',
      expectation: 'must-pass',
      modelId: 'offline-model',
      provider: 'openai',
    },
    (telemetry) =>
      generateText({
        model,
        prompt: 'Find SDK documentation.',
        tools: { webSearch: webSearch({ apiKey: 'test-key' }) },
        stopWhen: stepCountIs(2),
        telemetry,
      }),
  );
  await recorder.flush();

  expect(result?.text).toBe('Found the documentation.');
  expect(result?.steps[0]?.toolResults[0]?.output).toEqual({
    results: [{ title: 'Fixture result' }],
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const record = JSON.parse(await readFile(join(artifactDir, 'results.json'), 'utf8'));
  expect(record.sdk.ai).toMatch(/^7\./);
  expect(record.sdk['@ai-sdk/openai']).toMatch(/^4\./);
  expect(record.cases[0].telemetry.eventCounts).toMatchObject({
    onStart: 1,
    onStepStart: 2,
    onToolCallStart: 1,
    onToolCallFinish: 1,
    onStepFinish: 2,
    onFinish: 1,
  });
  const spans = JSON.parse(await readFile(join(artifactDir, 'otel-spans.json'), 'utf8'));
  expect(spans.length).toBeGreaterThan(0);
  expect(new Set(spans.map((span: { traceId: string }) => span.traceId)).size).toBe(1);
  expect(spans.filter((span: { parentSpanId?: string }) => !span.parentSpanId)).toHaveLength(1);
  expect(spans.every((span: { endedAt?: string }) => Boolean(span.endedAt))).toBe(true);
  expect(spans[0].attributes).toMatchObject({
    capability: 'tool-calling',
    modelId: 'offline-model',
  });
});
