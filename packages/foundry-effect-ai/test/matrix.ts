/**
 * Support matrix. It drives both suites: a phase adds its row here and its fixtures under
 * test/fixtures/<module>/<cell>.*, never a new describe block. Every cell is an `it.todo` until its
 * phase lands, then a contract test over the fixtures and, unless contract-only, a live probe.
 * A phase is done when its row has no todos left. See docs/PLAN.md.
 */
export interface Row {
  readonly module: string;
  readonly phase: number;
  /** Models the live suite probes, matching packages/foundry-ai's live defaults. */
  readonly liveModels: ReadonlyArray<string>;
  readonly cells: ReadonlyArray<string>;
}

/**
 * Proven offline only, from fixtures Foundry cannot produce on demand: a recorded `.sse` cut short
 * (must fail with `InvalidResponseError`, never finish as `stop`), an in-band stream error event,
 * and a synthetic decision refusal.
 */
export const contractOnly: ReadonlySet<string> = new Set([
  'stream-truncated',
  'stream-error',
  'refusal',
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
    // contract also covers 429 with `retry-after`, 5xx, a malformed 200 and a bodyless response.
    liveModels: ['gpt-6-luna', 'claude-haiku-4.5', 'gemini-3.1-flash-lite', 'grok-4-6'],
    cells: ['error-mapping'],
  },
  {
    module: 'OpenAiDecisionModel',
    phase: 1,
    liveModels: ['gpt-6-luna'],
    // `wide-choice` asks one question with about 20 choices to check the distribution is complete.
    cells: ['boolean', 'choice', 'wide-choice', 'score', 'json-state', 'image-state', 'refusal'],
  },
  {
    module: 'OpenAiLanguageModel',
    phase: 2,
    liveModels: ['gpt-6-luna'],
    cells: languageCells,
  },
  {
    module: 'XaiLanguageModel',
    phase: 3,
    liveModels: ['grok-4-6'],
    cells: languageCells,
  },
  {
    module: 'AnthropicLanguageModel',
    phase: 4,
    liveModels: ['claude-haiku-4.5'],
    // Claude Opus and Sonnet 5.5 reject forced tool use and need native `output_config.format`.
    cells: [...languageCells, 'json-native-claude-sonnet-5.5'],
  },
  {
    module: 'GoogleLanguageModel',
    phase: 5,
    liveModels: ['gemini-3.1-flash-lite'],
    cells: languageCells,
  },
  {
    module: 'OpenAiChatLanguageModel',
    phase: 7,
    liveModels: ['gpt-6-luna'],
    cells: languageCells,
  },
  {
    module: 'OpenAiEmbeddingModel',
    phase: 6,
    liveModels: ['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'],
    cells: ['embed', 'embed-many'],
  },
];
