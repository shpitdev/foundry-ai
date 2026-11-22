import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadFoundryConfig, normalizeFoundryUrl, resolveFoundryConfig } from '../config.js';
import { FoundryModelNotFoundError } from '../errors.js';
import type { AnthropicModelId, KnownAnthropicModelId } from '../models/anthropic-models.js';
import {
  getModelMetadata,
  hasKnownModel,
  type KnownModelId,
  MODEL_CATALOG,
  MODEL_CATALOG_BY_RID,
  resolveKnownModelMetadata,
  resolveModelProvider,
  resolveModelRid,
  resolveModelTarget,
} from '../models/catalog.js';
import type { GoogleModelId, KnownGoogleModelId } from '../models/google-models.js';
import type {
  KnownOpenAIEmbeddingModelId,
  KnownOpenAIModelId,
  OpenAIEmbeddingModelId,
  OpenAIModelId,
} from '../models/openai-models.js';
import type { ModelMetadata } from '../types.js';

const enrollments = JSON.parse(
  readFileSync(new URL('./fixtures/foundry-model-catalog.json', import.meta.url), 'utf8'),
) as Array<{
  rid: string;
  modelIdentifier: string;
  displayName: string;
  lifecycle: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  trainingCutoffDate?: string;
  performance: { cost?: string; modelClass?: string; speed?: string };
  externalUrl?: string;
}>;

// Embedding enrollments are matched by identifier; every other model by RID.
function findEnrollment(model: ModelMetadata) {
  return model.inputTypes.includes('OPEN_AI_EMBEDDINGS')
    ? enrollments.find((entry) => entry.modelIdentifier === model.modelIdentifier)
    : enrollments.find((entry) => entry.rid === model.rid);
}

