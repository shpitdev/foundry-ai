// Compile-time contract for the public modules; checked by the typecheck target, never run.
import type * as DecisionModel from 'effect/ai/DecisionModel';
import type * as LanguageModel from 'effect/ai/LanguageModel';
import type * as AiModel from 'effect/ai/Model';
import type * as HttpClient from 'effect/http/HttpClient';
import type * as Layer from 'effect/Layer';
import * as AnthropicLanguageModel from '../src/AnthropicLanguageModel.ts';
import type * as FoundryClient from '../src/FoundryClient.ts';
import * as GoogleLanguageModel from '../src/GoogleLanguageModel.ts';
import * as OpenAiDecisionModel from '../src/OpenAiDecisionModel.ts';
import * as OpenAiLanguageModel from '../src/OpenAiLanguageModel.ts';
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
] = [
  OpenAiLanguageModel.model('gpt-6-sol'),
  AnthropicLanguageModel.model('claude-sonnet-5.5'),
  GoogleLanguageModel.model('gemini-3.1-pro'),
  XaiLanguageModel.model('grok-4-6'),
];

export const decisionModel: AiModel.Model<
  'foundry-openai',
  DecisionModel.DecisionModel,
  FoundryClient.FoundryClient
> = OpenAiDecisionModel.model('gpt-6-luna');

// The client needs only an HttpClient; callers choose FetchHttpClient or a platform client.
export type ClientLayer = Layer.Layer<FoundryClient.FoundryClient, never, HttpClient.HttpClient>;
