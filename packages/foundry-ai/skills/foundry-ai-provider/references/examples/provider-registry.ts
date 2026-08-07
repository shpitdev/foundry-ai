import { loadFoundryConfig } from '@nyrra/foundry-ai';
import { createFoundryAnthropic } from '@nyrra/foundry-ai/anthropic';
import { createFoundryGoogle } from '@nyrra/foundry-ai/google';
import { createFoundryOpenAI } from '@nyrra/foundry-ai/openai';
import { createProviderRegistry, generateText } from 'ai';

const config = loadFoundryConfig();
const registry = createProviderRegistry({
  anthropic: createFoundryAnthropic(config),
  google: createFoundryGoogle(config),
  openai: createFoundryOpenAI(config),
});
const prompt = 'In one sentence, what is your model name and who made you?';

for (const modelId of [
  'openai:gpt-5.6-terra',
  'anthropic:claude-sonnet-5',
  'google:gemini-3.6-flash',
] as const) {
  const result = await generateText({
    model: registry.languageModel(modelId),
    prompt,
  });

  console.log(`${modelId}: ${result.text}`);
}
