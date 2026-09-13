import type { ModelDefinition, ModelInputType, ModelMetadata, ModelProvider } from '../types.js';

const VISION_INPUT_TYPES = new Set<ModelInputType>([
  'GENERIC_VISION_COMPLETION',
  'GPT_WITH_VISION_COMPLETION',
]);

export function createProviderModelCatalog<const T extends Record<string, ModelDefinition>>(
  provider: ModelProvider,
  definitions: T,
): { readonly [K in keyof T]: ModelMetadata } {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(definitions).map(([modelId, definition]) => [
        modelId,
        createModelMetadata(provider, definition),
      ]),
    ),
  ) as { readonly [K in keyof T]: ModelMetadata };
}

export function modelSupportsInputType(
  metadata: Pick<ModelMetadata, 'inputTypes'>,
  inputType: ModelInputType,
): boolean {
  return metadata.inputTypes.includes(inputType);
}

function createModelMetadata(provider: ModelProvider, definition: ModelDefinition): ModelMetadata {
  return {
    ...definition,
    provider,
    supportsResponses:
      definition.inputTypes.includes('OPEN_AI_RESPONSES') ||
      definition.inputTypes.includes('X_AI_RESPONSES'),
    supportsVision: definition.inputTypes.some((inputType) => VISION_INPUT_TYPES.has(inputType)),
  };
}
