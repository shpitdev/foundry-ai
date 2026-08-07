import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createProviderRegistry,
  embed,
  generateText,
  Output,
  stepCountIs,
  streamText,
  ToolLoopAgent,
} from 'ai';
import { afterAll, describe, expect, it, type TestContext } from 'vitest';
import { createFoundryAnthropic } from '../providers/anthropic.js';
import { createFoundryGoogle } from '../providers/google.js';
import { createFoundryOpenAI } from '../providers/openai.js';
import {
  assertModelClaimsVision,
  type CapabilityCaseSpec,
  createVisionMessages,
  getEmbeddingProbeModelIds,
  getLiveCapabilityFilters,
  getLiveCapabilityModelMatrix,
  getLiveCapabilityModels,
  getVisionProbeImageBytes,
  getVisionProbeModelIds,
  LiveCapabilityRecorder,
  type LiveProvider,
  shouldIncludeLiveCapabilityCase,
} from './helpers/live-capabilities.js';
import {
  collectStreamSummary,
  createGoogleProxyFetch,
  createMessageHistoryFixture,
  getBaselineMaxTokens,
  getMessagesMaxTokens,
  getProviderOptions,
  getReasoningExpectation,
  getStructuredOutputMaxTokens,
  getStructuredOutputPrompt,
  getStructuredToolsMaxTokens,
  getStructuredToolsPrompt,
  regulatorySignalTool,
  resolveModelIdForRidCheck,
  resolveVisionModelId,
  shouldAssertOpenAIReasoning,
  signalSchema,
  structuredToolSchema,
} from './helpers/live-capability-helpers.js';
import { wrapLiveModelWithDevTools } from './helpers/live-devtools.js';
import { loadLiveFoundryConfig } from './helpers/live-foundry.js';

const config = loadLiveFoundryConfig();
const liveFilters = getLiveCapabilityFilters();
const models = getLiveCapabilityModels();
const modelMatrix = getLiveCapabilityModelMatrix();
const openai = createFoundryOpenAI(config);
const anthropic = createFoundryAnthropic(config);
const google = createFoundryGoogle(config);
const registry = createProviderRegistry({
  anthropic,
  google,
  openai,
});
const recorder = new LiveCapabilityRecorder();
const embeddingModels = getEmbeddingProbeModelIds();
const openAIEmbeddingModels = (
  embeddingModels.openai ?? ['text-embedding-3-small', 'text-embedding-3-large']
).filter((modelId) => shouldIncludeLiveCapabilityCase('openai', modelId));
const visionProbeImageBytes = getVisionProbeImageBytes();
const visionModels = getVisionProbeModelIds();

function skipCapabilityCase(
  ctx: TestContext,
  spec: CapabilityCaseSpec,
  message: string,
  details?: Record<string, unknown>,
) {
  recorder.recordSkippedCase(spec, message, details);
  ctx.skip(message);
}

function shouldIncludeSharedProviderProbe(provider: LiveProvider) {
  return liveFilters.modelId == null && shouldIncludeLiveCapabilityCase(provider);
}

const directGoogle = createGoogleGenerativeAI({
  apiKey: config.token,
  baseURL: `${config.foundryUrl}/api/v2/llm/proxy/google/v1`,
  fetch: createGoogleProxyFetch(config.token),
  headers: config.attributionRid ? { attribution: config.attributionRid } : undefined,
  name: 'foundry-google-embedding-probe',
});

afterAll(async () => {
  await recorder.flush();
});

