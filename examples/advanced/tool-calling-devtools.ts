import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { webSearch } from '@exalabs/ai-sdk';
import type { AnthropicModelId } from '@nyrra/foundry-ai';
import { loadFoundryConfig } from '@nyrra/foundry-ai';
import { createFoundryAnthropic } from '@nyrra/foundry-ai/anthropic';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { requireEnv } from '../base/config.js';
import { logError, logValue } from '../base/logger.js';
import { logDevToolsHint, wrapWithDevTools } from './devtools-instrumentation.js';

requireEnv('EXA_API_KEY');

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>;

const config = loadFoundryConfig();
const provider = 'anthropic';
// Agentic multi-step tool use with unconstrained search requires mid-tier+ models.
// Nano/lite models get stuck in tool-call loops without generating text.
const modelId: AnthropicModelId = 'claude-sonnet-5';
const model = wrapWithDevTools(createFoundryAnthropic(config)(modelId));
const prompt =
  'Research https://www.palantir.com/platforms/foundry/ and the palantir GitHub organization. Use at most two webSearch calls, then call saveCompanyProfile exactly once with a concise structured profile. After the save tool succeeds, return a short final summary with cited sources.';
const system =
  'Use webSearch to gather enough evidence. Do not narrate your plan. After you have enough information, call saveCompanyProfile exactly once, then finish with a short cited summary. Do not stop after a search result without saving the profile.';
const tools = {
  webSearch: webSearch({
    contents: {
      text: { maxCharacters: 1500 },
    },
    numResults: 5,
  }),
  saveCompanyProfile: tool({
    description: 'Save a structured company profile after researching.',
    inputSchema: z.object({
      name: z.string(),
      domain: z.string(),
      oneLiner: z.string().describe('What the company does in one sentence'),
      products: z.array(z.string()).describe('Key products or open-source projects'),
      targetAudience: z.string(),
      githubOrg: z.string().describe('GitHub org handle, or "unknown" if not found'),
    }),
    execute: async (profile) => {
      logValue({ type: 'company-profile', ...profile });
      return { saved: true };
    },
  }),
};
const providerOptions: ProviderOptions = {
  anthropic: {
    thinking: {
      type: 'adaptive',
      display: 'summarized',
    },
    effort: 'high',
    sendReasoning: true,
    disableParallelToolUse: true,
  } satisfies AnthropicLanguageModelOptions,
};

const result = streamText({
  model,
  prompt,
  system,
  stopWhen: stepCountIs(8),
  providerOptions,
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
logDevToolsHint();

// Stream text to stdout
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
