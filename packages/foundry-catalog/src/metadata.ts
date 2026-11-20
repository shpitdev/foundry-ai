import type { ModelDefinition, ModelInputType, ModelMetadata, ModelProvider } from './types.js';

const VISION_INPUT_TYPES = new Set<ModelInputType>([
  'GENERIC_VISION_COMPLETION',
  'GPT_WITH_VISION_COMPLETION',
]);

export function createProviderModelCatalog<const T extends Record<string, ModelDefinition>>(
  provider: ModelProvider,
  definitions: T,
): { readonly [K in keyof T]: ModelMetadata } {
  const catalog = Object.freeze(
    Object.fromEntries(
      Object.entries(definitions).map(([modelId, definition]) => [
        modelId,
        createModelMetadata(provider, definition),
      ]),
    ),
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fromEntries drops key types; the map keeps every key.
  return catalog as { readonly [K in keyof T]: ModelMetadata };
}

/** A catalog's model IDs in definition order. */
export function catalogModelIds<T extends object>(
  catalog: T,
): ReadonlyArray<Extract<keyof T, string>> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys drops key types; catalogs hold only their own model IDs.
  return Object.freeze(Object.keys(catalog) as Array<Extract<keyof T, string>>);
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
