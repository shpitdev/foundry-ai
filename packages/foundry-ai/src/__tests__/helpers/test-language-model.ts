import type { wrapLanguageModel } from 'ai';

export type TestLanguageModel = Extract<
  Parameters<typeof wrapLanguageModel>[0]['model'],
  { specificationVersion: 'v3' }
>;
export type TestCallOptions = Parameters<TestLanguageModel['doGenerate']>[0];

interface TestLanguageModelState {
  lastGenerateParams?: TestCallOptions;
  lastStreamParams?: TestCallOptions;
}

export function createTestLanguageModel(options?: { provider?: string; modelId?: string }): {
  model: TestLanguageModel;
  state: TestLanguageModelState;
} {
  const state: TestLanguageModelState = {};

  const model: TestLanguageModel = {
    specificationVersion: 'v3',
    provider: options?.provider ?? 'test-provider',
    modelId: options?.modelId ?? 'test-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate(params) {
      state.lastGenerateParams = params;

      return Promise.resolve({ content: [] } as unknown as Awaited<
        ReturnType<TestLanguageModel['doGenerate']>
      >);
    },
    doStream(params) {
      state.lastStreamParams = params;

      return Promise.resolve({ stream: new ReadableStream() });
    },
  };

  return { model, state };
}
