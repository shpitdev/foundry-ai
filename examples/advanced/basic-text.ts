import { loadFoundryConfig, type OpenAIModelId } from '@shpitdev/foundry-ai';
import { createFoundryOpenAI } from '@shpitdev/foundry-ai/openai';
import { generateText } from 'ai';

const config = loadFoundryConfig();
const provider = 'openai';
const modelId: OpenAIModelId = 'gpt-5.6-terra';
const model = createFoundryOpenAI(config)(modelId);

const result = await generateText({
  model,
  prompt: 'Explain in two sentences what Palantir Foundry is and why enterprises use it.',
});

console.log(`provider: ${provider}`);
console.log(`model: ${modelId}`);
console.log(result.text);
