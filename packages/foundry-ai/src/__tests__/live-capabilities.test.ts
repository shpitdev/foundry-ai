import { afterEach, describe, expect, it } from 'vitest';
import {
  getEmbeddingProbeModelIds,
  getLiveCapabilityModelMatrix,
} from './helpers/live-capabilities.js';

const originalEnv = {
  FOUNDRY_TOKEN: process.env.FOUNDRY_TOKEN,
  FOUNDRY_URL: process.env.FOUNDRY_URL,
  LIVE_MODEL_FILTER: process.env.LIVE_MODEL_FILTER,
  LIVE_MODEL_SCOPE: process.env.LIVE_MODEL_SCOPE,
  LIVE_PROVIDER_FILTER: process.env.LIVE_PROVIDER_FILTER,
};

describe('live capability model matrix', () => {
  afterEach(() => {
    restoreEnv('FOUNDRY_TOKEN', originalEnv.FOUNDRY_TOKEN);
    restoreEnv('FOUNDRY_URL', originalEnv.FOUNDRY_URL);
    restoreEnv('LIVE_MODEL_FILTER', originalEnv.LIVE_MODEL_FILTER);
    restoreEnv('LIVE_MODEL_SCOPE', originalEnv.LIVE_MODEL_SCOPE);
    restoreEnv('LIVE_PROVIDER_FILTER', originalEnv.LIVE_PROVIDER_FILTER);
  });

  it('defaults to the fast canonical model set', () => {
    process.env.FOUNDRY_URL = 'https://example.palantirfoundry.com';
    process.env.FOUNDRY_TOKEN = 'token-123';

    const matrix = getLiveCapabilityModelMatrix();

    expect(matrix.anthropic).toEqual(['claude-haiku-4.5']);
    expect(matrix.google).toEqual(['gemini-3.1-flash-lite']);
    expect(matrix.openai).toEqual(['gpt-5-nano']);
    expect(matrix['third-party']).toEqual([]);
    expect(matrix.xai).toEqual(['grok-4-6']);
  });

  it('only surveys current public catalog aliases', () => {
    process.env.FOUNDRY_URL = 'https://example.palantirfoundry.com';
    process.env.FOUNDRY_TOKEN = 'token-123';
    process.env.LIVE_MODEL_SCOPE = 'catalog';

    const matrix = getLiveCapabilityModelMatrix();

    expect(matrix.openai).not.toContain('text-embedding-3-small');
    expect(matrix.openai).not.toContain('text-embedding-3-large');
    expect(matrix.openai).not.toContain('text-embedding-ada-002');
    expect(getEmbeddingProbeModelIds().openai).toEqual([
      'text-embedding-ada-002',
      'text-embedding-3-small',
      'text-embedding-3-large',
    ]);
    expect(matrix.openai).toContain('gpt-5.4-mini');
    expect(matrix.openai).toContain('gpt-5.4-nano');
    expect(matrix.openai).toContain('gpt-6-astra');
    expect(matrix.openai).toContain('codex-auto-review');
    expect(matrix.openai).not.toContain('gpt-4o-mini');
    expect(matrix.anthropic).toContain('claude-opus-5.5');
    expect(matrix.anthropic).not.toContain('claude-opus-4.1');
    expect(matrix.google).not.toContain('gemini-3-pro');
    expect(matrix.google).toContain('gemini-3.8-flash');
    expect(matrix['third-party']).toHaveLength(12);
    expect(matrix['third-party']).not.toContain('grok-4-6');
    expect(matrix.xai).toHaveLength(7);
    expect(matrix.xai).toContain('grok-4-6');
    expect(matrix.xai).toContain('grok-4-7');
    expect(matrix['third-party']).toContain('kimi-k3');
    expect(matrix['third-party']).toContain('deepseek-v4-1-flash');
    expect(matrix['third-party']).toContain('llama-3-3-nemotron-super-49b-v1-5');
  });

  it('keeps catalog coverage in descending model order after the preferred model', () => {
    process.env.FOUNDRY_URL = 'https://example.palantirfoundry.com';
    process.env.FOUNDRY_TOKEN = 'token-123';
    process.env.LIVE_MODEL_SCOPE = 'catalog';

    const matrix = getLiveCapabilityModelMatrix();

    expect(matrix.openai[0]).toBe('gpt-5-nano');
    expect(matrix.anthropic[0]).toBe('claude-haiku-4.5');
    expect(matrix.openai.indexOf('gpt-5.4')).toBeLessThan(matrix.openai.indexOf('gpt-4.1'));
    expect(matrix.anthropic.indexOf('claude-opus-4.8')).toBeLessThan(
      matrix.anthropic.indexOf('claude-opus-4.5'),
    );
    expect(matrix.google.indexOf('gemini-3.1-pro')).toBeLessThan(
      matrix.google.indexOf('gemini-3-flash'),
    );
  });

  it('selects the xAI catalog without any third-party models', () => {
    process.env.FOUNDRY_URL = 'https://example.palantirfoundry.com';
    process.env.FOUNDRY_TOKEN = 'token-123';
    process.env.LIVE_MODEL_SCOPE = 'catalog';
    process.env.LIVE_PROVIDER_FILTER = 'xai';
    const matrix = getLiveCapabilityModelMatrix();
    expect(matrix.xai).toHaveLength(7);
    expect(matrix['third-party']).toEqual([]);
    expect(matrix.openai).toEqual([]);
  });

  it('filters the matrix to a selected provider and model', () => {
    process.env.FOUNDRY_URL = 'https://example.palantirfoundry.com';
    process.env.FOUNDRY_TOKEN = 'token-123';
    process.env.LIVE_MODEL_SCOPE = 'catalog';
    process.env.LIVE_PROVIDER_FILTER = 'openai';
    process.env.LIVE_MODEL_FILTER = 'gpt-4.1-mini';

    const matrix = getLiveCapabilityModelMatrix();

    expect(matrix.openai).toEqual(['gpt-4.1-mini']);
    expect(matrix.anthropic).toEqual([]);
    expect(matrix.google).toEqual([]);
  });
});

function restoreEnv(
  key:
    | 'FOUNDRY_TOKEN'
    | 'FOUNDRY_URL'
    | 'LIVE_MODEL_FILTER'
    | 'LIVE_MODEL_SCOPE'
    | 'LIVE_PROVIDER_FILTER',
  value: string | undefined,
) {
  if (value == null) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
