// Adapted from @effect/ai-openai-compat (MIT), effect@4.1.4, 82904fe.
/**
 * Wire shapes for `/openai/v1/chat/completions`. Requests are plain interfaces, since Foundry
 * rejects fields it does not recognize; response schemas decode only the fields the adapter
 * reads, and Foundry's stream chunks send `null` where OpenAI omits a field.
 */
import * as Schema from 'effect/Schema';

export type ContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } };

export interface ToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export type Message =
  | { readonly role: 'system' | 'developer'; readonly content: string }
  | { readonly role: 'user'; readonly content: string | ReadonlyArray<ContentPart> }
  | {
      readonly role: 'assistant';
      readonly content: string | null;
      readonly tool_calls?: ReadonlyArray<ToolCall>;
    }
  | {
      readonly role: 'tool';
      readonly tool_call_id: string;
      readonly content: string | ReadonlyArray<{ readonly type: 'text'; readonly text: string }>;
    };

export interface FunctionTool {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description?: string;
    readonly parameters: unknown;
    readonly strict: boolean;
  };
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { readonly type: 'function'; readonly function: { readonly name: string } };

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface Request {
  readonly model: string;
  readonly messages: ReadonlyArray<Message>;
  readonly reasoning_effort?: ReasoningEffort;
  readonly tools?: ReadonlyArray<FunctionTool>;
  readonly tool_choice?: ToolChoice;
  readonly response_format?: {
    readonly type: 'json_schema';
    readonly json_schema: {
      readonly name: string;
      readonly schema: unknown;
      readonly strict: true;
    };
  };
  readonly stream?: true;
  readonly stream_options?: { readonly include_usage: true };
}

const Count = Schema.optional(Schema.NullOr(Schema.Finite));
const OptionalString = Schema.optional(Schema.NullOr(Schema.String));

export const Usage = Schema.Struct({
  prompt_tokens: Count,
  prompt_tokens_details: Schema.optional(
    Schema.NullOr(Schema.Struct({ cached_tokens: Count, cache_write_tokens: Count })),
  ),
  completion_tokens: Count,
  completion_tokens_details: Schema.optional(
    Schema.NullOr(Schema.Struct({ reasoning_tokens: Count })),
  ),
});

const Text = Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Finite])));

/** `{ code, type, message }`, read leniently: every field may be absent, null or numeric. */
export const ErrorObject = Schema.Struct({ code: Text, type: Text, message: Text });

/** An error envelope in a 2xx body or stream chunk: nested (`{error:{...}}`) or flat. */
export const ErrorEnvelope = Schema.Union([
  Schema.Struct({ error: ErrorObject }),
  Schema.Struct({ error: Schema.String, code: Text, type: Text }),
]);

export const Completion = Schema.Struct({
  id: Schema.String,
  model: Schema.String,
  created: Schema.Finite,
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({
        content: OptionalString,
        refusal: OptionalString,
        tool_calls: Schema.optional(
          Schema.NullOr(
            Schema.Array(
              Schema.Struct({
                id: Schema.String,
                function: Schema.Struct({ name: Schema.String, arguments: Schema.String }),
              }),
            ),
          ),
        ),
      }),
      finish_reason: OptionalString,
    }),
  ),
  usage: Schema.optional(Schema.NullOr(Usage)),
});

export const Body = Schema.Union([Completion, ErrorEnvelope]);

export const Chunk = Schema.Struct({
  id: Schema.String,
  model: Schema.String,
  created: Schema.Finite,
  choices: Schema.Array(
    Schema.Struct({
      delta: Schema.optional(
        Schema.NullOr(
          Schema.Struct({
            content: OptionalString,
            refusal: OptionalString,
            tool_calls: Schema.optional(
              Schema.NullOr(
                Schema.Array(
                  Schema.Struct({
                    index: Schema.Finite,
                    id: OptionalString,
                    function: Schema.optional(
                      Schema.NullOr(
                        Schema.Struct({ name: OptionalString, arguments: OptionalString }),
                      ),
                    ),
                  }),
                ),
              ),
            ),
          }),
        ),
      ),
      finish_reason: OptionalString,
    }),
  ),
  usage: Schema.optional(Schema.NullOr(Usage)),
});
