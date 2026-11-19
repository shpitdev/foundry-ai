import { loadFoundryConfig } from '@shpitdev/foundry-ai';
import { createFoundryAnthropic } from '@shpitdev/foundry-ai/anthropic';
import { createFoundryGoogle } from '@shpitdev/foundry-ai/google';
import { createFoundryOpenAI } from '@shpitdev/foundry-ai/openai';
import { createProviderRegistry, generateText } from 'ai';

const config = loadFoundryConfig();
const registry = createProviderRegistry({
  anthropic: createFoundryAnthropic(config),
  google: createFoundryGoogle(config),
  openai: createFoundryOpenAI(config),
});
const prompt = 'In one sentence, what is your model name and who made you?';

const answers = await Promise.all(
  (['openai:gpt-5.6-terra', 'anthropic:claude-sonnet-5', 'google:gemini-4-argon'] as const).map(
    async (modelId) => {
      const result = await generateText({ model: registry.languageModel(modelId), prompt });
      return `${modelId}: ${result.text}`;
    },
  ),
);

console.log(answers.join('\n'));
