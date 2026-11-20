/**
 * Types for what this package keeps under its own provider keys, merged into Effect AI's
 * metadata and option interfaces. `foundry` carries transport errors. Each vendor key carries
 * in-band errors, response part metadata, and the prompt part options read back on replay.
 *
 * Each key is declared once, here: merged interface properties must have one type, and
 * `foundry-openai` is written by several OpenAI modules. `FoundryClient` imports this file, so
 * every public module's declarations carry it. The upstream `openai` and `anthropic` keys are
 * never touched. The keys are typed only under `exactOptionalPropertyTypes`; see
 * `FoundryExactOnly`.
 */
// Type literals, not interfaces: Effect's metadata records need their implicit index signature.
/* oxlint-disable typescript/consistent-type-definitions */
import type * as Schema from 'effect/Schema';

/** The Foundry error envelope of a non-2xx proxy response. */
export type FoundryError = {
  readonly errorName: string | null;
  readonly errorInstanceId: string | null;
  readonly code: string | null;
  readonly type: string | null;
};

/** An OpenAI or xAI error reported inside a successful response or stream. */
export type ResponsesError = { readonly code: string | null; readonly type: string | null };
export type AnthropicError = { readonly type: string | null };
export type GoogleError = { readonly code: number | null; readonly status: string | null };

/** Responses (OpenAI and xAI) and Chat Completions parts. */
export type ResponsesPart = {
  /** Responses item ID, sent back on replay. */
  readonly itemId?: string;
  /** The model's own function-call argument text, replayed as sent. */
  readonly arguments?: string;
  /** Responses reasoning ciphertext, replayed under `store: false`. */
  readonly encryptedContent?: string;
  readonly refusal?: string;
};

export type AnthropicPart = {
  /** Thinking signature, required to replay the block. */
  readonly signature?: string;
  /** Redacted thinking, replayed as is. */
  readonly redactedData?: string;
  /** Tool input as the model sent it, replayed instead of the decoded parameters. */
  readonly input?: Schema.Json;
};

export type GooglePart = {
  /** Gemini rejects a replayed function call without its thought signature. */
  readonly thoughtSignature?: string;
  /** The call ID was made up locally; replay omits it. */
  readonly localId?: boolean;
  /** The synthetic JSON call whose arguments became the answer text. */
  readonly functionCall?: {
    readonly name: string;
    readonly args: Schema.Json;
    readonly id?: string;
  };
};

/** Decisions token usage as Foundry reports it, under `usage`. */
export type FoundryDecisionMetadata = {
  readonly usage: {
    readonly input_tokens?: number | null;
    readonly input_tokens_details?: {
      readonly cached_tokens?: number | null;
      readonly cache_write_tokens?: number | null;
    } | null;
    readonly output_tokens?: number | null;
    readonly output_tokens_details?: { readonly reasoning_tokens?: number | null } | null;
    readonly total_tokens?: number | null;
  };
};

/**
 * `T` when the consumer compiles with `exactOptionalPropertyTypes`, otherwise nothing. Without
 * the flag an optional key also admits `undefined`, which Effect's JSON index signatures reject
 * (TS2411); there the keys stay plain JSON rather than break the consumer's build.
 */
// Empty on purpose: without the flag, the augmentation adds nothing.
// oxlint-disable-next-line typescript/no-generated-empty-object-type
type FoundryExactOnly<T> = { x: undefined } extends { x?: never } ? Record<never, never> : T;

/** Error metadata: transport errors under `foundry`, in-band errors under the vendor key. */
type FoundryErrorKeys = {
  readonly foundry?: FoundryError | null;
  readonly 'foundry-openai'?: ResponsesError | null;
  readonly 'foundry-xai'?: ResponsesError | null;
  readonly 'foundry-anthropic'?: AnthropicError | null;
  readonly 'foundry-google'?: GoogleError | null;
};

/** Response part metadata, and the prompt part options that replay it. */
type FoundryPartKeys = {
  readonly 'foundry-openai'?: ResponsesPart | null;
  readonly 'foundry-xai'?: ResponsesPart | null;
  readonly 'foundry-anthropic'?: AnthropicPart | null;
  readonly 'foundry-google'?: GooglePart | null;
};

declare module 'effect/ai/AiError' {
  export interface RateLimitErrorMetadata extends FoundryExactOnly<FoundryErrorKeys> {}
  export interface QuotaExhaustedErrorMetadata extends FoundryExactOnly<FoundryErrorKeys> {}
  export interface AuthenticationErrorMetadata extends FoundryExactOnly<FoundryErrorKeys> {}
  export interface InvalidRequestErrorMetadata extends FoundryExactOnly<FoundryErrorKeys> {}
  export interface InternalProviderErrorMetadata extends FoundryExactOnly<FoundryErrorKeys> {}
  export interface UnknownErrorMetadata extends FoundryExactOnly<FoundryErrorKeys> {}
}

declare module 'effect/ai/Response' {
  export interface TextPartMetadata extends FoundryExactOnly<FoundryPartKeys> {}
  export interface TextStartPartMetadata extends FoundryExactOnly<FoundryPartKeys> {}
  export interface TextEndPartMetadata extends FoundryExactOnly<FoundryPartKeys> {}
  export interface ReasoningPartMetadata extends FoundryExactOnly<FoundryPartKeys> {}
  export interface ReasoningStartPartMetadata extends FoundryExactOnly<FoundryPartKeys> {}
  export interface ReasoningEndPartMetadata extends FoundryExactOnly<FoundryPartKeys> {}
  export interface ToolCallPartMetadata extends FoundryExactOnly<FoundryPartKeys> {}
}

declare module 'effect/ai/Prompt' {
  export interface TextPartOptions extends FoundryExactOnly<FoundryPartKeys> {}
  export interface ReasoningPartOptions extends FoundryExactOnly<FoundryPartKeys> {}
  export interface ToolCallPartOptions extends FoundryExactOnly<FoundryPartKeys> {}
}

declare module 'effect/ai/DecisionModel' {
  export interface DecideResponseMetadata extends FoundryExactOnly<{
    readonly 'foundry-openai'?: FoundryDecisionMetadata | null;
  }> {}
}