describe('model catalog', () => {
  it('only catalogs models present and active in the retained Foundry CLI listing', () => {
    for (const [id, model] of Object.entries(MODEL_CATALOG)) {
      const enrollment = findEnrollment(model);
      expect(enrollment, `${id} must exist in foundry-cli models list`).toBeDefined();
      expect(['ga', 'experimental'], `${id} must not be deprecated`).toContain(
        enrollment?.lifecycle,
      );
      expect(model.modelIdentifier, `${id} modelIdentifier must match Foundry`).toBe(
        enrollment?.modelIdentifier,
      );
      expect(model.lifecycle, `${id} lifecycle must match Foundry`).toBe(enrollment?.lifecycle);
      // Catch metadata drift, not just enrollment and lifecycle drift.
      expect(model.displayName, `${id} displayName must match Foundry`).toBe(
        enrollment?.displayName,
      );
      expect(model.contextWindow, `${id} contextWindow must match Foundry`).toBe(
        enrollment?.contextWindow,
      );
      expect(model.maxOutputTokens, `${id} maxOutputTokens must match Foundry`).toBe(
        enrollment?.maxOutputTokens,
      );
      expect(model.trainingCutoffDate, `${id} trainingCutoffDate must match Foundry`).toBe(
        enrollment?.trainingCutoffDate,
      );
      expect(model.performance, `${id} performance must match Foundry`).toEqual(
        enrollment?.performance,
      );
      expect(model.externalUrl, `${id} externalUrl must match Foundry`).toBe(
        enrollment?.externalUrl,
      );
    }
  });

  it.each([
    'gemma-4-31b',
    'gemma-4-26b-a4b',
    'llama-3-3-nemotron-super-49b-v1-5',
    'llama-3-2-nv-embedqa-1b-v2',
    'schematic-7B',
    'snowflake-arctic-embed-medium',
  ])('leaves listed but unsupported model %s uncataloged', (modelId) => {
    const rid = `ri.language-model-service..language-model.${modelId}`;
    expect(enrollments.some((entry) => entry.rid === rid)).toBe(true);
    expect(getModelMetadata(modelId)).toBeUndefined();
    expect(resolveModelTarget(rid)).toEqual({ rid, metadata: undefined });
  });

  it('resolves metadata for known OpenAI models', () => {
    expect(resolveModelRid('gpt-5-mini')).toBe(
      'ri.language-model-service..language-model.gpt-5-mini',
    );
    expect(resolveModelRid('gpt-5.4-mini')).toBe(
      'ri.language-model-service..language-model.gpt-5-4-mini',
    );
    expect(resolveModelRid('gpt-5.5')).toBe('ri.language-model-service..language-model.gpt-5-5');
    expect(resolveModelRid('gpt-5.6-sol')).toBe(
      'ri.language-model-service..language-model.gpt-5-6-sol',
    );
    expect(resolveModelRid('gpt-5.6-terra')).toBe(
      'ri.language-model-service..language-model.gpt-5-6-terra',
    );
    expect(resolveModelRid('gpt-5.6-luna')).toBe(
      'ri.language-model-service..language-model.gpt-5-6-luna',
    );
    expect(resolveModelProvider('gpt-5-mini')).toBe('openai');
    expect(getModelMetadata('gpt-5-mini')).toMatchObject({
      displayName: 'GPT-5 mini',
      lifecycle: 'ga',
      modelIdentifier: 'GPT_5_MINI',
      provider: 'openai',
      supportsResponses: true,
      supportsVision: true,
      trainingCutoffDate: '2024-05-30T00:00:00Z',
      inputTypes: expect.arrayContaining(['OPEN_AI_REASONING', 'OPEN_AI_RESPONSES']),
      performance: {
        cost: 'LOW',
        modelClass: 'LIGHTWEIGHT',
        speed: 'MEDIUM',
      },
    });
    expect(getModelMetadata('gpt-5-codex')).toMatchObject({
      displayName: 'GPT-5 Codex',
      provider: 'openai',
      supportsResponses: true,
      supportsVision: true,
    });
    expect(getModelMetadata('gpt-5.3-codex')).toMatchObject({
      displayName: 'GPT-5.3 Codex',
      modelIdentifier: 'GPT_5_3_CODEX',
      provider: 'openai',
      inputTypes: [
        'GENERIC_COMPLETION',
        'GENERIC_CHAT_COMPLETION',
        'GENERIC_VISION_COMPLETION',
        'OPEN_AI_RESPONSES',
      ],
      supportsResponses: true,
      supportsVision: true,
    });
    expect(getModelMetadata('gpt-5.6-sol')).toMatchObject({
      displayName: 'GPT-5.6 Sol',
      lifecycle: 'ga',
      modelIdentifier: 'GPT_5_6_SOL',
      provider: 'openai',
      trainingCutoffDate: '2026-02-16T00:00:00Z',
      inputTypes: expect.arrayContaining(['OPEN_AI_REASONING', 'OPEN_AI_RESPONSES']),
      performance: {
        cost: 'MEDIUM',
        modelClass: 'HEAVYWEIGHT',
        speed: 'MEDIUM',
      },
      supportsResponses: true,
      supportsVision: true,
    });
    expect(resolveModelRid('gpt-6-astra')).toBe(
      'ri.language-model-service..language-model.gpt-6-astra',
    );
    expect(getModelMetadata('gpt-6-astra')).toMatchObject({
      displayName: 'GPT-6 Astra',
      lifecycle: 'ga',
      modelIdentifier: 'GPT_6_ASTRA',
      provider: 'openai',
      trainingCutoffDate: '2026-04-30T00:00:00Z',
      inputTypes: expect.arrayContaining([
        'GPT_CHAT_COMPLETION',
        'OPEN_AI_REASONING',
        'OPEN_AI_RESPONSES',
      ]),
      performance: {
        cost: 'HIGH',
        modelClass: 'HEAVYWEIGHT',
        speed: 'MEDIUM',
      },
      supportsResponses: true,
      supportsVision: true,
    });
    expect(getModelMetadata('gpt-6-luna')).toMatchObject({
      displayName: 'GPT-6 Luna',
      lifecycle: 'ga',
      modelIdentifier: 'GPT_6_LUNA',
      trainingCutoffDate: '2026-05-18T00:00:00Z',
      performance: { cost: 'LOW', modelClass: 'HEAVYWEIGHT', speed: 'MEDIUM' },
    });
    expect(getModelMetadata('gpt-6-sol')).toMatchObject({
      displayName: 'GPT-6 Sol',
      lifecycle: 'ga',
      modelIdentifier: 'GPT_6_SOL',
      trainingCutoffDate: '2026-04-20T00:00:00Z',
    });
    expect(getModelMetadata('gpt-6.1-sol')?.trainingCutoffDate).toBeUndefined();
  });

  it('resolves metadata for known OpenAI embedding models', () => {
    expect(resolveModelRid('text-embedding-3-small')).toBe('text-embedding-3-small');
    expect(resolveModelRid('text-embedding-3-large')).toBe('text-embedding-3-large');
    // Embedding aliases route by bare API name, not by the Foundry language-model RID.
    expect(resolveModelRid('text-embedding-ada-002')).toBe('text-embedding-ada-002');
    expect(getModelMetadata('text-embedding-3-small')).toMatchObject({
      provider: 'openai',
      inputTypes: ['OPEN_AI_EMBEDDINGS'],
      supportsResponses: false,
      supportsVision: false,
    });
    expect(getModelMetadata('text-embedding-ada-002')).toMatchObject({
      displayName: 'text-embedding-ada-002',
      lifecycle: 'ga',
      modelIdentifier: 'OPENAI_TEXT_EMBEDDING_ADA_002',
      provider: 'openai',
      inputTypes: ['OPEN_AI_EMBEDDINGS'],
      performance: { cost: 'LOW', modelClass: 'SPECIALIZED_EMBEDDING', speed: 'HIGH' },
      supportsResponses: false,
      supportsVision: false,
    });
  });

  it('resolves metadata for known Anthropic models', () => {
    expect(resolveModelRid('claude-sonnet-4.6')).toBe(
      'ri.language-model-service..language-model.anthropic-claude-4-6-sonnet',
    );
    expect(resolveModelProvider('claude-sonnet-4.6')).toBe('anthropic');
    expect(resolveModelRid('claude-sonnet-5')).toBe(
      'ri.language-model-service..language-model.anthropic-claude-5-sonnet',
    );
    expect(resolveModelRid('claude-opus-4.7')).toBe(
      'ri.language-model-service..language-model.anthropic-claude-4-7-opus',
    );
    expect(resolveModelRid('claude-opus-5')).toBe(
      'ri.language-model-service..language-model.anthropic-claude-5-opus',
    );
    expect(getModelMetadata('claude-opus-4.8')).toMatchObject({
      displayName: 'Claude Opus 4.8',
      modelIdentifier: 'ANTHROPIC_CLAUDE_48_OPUS',
      provider: 'anthropic',
      inputTypes: expect.arrayContaining(['CLAUDE_CHAT', 'GENERIC_VISION_COMPLETION']),
      supportsResponses: false,
      supportsVision: true,
    });
    expect(getModelMetadata('claude-sonnet-5')).toMatchObject({
      displayName: 'Claude Sonnet 5',
      lifecycle: 'ga',
      modelIdentifier: 'ANTHROPIC_CLAUDE_5_SONNET',
      provider: 'anthropic',
      trainingCutoffDate: '2026-01-01T00:00:00Z',
      performance: {
        cost: 'MEDIUM',
        modelClass: 'HEAVYWEIGHT',
        speed: 'MEDIUM',
      },
      supportsResponses: false,
      supportsVision: true,
    });
    expect(getModelMetadata('claude-opus-5')).toMatchObject({
      displayName: 'Claude Opus 5',
      lifecycle: 'ga',
      modelIdentifier: 'ANTHROPIC_CLAUDE_5_OPUS',
      provider: 'anthropic',
      trainingCutoffDate: '2026-05-01T00:00:00Z',
      performance: {
        cost: 'HIGH',
        modelClass: 'HEAVYWEIGHT',
        speed: 'MEDIUM',
      },
      supportsResponses: false,
      supportsVision: true,
    });
    expect(resolveModelRid('claude-opus-5.5')).toBe(
      'ri.language-model-service..language-model.anthropic-claude-5-5-opus',
    );
    expect(getModelMetadata('claude-opus-5.5')).toMatchObject({
      displayName: 'Claude Opus 5.5',
      lifecycle: 'ga',
      modelIdentifier: 'ANTHROPIC_CLAUDE_55_OPUS',
      provider: 'anthropic',
      trainingCutoffDate: '2026-06-01T00:00:00Z',
      inputTypes: expect.arrayContaining(['CLAUDE_CHAT', 'GENERIC_VISION_COMPLETION']),
      performance: {
        cost: 'HIGH',
        modelClass: 'HEAVYWEIGHT',
        speed: 'MEDIUM',
      },
      supportsResponses: false,
      supportsVision: true,
    });
  });

  it('resolves metadata for known Google models', () => {
    expect(resolveModelRid('gemini-3.1-flash-lite')).toBe(
      'ri.language-model-service..language-model.gemini-3-1-flash-lite',
    );
    expect(resolveModelProvider('gemini-3.1-flash-lite')).toBe('google');
    expect(getModelMetadata('gemini-3.1-flash-lite')).toMatchObject({
      displayName: 'Gemini 3.1 Flash Lite',
      lifecycle: 'ga',
      modelIdentifier: 'GEMINI_3_1_FLASH_LITE',
      provider: 'google',
      inputTypes: expect.arrayContaining(['GEMINI_CHAT', 'GENERIC_VISION_COMPLETION']),
      performance: {
        cost: 'LOW',
        modelClass: 'LIGHTWEIGHT',
        speed: 'HIGH',
      },
      supportsResponses: false,
      supportsVision: true,
    });
    expect(resolveModelRid('gemini-3.5-flash')).toBe(
      'ri.language-model-service..language-model.gemini-3-5-flash',
    );
    expect(resolveModelProvider('gemini-3.5-flash')).toBe('google');
    expect(getModelMetadata('gemini-3.5-flash')).toMatchObject({
      displayName: 'Gemini 3.5 Flash',
      modelIdentifier: 'GEMINI_3_5_FLASH',
      provider: 'google',
      inputTypes: expect.arrayContaining(['GEMINI_CHAT', 'GENERIC_VISION_COMPLETION']),
      performance: {
        cost: 'MEDIUM',
        modelClass: 'REASONING',
        speed: 'HIGH',
      },
      supportsResponses: false,
      supportsVision: true,
    });
    expect(resolveModelRid('gemini-3.5-flash-lite')).toBe(
      'ri.language-model-service..language-model.gemini-3-5-flash-lite',
    );
    expect(getModelMetadata('gemini-3.5-flash-lite')).toMatchObject({
      lifecycle: 'ga',
      trainingCutoffDate: '2026-01-01T00:00:00Z',
      performance: {
        cost: 'LOW',
        modelClass: 'LIGHTWEIGHT',
        speed: 'HIGH',
      },
    });
    expect(getModelMetadata('gemini-3.8-flash')).toMatchObject({
      displayName: 'Gemini 3.8 Flash',
      modelIdentifier: 'GEMINI_3_8_FLASH',
      provider: 'google',
      lifecycle: 'ga',
    });
  });

  it.each([
    ['gpt-6.1-sol', 'gpt-6-1-sol', 'openai', 'GPT_CHAT_COMPLETION'],
    ['gpt-6.1-terra', 'gpt-6-1-terra', 'openai', 'GPT_CHAT_COMPLETION'],
    ['gpt-6.2-sol', 'gpt-6-2-sol', 'openai', 'GPT_CHAT_COMPLETION'],
    ['gpt-6.2-astra', 'gpt-6-2-astra', 'openai', 'GPT_CHAT_COMPLETION'],
    ['claude-haiku-5.5', 'anthropic-claude-5-5-haiku', 'anthropic', 'CLAUDE_CHAT'],
    ['claude-sonnet-5.5', 'anthropic-claude-5-5-sonnet', 'anthropic', 'CLAUDE_CHAT'],
    ['gemini-4-argon', 'gemini-4-argon', 'google', 'GEMINI_CHAT'],
    ['gemini-4-carbon', 'gemini-4-carbon', 'google', 'GEMINI_CHAT'],
    ['gemini-4-hydrogen', 'gemini-4-hydrogen', 'google', 'GEMINI_CHAT'],
    ['gemini-4-neon', 'gemini-4-neon', 'google', 'GEMINI_CHAT'],
  ])('resolves %s through its provider route', (alias, modelRid, provider, inputType) => {
    const rid = `ri.language-model-service..language-model.${modelRid}`;
    expect(resolveModelRid(alias)).toBe(rid);
    expect(resolveModelTarget(rid).metadata).toMatchObject({
      provider,
      inputTypes: expect.arrayContaining([inputType]),
      supportsVision: true,
      supportsResponses: provider === 'openai',
    });
  });

  it('exports a reverse RID lookup for known models', () => {
    expect(
      MODEL_CATALOG_BY_RID['ri.language-model-service..language-model.gpt-5-mini'],
    ).toMatchObject({
      displayName: 'GPT-5 mini',
      provider: 'openai',
    });
    expect(
      MODEL_CATALOG_BY_RID['ri.language-model-service..language-model.gemini-3-1-flash-lite'],
    ).toMatchObject({
      displayName: 'Gemini 3.1 Flash Lite',
      provider: 'google',
    });
  });

  it('preserves raw RID passthrough while enriching known RIDs with metadata', () => {
    const rawRid = 'ri.language-model-service..language-model.gpt-5-2';

    expect(resolveModelTarget(rawRid)).toMatchObject({
      rid: rawRid,
      metadata: {
        rid: rawRid,
        provider: 'openai',
        modelIdentifier: 'GPT_5_2',
        displayName: 'GPT-5.2',
        inputTypes: expect.arrayContaining(['OPEN_AI_REASONING', 'OPEN_AI_RESPONSES']),
        performance: {
          cost: 'MEDIUM',
          modelClass: 'HEAVYWEIGHT',
          speed: 'MEDIUM',
        },
        supportsResponses: true,
        supportsVision: true,
        trainingCutoffDate: '2025-08-31T00:00:00Z',
        lifecycle: 'ga',
      },
    });
  });

  it('passes through unknown raw RIDs without catalog metadata', () => {
    const rawRid = 'ri.language-model-service..language-model.unknown-new-model';

    expect(resolveModelTarget(rawRid)).toEqual({
      rid: rawRid,
      metadata: undefined,
    });
  });

  it('does not publish sunset aliases as known models', () => {
    expect(getModelMetadata('gpt-4o-mini')).toBeUndefined();
    expect(getModelMetadata('gpt-5.1-codex-max')).toBeUndefined();
    expect(getModelMetadata('gpt-5.2-codex')).toBeUndefined();
    expect(getModelMetadata('gemini-3-pro')).toBeUndefined();
  });

  it('throws a clear validation error for unknown aliases', () => {
    expect(() => resolveKnownModelMetadata('gpt-5-mni')).toThrow(FoundryModelNotFoundError);
    expect(() => resolveKnownModelMetadata('gpt-5-mni')).toThrow(
      /Check the catalog for supported aliases/u,
    );
  });

  it('treats raw RIDs as unknown to the validating helpers', () => {
    expect(hasKnownModel('ri.language-model-service..language-model.gpt-5-2')).toBe(false);
    expect(() =>
      resolveKnownModelMetadata('ri.language-model-service..language-model.gpt-5-2'),
    ).toThrow(FoundryModelNotFoundError);
  });
});

