import { wrapLanguageModel } from 'ai';

type WrappableLanguageModel = Parameters<typeof wrapLanguageModel>[0]['model'];
export type FoundryLanguageModel = ReturnType<typeof wrapLanguageModel>;
export type FoundryCallOptions = Parameters<FoundryLanguageModel['doGenerate']>[0];

export function wrapFoundryLanguageModel(
  model: WrappableLanguageModel,
  options: {
    modelId: string;
    providerId: string;
    transformParams?: (params: FoundryCallOptions) => FoundryCallOptions;
  },
): FoundryLanguageModel {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: model.specificationVersion,
      transformParams: async ({ params }) => {
        return options.transformParams?.(params) ?? params;
      },
    },
    modelId: options.modelId,
    providerId: options.providerId,
  });
}
