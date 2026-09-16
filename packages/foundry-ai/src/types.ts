export interface FoundryConfig {
  foundryUrl: string;
  token: string;
  attributionRid?: string;
  traceParent?: string;
  traceState?: string;
}

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'third-party';
export type ModelLifecycle = 'ga' | 'experimental';
export type ModelInputType =
  | 'CLAUDE_CHAT'
  | 'GEMINI_CHAT'
  | 'GENERIC_CHAT_COMPLETION'
  | 'GENERIC_COMPLETION'
  | 'GENERIC_VISION_COMPLETION'
  | 'GPT_CHAT_COMPLETION'
  | 'GPT_WITH_VISION_COMPLETION'
  | 'OPEN_AI_REASONING'
  | 'OPEN_AI_RESPONSES'
  | 'OPEN_AI_EMBEDDINGS'
  | 'OPEN_AI_REALTIME'
  | 'X_AI_RESPONSES';
export type ModelCost = 'LOW' | 'MEDIUM' | 'HIGH';
export type ModelClass = 'HEAVYWEIGHT' | 'LIGHTWEIGHT' | 'REASONING';
export type ModelSpeed = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ModelPerformance {
  cost: ModelCost;
  modelClass: ModelClass;
  speed?: ModelSpeed;
}

export interface ModelDefinition {
  rid: string;
  modelIdentifier: string;
  displayName: string;
  lifecycle: ModelLifecycle;
  inputTypes: readonly ModelInputType[];
  trainingCutoffDate?: string;
  performance: ModelPerformance;
  externalUrl?: string;
  modelCreator?: string;
  /** Verified proxy route; enrollment alone does not imply proxy support. */
  transport?: 'openai-chat' | 'openai-responses' | 'xai-responses' | 'unavailable';
}

export interface ModelMetadata extends ModelDefinition {
  provider: ModelProvider;
  supportsVision: boolean;
  supportsResponses: boolean;
}

export interface ResolvedModelTarget {
  rid: string;
  metadata?: ModelMetadata;
}
