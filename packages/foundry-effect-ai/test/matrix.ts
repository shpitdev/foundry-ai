/**
 * Support matrix. It drives both suites: a phase adds its row here and its fixtures under
 * test/fixtures/<module>/<cell>.*, never a new describe block. Every cell is an `it.todo` until its
 * phase lands, then a contract test over the fixtures and, unless contract-only, a live probe.
 * A phase is done when its row has no todos left. See docs/PLAN.md.
 */
import * as Anthropic from '../src/internal/models/anthropic.ts';
import * as Google from '../src/internal/models/google.ts';
import * as OpenAi from '../src/internal/models/openai.ts';
import * as Realtime from '../src/internal/models/realtime.ts';
import * as Xai from '../src/internal/models/xai.ts';

export interface Row {
  readonly module: string;
  readonly phase: number;
  /** Models the live suite probes by default, matching packages/foundry-ai's live defaults. */
  readonly liveModels: ReadonlyArray<string>;
  /** Catalog models a `LIVE_MODELS` sweep can select for this row. */
  readonly sweep: ReadonlyArray<string>;
  readonly cells: ReadonlyArray<string>;
}

const vendors = {
  openai: [
    ...Object.keys(OpenAi.models),
    ...Object.keys(OpenAi.embeddingModels),
    ...Object.keys(Realtime.models),
  ],
  anthropic: Object.keys(Anthropic.models),
  google: Object.keys(Google.models),
  xai: Object.keys(Xai.models),
};

/** Each catalog model's vendor, the provider name `LIVE_MODELS` accepts for it. */
export const catalog: ReadonlyMap<string, string> = new Map(
  Object.entries(vendors).flatMap(([vendor, ids]) => ids.map((id) => [id, vendor] as const)),
);

const decisionModels = Object.entries(OpenAi.models).flatMap(([id, entry]) =>
  'decisions' in entry ? [id] : [],
);

/**
 * Proven offline only, from fixtures Foundry cannot produce on demand: a recorded `.sse` cut short
 * (must fail with `InvalidResponseError`, never finish as `stop`), an in-band stream error event,
 * a synthetic decision refusal, `transformClient` checks (a retry that recovers from a 503, and
 * a failed response a transform hands back), and realtime sessions: tool calls `handleToolCalls`
 * must not run, socket lifecycle failures, input transcription failures, and malformed frames.
 */
export const contractOnly: ReadonlySet<string> = new Set([
  'stream-truncated',
  'stream-error',
  'refusal',
  'transform-client',
  'tool-policy',
  'socket-lifecycle',
  'input-transcription-failed',
  'malformed-frames',
]);

// `tools` is two requests (tool call, then tool result and answer) with reasoning on, so it
// replays encrypted reasoning, thinking signatures and thought signatures under `store: false`.
const languageCells = [
  'text',
  'stream',
  'json',
  'tools',
  'stream-tools',
  'json-tools',
  'image',
  'reasoning',
  'stream-truncated',
  'stream-error',
];

export const rows: ReadonlyArray<Row> = [
  {
    module: 'FoundryClient',
    phase: 1,
    // One route per vendor. Live records a bad-token 401 and an unknown-model 404 from each; the
    // contract also covers 429 with `retry-after`, 5xx, a malformed 200 and a bodyless response,
    // and `transform-client` checks what a `transformClient` sees and returns.
    liveModels: ['gpt-6-luna', 'claude-haiku-4.5', 'gemini-3.1-flash-lite', 'grok-4-6'],
    sweep: ['gpt-6-luna', 'claude-haiku-4.5', 'gemini-3.1-flash-lite', 'grok-4-6'],
    cells: ['error-mapping', 'transform-client'],
  },
  {
    module: 'OpenAiDecisionModel',
    phase: 1,
    liveModels: ['gpt-6-luna'],
    sweep: decisionModels,
    // `wide-choice` asks one question with about 20 choices to check the distribution is complete.
    cells: ['boolean', 'choice', 'wide-choice', 'score', 'json-state', 'image-state', 'refusal'],
  },
  {
    module: 'OpenAiLanguageModel',
    phase: 2,
    liveModels: ['gpt-6-luna'],
    sweep: Object.keys(OpenAi.models),
    cells: languageCells,
  },
  {
    module: 'XaiLanguageModel',
    phase: 3,
    liveModels: ['grok-4-6'],
    sweep: vendors.xai,
    cells: languageCells,
  },
  {
    module: 'AnthropicLanguageModel',
    phase: 4,
    liveModels: ['claude-haiku-4.5'],
    sweep: vendors.anthropic,
    // Claude Opus and Sonnet 5.5 reject forced tool use and need native `output_config.format`.
    cells: [...languageCells, 'json-native-claude-sonnet-5.5'],
  },
  {
    module: 'GoogleLanguageModel',
    phase: 5,
    liveModels: ['gemini-3.1-flash-lite'],
    sweep: vendors.google,
    cells: languageCells,
  },
  {
    module: 'OpenAiChatLanguageModel',
    phase: 7,
    liveModels: ['gpt-6-luna'],
    sweep: Object.keys(OpenAi.models),
    cells: languageCells,
  },
  {
    module: 'OpenAiEmbeddingModel',
    phase: 6,
    liveModels: ['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'],
    sweep: Object.keys(OpenAi.embeddingModels),
    cells: ['embed', 'embed-many'],
  },
  {
    module: 'OpenAiRealtime',
    phase: 9,
    liveModels: ['gpt-realtime-2.1'],
    sweep: Object.keys(Realtime.models),
    // The AI SDK realtime suite's probes, one session each (`audio-input` opens two: the speech
    // comes from the `audio-output` prompt), plus inline transcription of fixed speech.
    // `error-mapping` adds a refused token and model live,
    // and synthetic closes and error events offline. The last four are contract-only.
    cells: [
      'connect',
      'text',
      'tools',
      'audio-output',
      'audio-input',
      'input-transcription',
      'error-mapping',
      'tool-policy',
      'socket-lifecycle',
      'input-transcription-failed',
      'malformed-frames',
    ],
  },
];
