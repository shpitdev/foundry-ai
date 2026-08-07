import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { webSearch } from '@exalabs/ai-sdk';
import type { AnthropicModelId } from '@nyrra/foundry-ai';
import { loadFoundryConfig } from '@nyrra/foundry-ai';
import { createFoundryAnthropic } from '@nyrra/foundry-ai/anthropic';
import { type LanguageModelUsage, stepCountIs, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import { requireEnv } from '../base/config.js';
import { logError, logValue } from '../base/logger.js';
import { logDevToolsHint, wrapWithDevTools } from './devtools-instrumentation.js';

requireEnv('EXA_API_KEY');

type ProviderOptions = NonNullable<
  ConstructorParameters<typeof ToolLoopAgent>[0]['providerOptions']
>;
type ToolSummary = {
  input: unknown;
  outputPreview?: string;
  toolName: string;
};
type UsageSummary = {
  cachedInputTokens: number | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  reasoningTokens: number | undefined;
  totalTokens: number | undefined;
};
type StepSummary = {
  finishReason: string;
  reasoningPreview?: string;
  sourceCount: number;
  stepNumber: number;
  textPreview?: string;
  toolCalls: ToolSummary[];
  toolResults: ToolSummary[];
  usage: UsageSummary;
};
type FinishSummary = {
  finishReason: string;
  reasoningPreview?: string;
  stepCount: number;
  toolCalls: ToolSummary[];
  toolResults: ToolSummary[];
  totalUsage: UsageSummary;
  type: 'finish';
};

const DEFAULT_COMPANIES = [
  'Merck KGaA, Darmstadt, Germany',
  'Eli Lilly',
  'Bristol Myers Squibb',
  'Roivant Sciences',
  'BioNTech',
] as const;
const config = loadFoundryConfig();
const provider = 'anthropic';
// Agentic multi-step tool use with unconstrained search requires mid-tier+ models.
// Nano/lite models get stuck in tool-call loops without generating text.
const modelId: AnthropicModelId = 'claude-sonnet-5';
const model = wrapWithDevTools(createFoundryAnthropic(config)(modelId));
const prompt = `
Research these five companies and build a drug landscape snapshot:
${DEFAULT_COMPANIES.map((company) => `- ${company}`).join('\n')}

For each company, find:
- 1-3 approved or marketed drugs (say "none found" if unclear)
- 1-3 late-stage pipeline assets worth watching
- Whether the sources mention a Palantir data/AI partnership (say "not cited" if not)

Search for as many companies as you can at once. If initial results are thin for any company, do a follow-up search. If you spot something surprising or strategically notable, flag it for review. Keep the final answer tight with one markdown subsection per company.
`.trim();
const tools = {
  webSearch: webSearch({
    contents: {
      text: { maxCharacters: 1200 },
    },
    numResults: 4,
  }),
  flagForReview: tool({
    description:
      'Flag a notable finding that deserves deeper analysis — unexpected partnerships, regulatory signals, or strategic pivots.',
    inputSchema: z.object({
      company: z.string(),
      finding: z.string(),
      reason: z.string().describe('Why this is worth flagging'),
    }),
    execute: async (flag) => {
      logValue({ type: 'flagged', ...flag });
      return { acknowledged: true };
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
  } satisfies AnthropicLanguageModelOptions,
};
const stepSummaries: StepSummary[] = [];
let finishSummary: FinishSummary | undefined;

const agent = new ToolLoopAgent({
  model,
  instructions:
    'Search broadly, batch company lookups when useful, and keep working until you can deliver a tight markdown snapshot with one subsection per company. Use flagForReview sparingly, and stop searching once you have enough evidence to write the final snapshot.',
  stopWhen: stepCountIs(8),
  providerOptions,
  tools,
  prepareStep({ stepNumber }) {
    // Leave the final steps for synthesis instead of spending the full loop budget on follow-up searches.
    if (stepNumber >= 6) {
      return { activeTools: [] };
    }

    return undefined;
  },
  onStepFinish(step) {
    stepSummaries.push({
      finishReason: step.finishReason,
      reasoningPreview: compactText(step.reasoningText),
      sourceCount: step.sources.length,
      stepNumber: step.stepNumber,
      textPreview: compactText(step.text),
      toolCalls: step.toolCalls.map((toolCall) => summarizeTool(toolCall.toolName, toolCall.input)),
      toolResults: step.toolResults.map((toolResult) =>
        summarizeTool(toolResult.toolName, toolResult.input, toolResult.output),
      ),
      usage: summarizeUsage(step.usage),
    });
  },
  onFinish(event) {
    const allToolCalls = event.steps.flatMap((step) =>
      step.toolCalls.map((toolCall) => summarizeTool(toolCall.toolName, toolCall.input)),
    );
    const allToolResults = event.steps.flatMap((step) =>
      step.toolResults.map((toolResult) =>
        summarizeTool(toolResult.toolName, toolResult.input, toolResult.output),
      ),
    );

    finishSummary = {
      finishReason: event.finishReason,
      reasoningPreview: compactText(
        getLastNonEmptyValue(event.steps.map((step) => step.reasoningText)),
      ),
      stepCount: event.steps.length,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      totalUsage: summarizeUsage(event.totalUsage),
      type: 'finish',
    };
  },
});

console.log(`provider: ${provider}`);
console.log(`model: ${modelId}`);
console.log(`companies: ${DEFAULT_COMPANIES.join(', ')}`);
logDevToolsHint();

try {
  const result = await agent.stream({ prompt });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  process.stdout.write('\n\n');
  logValue({ type: 'step-summaries', steps: stepSummaries });
  logValue(
    finishSummary ?? {
      finishReason: await result.finishReason,
      reasoningPreview: getLastNonEmptyValue(stepSummaries.map((step) => step.reasoningPreview)),
      stepCount: stepSummaries.length,
      toolCalls: stepSummaries.flatMap((step) => step.toolCalls),
      toolResults: stepSummaries.flatMap((step) => step.toolResults),
      totalUsage: summarizeUsage(await result.usage),
      type: 'finish',
    },
  );
} catch (error) {
  logError({ type: 'error', error });
  process.exitCode = 1;
}

function compactText(text: string | undefined, maxLength = 280) {
  const normalized = text?.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function getLastNonEmptyValue(values: Array<string | undefined>) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function summarizeTool(toolName: string, input: unknown, output?: unknown): ToolSummary {
  return {
    input,
    outputPreview: output == null ? undefined : previewValue(output),
    toolName,
  };
}

function summarizeUsage(usage: LanguageModelUsage): UsageSummary {
  return {
    cachedInputTokens: usage.inputTokenDetails.cacheReadTokens ?? usage.cachedInputTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? usage.reasoningTokens,
    totalTokens: usage.totalTokens,
  };
}

function previewValue(value: unknown, maxLength = 240) {
  const serialized = JSON.stringify(value);

  if (serialized == null) {
    return undefined;
  }

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength - 1)}…`;
}
