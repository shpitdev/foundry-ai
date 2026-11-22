// Compile-time contract for the public modules; checked by the typecheck target, never run.
import type * as AiError from 'effect/ai/AiError';
import type * as DecisionModel from 'effect/ai/DecisionModel';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import type * as AiModel from 'effect/ai/Model';
import type * as Prompt from 'effect/ai/Prompt';
import type * as Response from 'effect/ai/Response';
import type * as Effect from 'effect/Effect';
import type * as HttpClient from 'effect/http/HttpClient';
import type * as Layer from 'effect/Layer';
import type * as Scope from 'effect/Scope';
import type * as Socket from 'effect/socket/Socket';
import * as AnthropicLanguageModel from '../src/AnthropicLanguageModel.ts';
import * as DeepSeekLanguageModel from '../src/DeepSeekLanguageModel.ts';
import type * as FoundryClient from '../src/FoundryClient.ts';
import * as GemmaLanguageModel from '../src/GemmaLanguageModel.ts';
import * as GoogleLanguageModel from '../src/GoogleLanguageModel.ts';
import * as MoonshotLanguageModel from '../src/MoonshotLanguageModel.ts';
import * as NvidiaLanguageModel from '../src/NvidiaLanguageModel.ts';
import * as OpenAiDecisionModel from '../src/OpenAiDecisionModel.ts';
import * as OpenAiLanguageModel from '../src/OpenAiLanguageModel.ts';
import * as OpenAiRealtime from '../src/OpenAiRealtime.ts';
import * as QwenLanguageModel from '../src/QwenLanguageModel.ts';
import * as XaiLanguageModel from '../src/XaiLanguageModel.ts';

type Language<P extends string> = AiModel.Model<
  P,
  LanguageModel.LanguageModel,
  FoundryClient.FoundryClient
>;

export const languageModels: readonly [
  Language<'foundry-openai'>,
  Language<'foundry-anthropic'>,
  Language<'foundry-google'>,
  Language<'foundry-xai'>,
  Language<'foundry-deepseek'>,
  Language<'foundry-nvidia'>,
  Language<'foundry-qwen'>,
  Language<'foundry-moonshot'>,
  Language<'foundry-gemma'>,
] = [
  OpenAiLanguageModel.model('gpt-6-sol'),
  AnthropicLanguageModel.model('claude-sonnet-5.5'),
  GoogleLanguageModel.model('gemini-3.1-pro'),
  XaiLanguageModel.model('grok-4-6'),
  DeepSeekLanguageModel.model('deepseek-v3.2', { reasoning_effort: 'high' }),
  NvidiaLanguageModel.model('nemotron-3-super-120b'),
  QwenLanguageModel.model('qwen3-32b'),
  MoonshotLanguageModel.model('kimi-k3.1-pro-highspeed', { reasoning_effort: 'none' }),
  GemmaLanguageModel.model('gemma-4-31b'),
];

export const decisionModel: AiModel.Model<
  'foundry-openai',
  DecisionModel.DecisionModel,
  FoundryClient.FoundryClient
> = OpenAiDecisionModel.model('gpt-6-luna');

// The client needs only an HttpClient; callers choose FetchHttpClient or a platform client.
export type ClientLayer = Layer.Layer<FoundryClient.FoundryClient, never, HttpClient.HttpClient>;

// Our metadata keys are typed (src/internal/metadata.ts); untyped JSON would not allow these reads.
export const metadataReads = {
  transport: (metadata: AiError.InvalidRequestErrorMetadata): string | null | undefined =>
    metadata.foundry?.errorName,
  fallback: (metadata: AiError.UnknownErrorMetadata): string | null | undefined =>
    metadata.foundry?.errorName ?? metadata['foundry-google']?.status,
  inBand: (metadata: AiError.InternalProviderErrorMetadata): number | null | undefined =>
    metadata['foundry-google']?.code,
  responses: (metadata: Response.ToolCallPartMetadata): string | undefined =>
    metadata['foundry-openai']?.itemId ??
    metadata['foundry-xai']?.arguments ??
    metadata['foundry-gemma']?.itemId,
  chat: (metadata: Response.ToolCallPartMetadata): string | undefined =>
    metadata['foundry-deepseek']?.arguments ?? metadata['foundry-moonshot']?.arguments,
  chatError: (metadata: AiError.InternalProviderErrorMetadata): string | null | undefined =>
    metadata['foundry-qwen']?.code ?? metadata['foundry-nvidia']?.type,
  replay: (options: Prompt.ReasoningPartOptions): string | undefined =>
    options['foundry-anthropic']?.signature ?? options['foundry-google']?.thoughtSignature,
  decisions: (metadata: DecisionModel.DecideResponseMetadata): number | null | undefined =>
    metadata['foundry-openai']?.usage.total_tokens,
};

// A realtime session needs only a WebSocket constructor and a scope; no FoundryClient.
export type RealtimeConnect = (
  options: OpenAiRealtime.Options,
) => Effect.Effect<
  OpenAiRealtime.Session,
  AiError.AiError,
  Socket.WebSocketConstructor | Scope.Scope
>;
export const realtimeConnect: RealtimeConnect = OpenAiRealtime.connect;
