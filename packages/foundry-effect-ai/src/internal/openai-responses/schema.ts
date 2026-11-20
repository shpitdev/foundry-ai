// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/**
 * Wire shapes for `/openai/v1/responses`. Requests are plain interfaces; response schemas decode
 * only the fields the adapter reads. Output items and stream events are dispatched on `type`:
 * unknown types are skipped, and a known type with a malformed payload fails.
 */
import * as Schema from 'effect/Schema';

export type InputContent =
  | { readonly type: 'input_text'; readonly text: string }
  | { readonly type: 'input_image'; readonly image_url: string };

export type InputItem =
  | {
      readonly role: 'system' | 'developer';
      readonly content: ReadonlyArray<{ readonly type: 'input_text'; readonly text: string }>;
    }
  | { readonly role: 'user'; readonly content: ReadonlyArray<InputContent> }
  | {
      readonly type: 'message';
      readonly role: 'assistant';
      readonly id?: string;
      readonly status: 'completed';
      readonly content: Array<{
        readonly type: 'output_text';
        readonly text: string;
        readonly annotations: ReadonlyArray<never>;
      }>;
    }
  | {
      readonly type: 'reasoning';
      readonly id: string;
      readonly summary: Array<{ readonly type: 'summary_text'; readonly text: string }>;
      encrypted_content?: string;
    }
  | {
      readonly type: 'function_call';
      readonly call_id: string;
      readonly name: string;
      readonly arguments: string;
      readonly id?: string;
    }
  | {
      readonly type: 'function_call_output';
      readonly call_id: string;
      readonly output: string | ReadonlyArray<InputContent>;
    };

export interface FunctionTool {
  readonly type: 'function';
  readonly name: string;
  readonly description?: string;
  readonly parameters: unknown;
  readonly strict: boolean;
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { readonly type: 'function'; readonly name: string };

export interface Request {
  readonly model: string;
  readonly input: ReadonlyArray<InputItem>;
  readonly store: false;
  readonly stream?: true;
  readonly include?: ReadonlyArray<'reasoning.encrypted_content'>;
  readonly reasoning?: Reasoning;
  readonly tools?: ReadonlyArray<FunctionTool>;
  readonly tool_choice?: ToolChoice;
  readonly text?: {
    readonly format: {
      readonly type: 'json_schema';
      readonly name: string;
      readonly description?: string;
      readonly schema: unknown;
      readonly strict: true;
    };
  };
}

/** Request-wide reasoning settings, sent as given. */
export interface Reasoning {
  readonly effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  readonly summary?: 'auto' | 'concise' | 'detailed';
}

const Count = Schema.optional(Schema.NullOr(Schema.Finite));

export const Usage = Schema.Struct({
  input_tokens: Count,
  input_tokens_details: Schema.optional(
    Schema.NullOr(Schema.Struct({ cached_tokens: Count, cache_write_tokens: Count })),
  ),
  output_tokens: Count,
  output_tokens_details: Schema.optional(Schema.NullOr(Schema.Struct({ reasoning_tokens: Count }))),
});

const Text = Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Finite])));

/** `{ code, type, message }`, read leniently: every field may be absent, null or numeric. */
export const ErrorObject = Schema.Struct({ code: Text, type: Text, message: Text });

export const MessageItem = Schema.Struct({
  type: Schema.Literal('message'),
  id: Schema.String,
  phase: Schema.optional(Schema.NullOr(Schema.String)),
  content: Schema.Array(
    Schema.Struct({
      type: Schema.String,
      text: Schema.optional(Schema.String),
      refusal: Schema.optional(Schema.String),
    }),
  ),
});

export const ReasoningItem = Schema.Struct({
  type: Schema.Literal('reasoning'),
  id: Schema.String,
  summary: Schema.Array(Schema.Struct({ text: Schema.String })),
  encrypted_content: Schema.optional(Schema.NullOr(Schema.String)),
});

export const FunctionCallItem = Schema.Struct({
  type: Schema.Literal('function_call'),
  id: Schema.optional(Schema.String),
  call_id: Schema.String,
  name: Schema.String,
  arguments: Schema.String,
  status: Schema.optional(Schema.NullOr(Schema.String)),
});

export const OutputItem = Schema.Union([MessageItem, ReasoningItem, FunctionCallItem]);
export const outputItemTypes: ReadonlySet<string> = new Set([
  'message',
  'reasoning',
  'function_call',
]);

export const Response = Schema.Struct({
  id: Schema.String,
  status: Schema.optional(Schema.NullOr(Schema.String)),
  model: Schema.String,
  created_at: Schema.Finite,
  output: Schema.Array(Schema.Unknown),
  usage: Schema.optional(Schema.NullOr(Usage)),
  incomplete_details: Schema.optional(
    Schema.NullOr(Schema.Struct({ reason: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
  error: Schema.optional(Schema.NullOr(ErrorObject)),
});

/** A 2xx body: a response, or an error envelope in nested (`{error:{...}}`) or flat form. */
export const Body = Schema.Union([
  Response,
  Schema.Struct({ error: ErrorObject }),
  Schema.Struct({ error: Schema.String, code: Text, type: Text }),
]);

export const Event = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('response.created'),
    response: Schema.Struct({ id: Schema.String, model: Schema.String, created_at: Schema.Finite }),
  }),
  Schema.Struct({
    type: Schema.Literals(['response.output_item.added', 'response.output_item.done']),
    output_index: Schema.Finite,
    item: Schema.Unknown,
  }),
  Schema.Struct({
    type: Schema.Literal('response.output_text.delta'),
    item_id: Schema.String,
    content_index: Schema.Finite,
    delta: Schema.String,
  }),
  // Foundry sends `response.reasoning_summary_part.added` without item or summary index, so
  // reasoning blocks open from the deltas.
  Schema.Struct({
    type: Schema.Literal('response.reasoning_summary_text.delta'),
    item_id: Schema.String,
    summary_index: Schema.Finite,
    delta: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('response.function_call_arguments.delta'),
    output_index: Schema.Finite,
    delta: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literals(['response.completed', 'response.incomplete']),
    response: Schema.Struct({
      status: Schema.optional(Schema.NullOr(Schema.String)),
      usage: Schema.optional(Schema.NullOr(Usage)),
      incomplete_details: Schema.optional(
        Schema.NullOr(Schema.Struct({ reason: Schema.optional(Schema.NullOr(Schema.String)) })),
      ),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal('response.failed'),
    response: Schema.Struct({ error: Schema.optional(Schema.NullOr(ErrorObject)) }),
  }),
  // Flat (`code`, `message` beside `type`) or nested under `error`.
  Schema.Struct({
    type: Schema.Literal('error'),
    code: Text,
    message: Text,
    error: Schema.optional(Schema.NullOr(ErrorObject)),
  }),
]);
export const eventTypes: ReadonlySet<string> = new Set([
  'response.created',
  'response.output_item.added',
  'response.output_item.done',
  'response.output_text.delta',
  'response.reasoning_summary_text.delta',
  'response.function_call_arguments.delta',
  'response.completed',
  'response.incomplete',
  'response.failed',
  'error',
]);
