import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { createFoundryAnthropic } from '@shpitdev/foundry-ai/anthropic';
import { createFoundryGoogle } from '@shpitdev/foundry-ai/google';
import { createFoundryOpenAI } from '@shpitdev/foundry-ai/openai';
import { createFoundryXai } from '@shpitdev/foundry-ai/xai';
import type * as XaiEntry from '@shpitdev/foundry-ai/xai';
import * as ai from 'ai';
import { createProviderRegistry, generateText, type LanguageModel } from 'ai';

const expectedVersion = process.argv[2];

if (!expectedVersion) {
  throw new Error('Expected an AI SDK specification version argument.');
}

const config = {
  foundryUrl: 'https://example.palantirfoundry.com',
  token: 'test-token',
};
const openai = createFoundryOpenAI(config);
const anthropic = createFoundryAnthropic(config);
const google = createFoundryGoogle(config);
const xai = createFoundryXai(config);
const providersAndModels = [
  { provider: xai, model: xai('grok-4-6') },
  { provider: xai, model: xai.responses('grok-4-6') },
  { provider: xai, model: xai.chat('grok-4-6') },
  { provider: openai, model: openai('gpt-5.6-terra') },
  { provider: anthropic, model: anthropic('claude-opus-5') },
  { provider: google, model: google('gemini-4-argon') },
];
const acceptsAiSdkModel = (_model: LanguageModel) => {};
const registry = createProviderRegistry({ anthropic, google, openai, xai });
acceptsAiSdkModel(registry.languageModel('openai:gpt-5.6-terra'));
acceptsAiSdkModel(registry.languageModel('xai:grok-4-6'));

for (const { provider, model } of providersAndModels) {
  acceptsAiSdkModel(model);

  // Typed as string: the packed library runs against SDKs with other specification versions.
  const versions: Record<string, string> = {
    provider: provider.specificationVersion,
    model: model.specificationVersion,
  };
  for (const [kind, version] of Object.entries(versions)) {
    if (version !== expectedVersion) {
      throw new Error(`Expected ${kind} specification ${expectedVersion}, received ${version}.`);
    }
  }
}

// Exercise both package export conditions and the native transport, not only types.
const require = createRequire(import.meta.url);
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- require() is untyped; this exercises the CJS export condition.
const cjsXai = require('@shpitdev/foundry-ai/xai') as typeof XaiEntry;
const requests: Array<string> = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const body: unknown = await request.json();
  assert.ok(isRecord(body));
  requests.push(request.url);
  assert.equal(request.headers.get('authorization'), 'Bearer test-token');
  assert.equal(body.model, 'ri.language-model-service..language-model.grok-4-6');
  if (request.url.endsWith('/responses')) {
    assert.equal(body.store, false);
    return Response.json({
      id: 'resp',
      created_at: 1,
      status: 'completed',
      output: [
        {
          type: 'message',
          id: 'msg',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'OK' }],
        },
      ],
    });
  }
  assert.equal(body.store, undefined);
  return Response.json({
    id: 'chat',
    created: 1,
    model: body.model,
    choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
  });
};
const results = await Promise.all(
  [createFoundryXai, cjsXai.createFoundryXai].flatMap((factory) => {
    const provider = factory(config);
    const model = createProviderRegistry({ xai: provider }).languageModel('xai:grok-4-6');
    assert.equal(model.provider, 'foundry-xai');
    return [model, provider.chat('grok-4-6')].map((selected) =>
      generateText({ model: selected, prompt: 'Reply OK.', maxRetries: 0 }),
    );
  }),
);
for (const result of results) {
  assert.equal(result.text, 'OK');
}
assert.equal(requests.length, 4);
assert.equal(requests.filter((url) => url.endsWith('/xai/v1/responses')).length, 2);
assert.equal(requests.filter((url) => url.endsWith('/xai/v1/chat/completions')).length, 2);
console.log(`Packed ESM/CJS native xAI routing and registry passed for ${expectedVersion}.`);

// Decision models need an @ai-sdk/openai release with decisionModel; older peers get a clear error.
if (typeof (ai as Record<string, unknown>).experimental_decide === 'function') {
  const decision = openai.decisionModel('gpt-6-luna') as { provider: string; modelId: string };
  assert.equal(decision.provider, 'foundry-openai.decision');
  assert.equal(decision.modelId, 'ri.language-model-service..language-model.gpt-6-luna');
} else {
  assert.throws(() => openai.decisionModel('gpt-6-luna'), /decisionModel/u);
}
console.log(`Packed OpenAI decision model creation passed for ${expectedVersion}.`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
