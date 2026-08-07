import { createFoundryAnthropic } from '@nyrra/foundry-ai/anthropic';
import { createFoundryGoogle } from '@nyrra/foundry-ai/google';
import { createFoundryOpenAI } from '@nyrra/foundry-ai/openai';
import { createProviderRegistry, type LanguageModel } from 'ai';

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
const providersAndModels = [
  { provider: openai, model: openai('gpt-5.6-terra') },
  { provider: anthropic, model: anthropic('claude-opus-5') },
  { provider: google, model: google('gemini-3.6-flash') },
];
const acceptsAiSdkModel = (_model: LanguageModel) => undefined;
const registry = createProviderRegistry({ anthropic, google, openai });
acceptsAiSdkModel(registry.languageModel('openai:gpt-5.6-terra'));

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