describe('config loading', () => {
  it('normalizes the foundry URL and omits empty optional values', () => {
    expect(
      loadFoundryConfig({
        FOUNDRY_URL: 'https://example.palantirfoundry.com///',
        FOUNDRY_TOKEN: 'token',
        FOUNDRY_ATTRIBUTION_RID: '   ',
        FOUNDRY_TRACE_PARENT: '   ',
        FOUNDRY_TRACE_STATE: '   ',
      }),
    ).toEqual({
      foundryUrl: 'https://example.palantirfoundry.com',
      token: 'token',
      attributionRid: undefined,
      traceParent: undefined,
      traceState: undefined,
    });
  });

  it('loads and trims W3C trace-context values', () => {
    expect(
      loadFoundryConfig({
        FOUNDRY_URL: 'https://example.palantirfoundry.com',
        FOUNDRY_TOKEN: 'token',
        FOUNDRY_TRACE_PARENT: ' 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01 ',
        FOUNDRY_TRACE_STATE: ' vendor=value ',
      }),
    ).toEqual({
      foundryUrl: 'https://example.palantirfoundry.com',
      token: 'token',
      attributionRid: undefined,
      traceParent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      traceState: 'vendor=value',
    });
  });

  it('rejects invalid traceParent values from env and direct config', () => {
    expect(() =>
      loadFoundryConfig({
        FOUNDRY_URL: 'https://example.palantirfoundry.com',
        FOUNDRY_TOKEN: 'token',
        FOUNDRY_TRACE_PARENT: 'not-a-trace-parent',
      }),
    ).toThrow(/W3C traceparent format/u);

    expect(() =>
      resolveFoundryConfig(
        {
          foundryUrl: 'https://example.palantirfoundry.com',
          token: 'token',
          traceParent: '00-ABC92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        },
        'test',
      ),
    ).toThrow(/W3C traceparent format/u);
  });
});

describe('type surface', () => {
  it('accepts known aliases and raw RIDs', () => {
    const knownOpenAiAlias: KnownOpenAIModelId = 'gpt-5.4-mini';
    const knownOpenAiEmbeddingAlias: KnownOpenAIEmbeddingModelId = 'text-embedding-3-small';
    const openAiEmbeddingAlias: OpenAIEmbeddingModelId = 'text-embedding-3-large';
    const openAiAlias: OpenAIModelId = 'gpt-5.4-mini';
    const openAiRid: OpenAIModelId = 'ri.language-model-service..language-model.gpt-5-2';
    const knownAnthropicAlias: KnownAnthropicModelId = 'claude-sonnet-4.6';
    const anthropicAlias: AnthropicModelId = 'claude-sonnet-4.6';
    const anthropicRid: AnthropicModelId =
      'ri.language-model-service..language-model.anthropic-claude-4-6-sonnet';
    const knownGoogleAlias: KnownGoogleModelId = 'gemini-3.1-flash-lite';
    const googleAlias: GoogleModelId = 'gemini-3.1-flash-lite';
    const googleRid: GoogleModelId =
      'ri.language-model-service..language-model.gemini-3-1-flash-lite';
    const knownModel: KnownModelId = 'gemini-3.1-flash-lite';

    expect(knownOpenAiAlias).toBe('gpt-5.4-mini');
    expect(knownOpenAiEmbeddingAlias).toBe('text-embedding-3-small');
    expect(openAiEmbeddingAlias).toBe('text-embedding-3-large');
    expect(openAiAlias).toBe('gpt-5.4-mini');
    expect(openAiRid).toBe('ri.language-model-service..language-model.gpt-5-2');
    expect(knownAnthropicAlias).toBe('claude-sonnet-4.6');
    expect(anthropicAlias).toBe('claude-sonnet-4.6');
    expect(anthropicRid).toBe(
      'ri.language-model-service..language-model.anthropic-claude-4-6-sonnet',
    );
    expect(knownGoogleAlias).toBe('gemini-3.1-flash-lite');
    expect(googleAlias).toBe('gemini-3.1-flash-lite');
    expect(googleRid).toBe('ri.language-model-service..language-model.gemini-3-1-flash-lite');
    expect(knownModel).toBe('gemini-3.1-flash-lite');
  });
});

describe('Foundry URL normalization', () => {
  it('strips trailing slashes while preserving long internal slash runs', () => {
    const url = `https://example.test/${'/'.repeat(50_000)}path`;
    expect(normalizeFoundryUrl(`  ${url}///  `)).toBe(url);
    expect(normalizeFoundryUrl('/'.repeat(50_000))).toBe('');
    expect(normalizeFoundryUrl('   ')).toBe('');
  });
});
