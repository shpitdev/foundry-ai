import { resolve } from 'node:path';
import process from 'node:process';
import { loadFoundryConfig } from '../../config.js';
import { type KnownModelId, MODEL_CATALOG } from '../../models/catalog.js';
import {
  type KnownOpenAIDecisionModelId,
  type KnownOpenAIEmbeddingModelId,
  OPENAI_DECISION_MODEL_IDS,
} from '../../models/openai-models.js';
import type { RealtimeModelId } from '../../models/realtime-models.js';

interface LiveModelIds {
  language: KnownModelId;
  embedding: KnownOpenAIEmbeddingModelId;
  realtime: RealtimeModelId;
  decision: KnownOpenAIDecisionModelId;
}
export type LiveKind = keyof LiveModelIds;

const PROVIDERS = [...new Set(Object.values(MODEL_CATALOG).map(({ provider }) => provider))];

const DEFAULT_MODELS: { [K in LiveKind]: ReadonlyArray<LiveModelIds[K]> } = {
  language: ['gpt-6-luna', 'claude-haiku-4.5', 'gemini-3.1-flash-lite', 'grok-4-6'],
  embedding: ['text-embedding-3-small'],
  realtime: ['gpt-realtime-2.1'],
  decision: ['gpt-6-luna'],
};

export function loadLiveFoundryConfig() {
  if ((process.env.FOUNDRY_URL ?? '') === '' || (process.env.FOUNDRY_TOKEN ?? '') === '') {
    try {
      process.loadEnvFile(resolve(process.cwd(), '.env.local'));
    } catch {
      // loadFoundryConfig reports the missing variable.
    }
  }

  return loadFoundryConfig();
}

/**
 * Models of one kind selected by `LIVE_MODELS`: unset for the defaults, otherwise a comma list
 * of `all`, provider names, or catalog model IDs. Unknown tokens throw.
 */
export function liveModels<K extends LiveKind>(kind: K): Array<LiveModelIds[K]> {
  const raw = process.env.LIVE_MODELS?.trim() ?? '';

  if (raw === '') {
    return [...DEFAULT_MODELS[kind]] as Array<LiveModelIds[K]>;
  }

  const tokens = raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const unknown = tokens.filter(
    (token) =>
      token !== 'all' &&
      !PROVIDERS.some((provider) => provider === token) &&
      !Object.hasOwn(MODEL_CATALOG, token),
  );

  if (tokens.length === 0 || unknown.length > 0) {
    throw new Error(
      `Unknown LIVE_MODELS token(s): ${unknown.join(', ') || raw}. Use all, ${PROVIDERS.join(', ')}, or catalog model IDs.`,
    );
  }

  return (Object.keys(MODEL_CATALOG) as Array<KnownModelId>)
    .filter((id) => isKind(id, kind))
    .filter((id) =>
      tokens.some(
        (token) => token === 'all' || token === id || token === MODEL_CATALOG[id].provider,
      ),
    ) as Array<LiveModelIds[K]>;
}

function isKind(id: KnownModelId, kind: LiveKind) {
  const { inputTypes } = MODEL_CATALOG[id];
  const embedding = inputTypes.some((type) => type === 'OPEN_AI_EMBEDDINGS');
  const realtime = inputTypes.some((type) => type === 'OPEN_AI_REALTIME');

  const kinds: Record<LiveKind, boolean> = {
    language: !embedding && !realtime,
    embedding,
    realtime,
    decision: (OPENAI_DECISION_MODEL_IDS as ReadonlyArray<string>).includes(id),
  };
  return kinds[kind];
}

/** Leave room for reasoning and final output without exceeding Nano's listed cap. */
export function liveMaxOutputTokens(modelId: KnownModelId): number {
  return modelId === 'nemotron-3-nano-30b' ? 8000 : 8192;
}

export const expectedSignal = {
  indication: 'relapse prevention',
  mechanismOfAction: 'not specified',
  riskLevel: 'medium',
  rationale: 'liver enzyme monitoring required',
} as const;

/** Status returned by the deterministic test tool. */
export const TOOL_STATUS = 'verified';

/** Answer to the reasoning prompt. */
export const REASONING_ANSWER = '301';

/** 128x128 solid red PNG. Grok rejects images under 512 pixels and misreads 32x32. */
export const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAAxElEQVR42u3RMQ0AAAjAsPk3DTLgaDIFa1M6zAIAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABAADAAgAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAgAAAEAIAAABACAAAAQAAACAEAAAAjAixYgaMOy89oM6gAAAABJRU5ErkJggg==';

export const EMBEDDING_DIMENSIONS: Record<KnownOpenAIEmbeddingModelId, number> = {
  'text-embedding-ada-002': 1536,
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
};

export const prompts = {
  text: (provider: string) =>
    `Reply with exactly "${provider.toUpperCase()}: Foundry capability checks are running."`,
  stream: (provider: string) =>
    `Write exactly one short sentence that mentions ${provider} and Foundry proxy routing.`,
  json: `Return a JSON object by copying these supplied field values exactly, without inventing clinical details: ${JSON.stringify(expectedSignal)}`,
  tools:
    'Call the regulatorySignal tool exactly once with topic "oncology", then answer with AGENT and the returned status in one short sentence.',
  streamTools:
    'Call the regulatorySignal tool exactly once with topic "oncology", then answer with SIGNAL and the returned status in one short sentence.',
  jsonTools:
    'Call the regulatorySignal tool exactly once with topic "oncology". Do not infer the status from the topic. Use the returned tool status value verbatim. Return only a JSON object with "status" equal to that exact tool status and "summary" equal to one short sentence mentioning oncology and that exact status.',
  image: 'Describe what this image appears to show in one short sentence.',
  reasoning:
    'Work through this carefully: find the smallest positive integer n that leaves remainder 1 when divided by 2, 3, 4, 5, and 6, and is divisible by 7. Give the number and a concise justification.',
  reasoningReady: 'Reply with READY and one short clause about reasoning visibility.',
  embedding: 'Foundry capability matrix embedding probe',
};
