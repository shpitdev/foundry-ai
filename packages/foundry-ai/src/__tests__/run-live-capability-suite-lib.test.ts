import { describe, expect, it } from 'vitest';

const helperModuleUrl = new URL(
  '../../../../scripts/run-live-capability-suite-lib.mjs',
  import.meta.url,
).href;

const { parseArgs, parseModelSelection } = (await import(helperModuleUrl)) as {
  parseArgs: (
    args: string[],
    env?: Record<string, string | undefined>,
  ) => {
    extraEnv: Record<string, string>;
    extraVitestArgs: string[];
  };
  parseModelSelection: (value: string) => {
    modelId: string;
    provider?: 'openai' | 'anthropic' | 'google' | 'third-party';
  };
};

describe('run-live-capability-suite args', () => {
  it('rejects removed documentation flags before a live run', () => {
    expect(() => parseArgs(['--update-docs'], {})).toThrow('Live reports now stay local');
    expect(() => parseArgs(['--no-update-docs'], {})).toThrow('Live reports now stay local');
  });
  it('selects the third-party model catalog from the CLI', () => {
    expect(parseArgs(['--model', 'third-party:kimi-k3'], {}).extraEnv).toMatchObject({
      LIVE_PROVIDER_FILTER: 'third-party',
      LIVE_MODEL_FILTER: 'kimi-k3',
      LIVE_MODEL_SCOPE: 'catalog',
    });
  });

  it('promotes model-only runs to catalog scope by default', () => {
    const parsed = parseArgs(['--model', 'gpt-5-mini'], {});

    expect(parsed.extraEnv).toMatchObject({
      LIVE_MODEL_FILTER: 'gpt-5-mini',
      LIVE_MODEL_SCOPE: 'catalog',
    });
  });

  it('keeps explicit canonical scope when a model is selected', () => {
    const parsed = parseArgs(['--canonical', '--model', 'gpt-5-nano'], {});

    expect(parsed.extraEnv).toMatchObject({
      LIVE_MODEL_FILTER: 'gpt-5-nano',
      LIVE_MODEL_SCOPE: 'canonical',
    });
  });

  it('does not override an env-provided scope when a model is selected', () => {
    const parsed = parseArgs(['--model', 'claude-sonnet-4.6'], {
      LIVE_MODEL_SCOPE: 'canonical',
    });

    expect(parsed.extraEnv).toMatchObject({
      LIVE_MODEL_FILTER: 'claude-sonnet-4.6',
    });
    expect(parsed.extraEnv.LIVE_MODEL_SCOPE).toBeUndefined();
  });

  it('parses provider-prefixed model selections', () => {
    expect(parseModelSelection('openai:gpt-5-mini')).toEqual({
      modelId: 'gpt-5-mini',
      provider: 'openai',
    });
  });
});
