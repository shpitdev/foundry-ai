import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { createFoundryAnthropic } from '@nyrra/foundry-ai/anthropic';
import { createFoundryGoogle } from '@nyrra/foundry-ai/google';
import { createFoundryOpenAI } from '@nyrra/foundry-ai/openai';
import { createFoundryThirdParty } from '@nyrra/foundry-ai/third-party';
import { createFoundryXai } from '@nyrra/foundry-ai/xai';
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
const thirdParty = createFoundryThirdParty(config);
const providersAndModels = [
  { provider: thirdParty, model: thirdParty('kimi-k2-5') },
  { provider: thirdParty, model: thirdParty('gemma-4-31b') },
  { provider: xai, model: xai('grok-4-6') },
  { provider: xai, model: xai.responses('grok-4-6') },
  { provider: xai, model: xai.chat('grok-4-6') },
  { provider: openai, model: openai('gpt-5.6-terra') },
  { provider: anthropic, model: anthropic('claude-opus-5') },
  { provider: google, model: google('gemini-3.6-flash') },
];
const acceptsAiSdkModel = (_model: LanguageModel) => undefined;
const registry = createProviderRegistry({ anthropic, google, openai, xai });
acceptsAiSdkModel(registry.languageModel('openai:gpt-5.6-terra'));
acceptsAiSdkModel(registry.languageModel('xai:grok-4-6'));

for (const { provider, model } of providersAndModels) {
  acceptsAiSdkModel(model);

  if (provider.specificationVersion !== expectedVersion) {
    throw new Error(
      `Expected provider specification ${expectedVersion}, received ${provider.specificationVersion}.`,
    );
  }

  if (model.specificationVersion !== expectedVersion) {
    throw new Error(
      `Expected model specification ${expectedVersion}, received ${model.specificationVersion}.`,
    );
  }
}

// Exercise both package export conditions and the native transport, not only types.
const require = createRequire(import.meta.url);
const cjsXai = require('@nyrra/foundry-ai/xai') as typeof import('@nyrra/foundry-ai/xai');
const requests: string[] = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const body = (await request.json()) as Record<string, unknown>;
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
for (const factory of [createFoundryXai, cjsXai.createFoundryXai]) {
  const provider = factory(config);
  const registry = createProviderRegistry({ xai: provider });
  const model = registry.languageModel('xai:grok-4-6');
  assert.equal(model.provider, 'foundry-xai');
  for (const selected of [model, provider.chat('grok-4-6')]) {
    const result = await generateText({ model: selected, prompt: 'Reply OK.', maxRetries: 0 });
    assert.equal(result.text, 'OK');
  }
}
assert.equal(requests.length, 4);
assert.equal(requests.filter((url) => url.endsWith('/xai/v1/responses')).length, 2);
assert.equal(requests.filter((url) => url.endsWith('/xai/v1/chat/completions')).length, 2);
console.log(`Packed ESM/CJS native xAI routing and registry passed for ${expectedVersion}.`);