describe('live Foundry capability matrix', () => {
  for (const provider of ['openai', 'anthropic', 'google'] as const) {
    for (const modelId of modelMatrix[provider]) {
      const expectation = modelId === models[provider] ? 'must-pass' : 'investigate';
      const modelCase = expectation === 'must-pass' ? it : it.concurrent;

      modelCase(`${provider}:${modelId}: basic generateText`, async () => {
        await recorder.runCase(
          {
            capability: 'text.generate',
            expectation,
            modelId,
            provider,
          },
          async (telemetry) => {
            const result = await generateText({
              model: getFoundryModel(provider, modelId),
              prompt: `Reply with exactly "${provider.toUpperCase()}: Foundry capability checks are running."`,
              maxOutputTokens: getBaselineMaxTokens(provider, modelId),
              providerOptions: getProviderOptions(provider, 'baseline', modelId),
              experimental_telemetry: telemetry,
            });

            expect(result.text.toLowerCase()).toContain(provider);

            return {
              finishReason: result.finishReason,
              text: result.text,
              usage: result.usage,
              warnings: result.warnings,
            };
          },
        );
      });

      modelCase(`${provider}:${modelId}: message history generateText`, async () => {
        await recorder.runCase(
          {
            capability: 'messages.generate',
            expectation,
            modelId,
            provider,
          },
          async (telemetry) => {
            const result = await generateText({
              model: getFoundryModel(provider, modelId),
              messages: createMessageHistoryFixture(),
              maxOutputTokens: getMessagesMaxTokens(provider, modelId),
              providerOptions: getProviderOptions(provider, 'baseline', modelId),
              experimental_telemetry: telemetry,
            });

            expect(result.text.toLowerCase()).toContain('tracking');
            expect(result.text.toLowerCase()).toContain('blue signal');

            return {
              finishReason: result.finishReason,
              text: result.text,
              usage: result.usage,
              warnings: result.warnings,
            };
          },
        );
      });

      modelCase(`${provider}:${modelId}: raw RID passthrough`, async () => {
        await recorder.runCase(
          {
            capability: 'rid.passthrough',
            expectation,
            modelId,
            provider,
          },
          async (telemetry) => {
            const ridTarget = resolveModelIdForRidCheck(provider, modelId);
            const result = await generateText({
              model: getFoundryModel(provider, ridTarget),
              prompt: 'Reply with exactly "READY: Foundry RID routing is active."',
              maxOutputTokens: 420,
              providerOptions: getProviderOptions(provider, 'baseline', modelId),
              experimental_telemetry: telemetry,
            });

            expect(result.text).toMatch(/ready/i);

            return {
              finishReason: result.finishReason,
              text: result.text,
              usage: result.usage,
              warnings: result.warnings,
            };
          },
        );
      });

      modelCase(`${provider}:${modelId}: streamText`, async () => {
        await recorder.runCase(
          {
            capability: 'text.stream',
            expectation,
            modelId,
            provider,
          },
          async (telemetry) => {
            const result = streamText({
              model: getFoundryModel(provider, modelId),
              prompt: `Write exactly one short sentence that mentions ${provider} and Foundry proxy routing.`,
              maxOutputTokens: getBaselineMaxTokens(provider, modelId),
              providerOptions: getProviderOptions(provider, 'baseline', modelId),
              experimental_telemetry: telemetry,
            });
            const summary = await collectStreamSummary(result);

            expect(summary.text.toLowerCase()).toContain('foundry');

            return summary;
          },
        );
      });

      modelCase(`${provider}:${modelId}: structured output`, async () => {
        await recorder.runCase(
          {
            capability: 'structured.output.object',
            expectation,
            modelId,
            provider,
          },
          async (telemetry) => {
            const result = await generateText({
              model: getFoundryModel(provider, modelId),
              output: Output.object({
                schema: signalSchema,
                name: 'clinical_signal',
                description: 'A concise clinical signal summary for regulated AI review workflows.',
              }),
              prompt: getStructuredOutputPrompt(),
              maxOutputTokens: getStructuredOutputMaxTokens(provider, modelId),
              providerOptions: getProviderOptions(provider, 'structured', modelId),
              experimental_telemetry: telemetry,
            });

            expect(result.output.indication.length).toBeGreaterThan(4);
            expect(result.output.rationale.length).toBeGreaterThan(20);

            return {
              finishReason: result.finishReason,
              output: result.output,
              text: result.text,
              usage: result.usage,
              warnings: result.warnings,
            };
          },
        );
      });

      modelCase(`${provider}:${modelId}: deterministic tool loop`, async () => {
        await recorder.runCase(
          {
            capability: 'tool.loop.deterministic',
            expectation,
            modelId,
            provider,
          },
          async (telemetry) => {
            const result = streamText({
              model: getFoundryModel(provider, modelId),
              prompt:
                'Call the regulatorySignal tool exactly once with topic "oncology", then answer with SIGNAL and the returned status in one short sentence.',
              maxOutputTokens: 420,
              providerOptions: getProviderOptions(provider, 'tools', modelId),
              stopWhen: stepCountIs(3),
              tools: {
                regulatorySignal: regulatorySignalTool,
              },
              experimental_telemetry: telemetry,
            });
            const summary = await collectStreamSummary(result);

            expect(summary.text).toMatch(/signal/i);
            expect(summary.text).toMatch(/verified/i);
            expect(summary.eventCounts['tool-call']).toBeGreaterThan(0);
            expect(summary.eventCounts['tool-result']).toBeGreaterThan(0);

            return summary;
          },
        );
      });

      modelCase(`${provider}:${modelId}: ToolLoopAgent`, async () => {
        await recorder.runCase(
          {
            capability: 'agent.tool_loop',
            expectation,
            modelId,
            provider,
          },
          async (telemetry) => {
            const agent = new ToolLoopAgent({
              model: getFoundryModel(provider, modelId),
              tools: {
                regulatorySignal: regulatorySignalTool,
              },
              providerOptions: getProviderOptions(provider, 'tools', modelId),
              stopWhen: stepCountIs(3),
              experimental_telemetry: telemetry,
            });
            const result = await agent.generate({
              prompt:
                'Call the regulatorySignal tool exactly once with topic "oncology", then answer with AGENT and the returned status in one short sentence.',
            });

            expect(result.text).toMatch(/agent/i);
            expect(result.text).toMatch(/verified/i);

            return {
              finishReason: result.finishReason,
              steps: result.steps,
              text: result.text,
              usage: result.usage,
              warnings: result.warnings,
            };
          },
        );
      });

      // Keep structured-plus-tools probes serial so the survey reflects tool/output semantics instead of load-sensitive truncation.
      it(`${provider}:${modelId}: structured output plus tools`, async () => {
        await recorder.runCase(
          {
            capability: 'structured.plus.tools',
            expectation,
            modelId,
            provider,
          },
          async (telemetry) => {
            const result = await generateText({
              model: getFoundryModel(provider, modelId),
              output: Output.object({
                schema: structuredToolSchema,
                name: 'signal_summary',
                description: 'A structured regulatory signal summary after tool execution.',
              }),
              prompt: getStructuredToolsPrompt(),
              maxOutputTokens: getStructuredToolsMaxTokens(provider, modelId),
              providerOptions: getProviderOptions(provider, 'structured-tools', modelId),
              stopWhen: stepCountIs(3),
              tools: {
                regulatorySignal: regulatorySignalTool,
              },
              experimental_telemetry: telemetry,
            });

            expect(result.output.status).toMatch(/verified/i);
            expect(result.output.summary.toLowerCase()).toContain('oncology');

            return {
              finishReason: result.finishReason,
              output: result.output,
              steps: result.steps,
              text: result.text,
              usage: result.usage,
              warnings: result.warnings,
            };
          },
        );
      });

      modelCase(`${provider}:${modelId}: vision image input probe`, async () => {
        await recorder.runCase(
          {
            capability: 'vision.image_input',
            expectation,
            modelId: resolveVisionModelId(
              provider,
              modelId,
              models[provider],
              visionModels[provider],
            ),
            provider,
          },
          async (telemetry) => {
            const visionModelId = resolveVisionModelId(
              provider,
              modelId,
              models[provider],
              visionModels[provider],
            );
            const imageBytes = await visionProbeImageBytes;

            assertModelClaimsVision(provider, visionModelId);

            const result = await generateText({
              model: getFoundryModel(provider, visionModelId),
              messages: createVisionMessages(
                'Describe what this image appears to show in one short sentence.',
                imageBytes,
              ),
              maxOutputTokens: 160,
              providerOptions: getProviderOptions(provider, 'baseline', visionModelId),
              experimental_telemetry: telemetry,
            });

            expect(result.text.trim().length).toBeGreaterThan(10);

            return {
              finishReason: result.finishReason,
              text: result.text,
              usage: result.usage,
              warnings: result.warnings,
            };
          },
        );
      });

      // Keep reasoning probes serial so the survey reflects provider behavior instead of load-sensitive stream failures.
      it(`${provider}:${modelId}: reasoning visibility or options`, async (ctx) => {
        const spec: CapabilityCaseSpec = {
          capability: 'reasoning.visibility',
          expectation: getReasoningExpectation(provider, modelId, models[provider]),
          modelId,
          provider,
        };

        if (provider === 'google') {
          skipCapabilityCase(
            ctx,
            spec,
            'Google reasoning visibility is not currently asserted in this matrix.',
            {
              provider,
            },
          );
        }

        if (provider === 'openai' && !shouldAssertOpenAIReasoning(modelId)) {
          skipCapabilityCase(
            ctx,
            spec,
            `OpenAI reasoning visibility is not asserted for ${modelId}.`,
            {
              modelId,
              provider,
            },
          );
        }

        await recorder.runCase(spec, async (telemetry) => {
          const usesAdaptiveAnthropicThinking = provider === 'anthropic' && modelId.endsWith('-5');
          const result = streamText({
            model: getFoundryModel(provider, modelId),
            prompt: usesAdaptiveAnthropicThinking
              ? 'Work through this carefully: find the smallest positive integer n that leaves remainder 1 when divided by 2, 3, 4, 5, and 6, and is divisible by 7. Give the number and a concise justification.'
              : 'Reply with READY and one short clause about reasoning visibility.',
            maxOutputTokens: usesAdaptiveAnthropicThinking ? 1000 : 220,
            providerOptions: getProviderOptions(provider, 'reasoning', modelId),
            experimental_telemetry: telemetry,
          });
          const summary = await collectStreamSummary(result);

          if (provider === 'anthropic') {
            expect(summary.reasoningText.trim().length).toBeGreaterThan(0);
          } else {
            const reasoningEventCount =
              (summary.eventCounts['reasoning-start'] ?? 0) +
              (summary.eventCounts['reasoning-delta'] ?? 0) +
              (summary.eventCounts['reasoning-end'] ?? 0);
            const reasoningTokenCount =
              typeof summary.usage === 'object' &&
              summary.usage !== null &&
              'reasoningTokens' in summary.usage &&
              typeof summary.usage.reasoningTokens === 'number'
                ? summary.usage.reasoningTokens
                : 0;

            expect(
              reasoningEventCount > 0 || reasoningTokenCount > 0 || /reasoning/i.test(summary.text),
            ).toBe(true);
          }

          expect(summary.text).toMatch(usesAdaptiveAnthropicThinking ? /301/ : /ready/i);

          return summary;
        });
      });

      for (const unsupportedCapability of [
        'modality.image_generation',
        'modality.speech',
        'modality.transcription',
        'modality.video',
        'modality.rerank',
      ] as const) {
        modelCase(`${provider}:${modelId}: ${unsupportedCapability}`, async (ctx) => {
          skipCapabilityCase(
            ctx,
            {
              capability: unsupportedCapability,
              expectation: 'investigate',
              modelId,
              provider,
            },
            `${provider}.${unsupportedCapability} is not supported by the package yet.`,
            {
              capability: unsupportedCapability,
              provider,
            },
          );
        });
      }
    }
  }

  if (liveFilters.provider == null && liveFilters.modelId == null) {
    it('registry routing across all configured providers', async () => {
      await recorder.runCase(
        {
          capability: 'registry.routing',
          expectation: 'must-pass',
          modelId: `${models.openai},${models.anthropic},${models.google}`,
          provider: 'openai',
        },
        async (telemetry) => {
          const openAiResult = await generateText({
            model: getRegistryModel('openai', models.openai),
            prompt: 'Reply with exactly "OPENAI: registry routing is active."',
            maxOutputTokens: 420,
            providerOptions: getProviderOptions('openai', 'baseline'),
            experimental_telemetry: telemetry,
          });
          const anthropicResult = await generateText({
            model: getRegistryModel('anthropic', models.anthropic),
            prompt: 'Reply with ANTHROPIC and one short clause.',
            maxOutputTokens: 120,
            experimental_telemetry: telemetry,
          });
          const googleResult = await generateText({
            model: getRegistryModel('google', models.google),
            prompt: 'Reply with GOOGLE and one short clause.',
            maxOutputTokens: 120,
            experimental_telemetry: telemetry,
          });

          expect(openAiResult.text).toMatch(/openai/i);
          expect(anthropicResult.text).toMatch(/anthropic/i);
          expect(googleResult.text).toMatch(/google/i);

          return {
            output: {
              anthropic: anthropicResult.text,
              google: googleResult.text,
              openai: openAiResult.text,
            },
          };
        },
      );
    });
  }

  if (openAIEmbeddingModels.length > 0) {
    it.each(openAIEmbeddingModels)('OpenAI embedding proxy probe: %s', async (embeddingModelId) => {
      const spec: CapabilityCaseSpec = {
        capability: 'embedding.proxy_probe',
        expectation: 'investigate',
        modelId: embeddingModelId,
        provider: 'openai',
      };

      await recorder.runCase(spec, async (telemetry) => {
        const result = await embed({
          model: openai.embeddingModel(embeddingModelId),
          value: 'Foundry capability matrix embedding probe',
          experimental_telemetry: telemetry,
        });

        expect(result.embedding.length).toBeGreaterThan(0);

        return {
          output: {
            dimension: result.embedding.length,
          },
          usage: result.usage,
          warnings: result.warnings,
        };
      });
    });
  }

  if (shouldIncludeSharedProviderProbe('anthropic')) {
    it('Anthropic embedding proxy probe', async (ctx) => {
      skipCapabilityCase(
        ctx,
        {
          capability: 'embedding.proxy_probe',
          expectation: 'investigate',
          modelId: embeddingModels.anthropic?.[0] ?? models.anthropic,
          provider: 'anthropic',
        },
        'Anthropic embeddings are not configured as a supported matrix target yet.',
        {
          provider: 'anthropic',
        },
      );
    });
  }

  if (shouldIncludeSharedProviderProbe('google')) {
    it('Google embedding proxy probe', async (ctx) => {
      const spec: CapabilityCaseSpec = {
        capability: 'embedding.proxy_probe',
        expectation: 'investigate',
        modelId: embeddingModels.google?.[0] ?? models.google,
        provider: 'google',
      };

      if (!embeddingModels.google) {
        skipCapabilityCase(
          ctx,
          spec,
          'Google embedding probe model is not configured for this stack.',
        );
      }

      await recorder.runCase(spec, async (telemetry) => {
        const result = await embed({
          model: directGoogle.embeddingModel(embeddingModels.google?.[0] as string),
          value: 'Foundry capability matrix embedding probe',
          experimental_telemetry: telemetry,
        });

        expect(result.embedding.length).toBeGreaterThan(0);

        return {
          output: {
            dimension: result.embedding.length,
          },
          usage: result.usage,
          warnings: result.warnings,
        };
      });
    });
  }
});

function getFoundryModel(provider: LiveProvider, modelId: string) {
  if (provider === 'openai') {
    return wrapLiveModelWithDevTools({
      model: openai(modelId),
      modelId,
      providerId: 'foundry-openai',
    });
  }

  if (provider === 'anthropic') {
    return wrapLiveModelWithDevTools({
      model: anthropic(modelId),
      modelId,
      providerId: 'foundry-anthropic',
    });
  }

  return wrapLiveModelWithDevTools({
    model: google(modelId),
    modelId,
    providerId: 'foundry-google',
  });
}

function getRegistryModel(provider: LiveProvider, modelId: string) {
  return wrapLiveModelWithDevTools({
    model: registry.languageModel(`${provider}:${modelId}`),
    modelId: `${provider}:${modelId}`,
    providerId: `foundry-${provider}`,
  });
}
