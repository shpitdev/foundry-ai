// Adapted from @effect/ai-anthropic (MIT), effect@4.1.4, 82904fe.
/**
 * Wire shapes for `/anthropic/v1/messages`. Requests are plain interfaces; response schemas
 * decode only the fields the adapter reads. Content blocks, deltas and stream events are
 * dispatched on `type`: unknown types are skipped, and a known type with a malformed payload
 * fails.
 */
import * as Schema from 'effect/Schema';

export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ImageBlock {
  readonly type: 'image';
  readonly source:
    | { readonly type: 'base64'; readonly media_type: string; readonly data: string }
    | { readonly type: 'url'; readonly url: string };
}

export type UserBlock =
  | TextBlock
  | ImageBlock
  | {
      readonly type: 'tool_result';
      readonly tool_use_id: string;
      readonly content: string | ReadonlyArray<TextBlock | ImageBlock>;
      readonly is_error: boolean;
    };

export type AssistantBlock =
  | TextBlock
  | { readonly type: 'thinking'; readonly thinking: string; readonly signature: string }
  | { readonly type: 'redacted_thinking'; readonly data: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    };

export type Message =
  | { readonly role: 'user'; readonly content: Array<UserBlock> }
  | { readonly role: 'assistant'; readonly content: Array<AssistantBlock> };

export interface Tool {
  readonly name: string;
  readonly description?: string;
  readonly input_schema: unknown;
  readonly strict?: boolean;
}

export type ToolChoice = (
  | { readonly type: 'auto' | 'any' | 'none' }
  | { readonly type: 'tool'; readonly name: string }
) & { readonly disable_parallel_tool_use?: boolean };

/** Extended thinking, sent as given. Claude 5.5 models accept only `adaptive`. */
export type Thinking =
  | { readonly type: 'adaptive' }
  | { readonly type: 'enabled'; readonly budget_tokens: number }
  | { readonly type: 'disabled' };

export interface Request {
  readonly model: string;
  readonly max_tokens: number;
  readonly messages: ReadonlyArray<Message>;
  readonly system?: ReadonlyArray<TextBlock>;
  readonly tools?: ReadonlyArray<Tool>;
  readonly tool_choice?: ToolChoice;
  readonly thinking?: Thinking;
  readonly output_config?: {
    readonly format: { readonly type: 'json_schema'; readonly schema: unknown };
  };
  readonly stream?: true;
}

const Count = Schema.optional(Schema.NullOr(Schema.Finite));

export const Usage = Schema.Struct({
  input_tokens: Count,
  output_tokens: Count,
  cache_read_input_tokens: Count,
  cache_creation_input_tokens: Count,
});

const Text = Schema.optional(Schema.NullOr(Schema.String));

/** `{ type, message }`, read leniently: either field may be absent or null. */
export const ErrorObject = Schema.Struct({ type: Text, message: Text });

export const ToolUseBlock = Schema.Struct({
  type: Schema.Literal('tool_use'),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown,
});

export const ContentBlock = Schema.Union([
  Schema.Struct({ type: Schema.Literal('text'), text: Schema.String }),
  Schema.Struct({
    type: Schema.Literal('thinking'),
    thinking: Schema.String,
    signature: Schema.optional(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal('redacted_thinking'), data: Schema.String }),
  ToolUseBlock,
]);
export const contentBlockTypes: ReadonlySet<string> = new Set([
  'text',
  'thinking',
  'redacted_thinking',
  'tool_use',
]);

export const Response = Schema.Struct({
  id: Schema.String,
  model: Schema.String,
  content: Schema.Array(Schema.Unknown),
  stop_reason: Text,
  usage: Schema.optional(Schema.NullOr(Usage)),
});

/** A 2xx body: a message, or an error envelope. */
export const Body = Schema.Union([Response, Schema.Struct({ error: ErrorObject })]);

export const Delta = Schema.Union([
  Schema.Struct({ type: Schema.Literal('text_delta'), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal('thinking_delta'), thinking: Schema.String }),
  Schema.Struct({ type: Schema.Literal('signature_delta'), signature: Schema.String }),
  Schema.Struct({ type: Schema.Literal('input_json_delta'), partial_json: Schema.String }),
]);
export const deltaTypes: ReadonlySet<string> = new Set([
  'text_delta',
  'thinking_delta',
  'signature_delta',
  'input_json_delta',
]);

export const Event = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('message_start'),
    message: Schema.Struct({
      id: Schema.String,
      model: Schema.String,
      usage: Schema.optional(Schema.NullOr(Usage)),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal('content_block_start'),
    index: Schema.Finite,
    content_block: Schema.Unknown,
  }),
  Schema.Struct({
    type: Schema.Literal('content_block_delta'),
    index: Schema.Finite,
    delta: Schema.Unknown,
  }),
  Schema.Struct({ type: Schema.Literal('content_block_stop'), index: Schema.Finite }),
  Schema.Struct({
    type: Schema.Literal('message_delta'),
    delta: Schema.Struct({ stop_reason: Text }),
    usage: Schema.optional(Schema.NullOr(Usage)),
  }),
  Schema.Struct({ type: Schema.Literal('message_stop') }),
  Schema.Struct({ type: Schema.Literal('error'), error: ErrorObject }),
]);
export const eventTypes: ReadonlySet<string> = new Set([
  'message_start',
  'content_block_start',
  'content_block_delta',
  'content_block_stop',
  'message_delta',
  'message_stop',
  'error',
]);
