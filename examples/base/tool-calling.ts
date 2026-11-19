import { generateText, stepCountIs } from 'ai';
import { logValue } from './logger.js';
import { createLanguageModel } from './model.js';
import { createToolSet, prepareToolStep, TOOL_CALLING_PROMPT } from './tools.js';

const { model, modelId, provider } = createLanguageModel();
const tools = createToolSet();
const result = await generateText({
  model,
  prompt: TOOL_CALLING_PROMPT,
  prepareStep: prepareToolStep,
  stopWhen: stepCountIs(2),
  toolChoice: 'required',
  tools,
});
const toolCalls = result.steps.flatMap((step) => step.toolCalls);
const toolResults = result.steps.flatMap((step) => step.toolResults);

console.log(`provider: ${provider}`);
console.log(`model: ${modelId}`);
logValue({ type: 'tool-calls', toolCalls });
logValue({ type: 'tool-results', toolResults });
logValue({ type: 'steps', steps: result.steps.length });
logValue({ type: 'final-text', text: result.text });
