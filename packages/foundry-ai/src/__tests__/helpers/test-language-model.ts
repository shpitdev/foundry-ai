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
    async doGenerate(params) {
      state.lastGenerateParams = params;

      return {} as Awaited<ReturnType<TestLanguageModel['doGenerate']>>;
    },
    async doStream(params) {
      state.lastStreamParams = params;

      return {} as Awaited<ReturnType<TestLanguageModel['doStream']>>;
    },
  };

  return { model, state };
}
