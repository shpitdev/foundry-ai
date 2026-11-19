import process from 'node:process';
import { stepCountIs, streamText } from 'ai';
import { logError, logValue } from './logger.js';
import { createLanguageModel } from './model.js';
import { createToolSet, prepareToolStep, TOOL_CALLING_PROMPT } from './tools.js';

const { model, modelId, provider } = createLanguageModel();
const tools = createToolSet();
const result = streamText({
  model,
  prompt: TOOL_CALLING_PROMPT,
  prepareStep: prepareToolStep,
  stopWhen: stepCountIs(2),
  toolChoice: 'required',
  tools,
  onFinish({ text, toolCalls, toolResults, finishReason }) {
    logValue({ type: 'finish', finishReason, toolCalls, toolResults });
    logValue({ type: 'final-text', text });
  },
  onError({ error }) {
    logError({ type: 'error', error });
  },
});

console.log(`provider: ${provider}`);
console.log(`model: ${modelId}`);

// Stream text to stdout
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

console.log('\n');
console.log(`steps: ${(await result.steps).length}`);
