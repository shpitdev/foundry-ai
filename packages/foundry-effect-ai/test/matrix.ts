/**
 * Support matrix: every cell is an `it.todo` until its phase lands, then a contract test over a
 * recorded fixture (test/fixtures/<module>/<capability>.*) and a live probe. A phase is done
 * when its rows have no todos left. See docs/PLAN.md.
 */
export const languageCapabilities = [
  'text',
  'stream',
  'json',
  'tools',
  'stream-tools',
  'json-tools',
  'image',
  'reasoning',
] as const;
export type LanguageCapability = (typeof languageCapabilities)[number];

export interface LanguageRow {
  readonly module: string;
  readonly phase: number;
  /** Default live model, matching packages/foundry-ai's live defaults. */
  readonly liveModel: string;
  readonly capabilities: ReadonlyArray<LanguageCapability>;
}

export const languageRows: ReadonlyArray<LanguageRow> = [
  {
    module: 'OpenAiLanguageModel',
    phase: 2,
    liveModel: 'gpt-6-luna',
    capabilities: languageCapabilities,
  },
  {
    module: 'XaiLanguageModel',
    phase: 3,
    liveModel: 'grok-4-6',
    capabilities: languageCapabilities,
  },
  {
    module: 'AnthropicLanguageModel',
    phase: 4,
    liveModel: 'claude-haiku-4.5',
    capabilities: languageCapabilities,
  },
  {
    module: 'GoogleLanguageModel',
    phase: 5,
    liveModel: 'gemini-3.1-flash-lite',
    capabilities: languageCapabilities,
  },
];

export const decisionCases = [
  'boolean',
  'choice',
  'score',
  'json-state',
  'image-state',
  'refusal',
  'error-mapping',
] as const;

export const decisionRow = {
  module: 'OpenAiDecisionModel',
  phase: 1,
  liveModel: 'gpt-6-luna',
  cases: decisionCases,
} as const;
