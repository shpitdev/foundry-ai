/**
 * OpenAI's GA realtime events, as Foundry's WebSocket route speaks them. Client events are plain
 * interfaces under their wire names; server events are lenient codecs that decode only the fields
 * callers read. Event types outside `eventTypes` are skipped, and `response.done` keeps only the
 * output items in `outputItemTypes`.
 */
import * as Schema from 'effect/Schema';

/** `audio/pcm` is 16-bit mono PCM at 24 kHz; `audio/pcmu` and `audio/pcma` are 8 kHz G.711. */
export interface AudioFormat {
  readonly type: 'audio/pcm' | 'audio/pcmu' | 'audio/pcma';
  readonly rate?: 24_000 | undefined;
}

/** Voice activity detection: the server commits the buffer and starts a response by itself. */
export interface TurnDetection {
  readonly type: 'server_vad' | 'semantic_vad';
  readonly threshold?: number | undefined;
  readonly prefix_padding_ms?: number | undefined;
  readonly silence_duration_ms?: number | undefined;
  readonly create_response?: boolean | undefined;
  readonly interrupt_response?: boolean | undefined;
  readonly eagerness?: 'low' | 'medium' | 'high' | 'auto' | undefined;
}

export interface FunctionTool {
  readonly type: 'function';
  readonly name: string;
  readonly description?: string | undefined;
  /** JSON Schema for the arguments. */
  readonly parameters: unknown;
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { readonly type: 'function'; readonly name: string };

export type Modality = 'text' | 'audio';

export interface SessionConfig {
  readonly type: 'realtime';
  readonly model?: string | undefined;
  readonly instructions?: string | undefined;
  /** One of `['text']` or `['audio']`; audio responses also stream a transcript. */
  readonly output_modalities?: ReadonlyArray<Modality> | undefined;
  readonly audio?:
    | {
        readonly input?:
          | {
              readonly format?: AudioFormat | undefined;
              /** Transcribes user audio in this session. Set `null` to disable it. */
              readonly transcription?:
                | {
                    readonly model: string;
                    readonly language?: string | undefined;
                    readonly prompt?: string | undefined;
                  }
                | null
                | undefined;
              /** `null` turns detection off: commit the buffer and create responses yourself. */
              readonly turn_detection?: TurnDetection | null | undefined;
            }
          | undefined;
        readonly output?:
          | {
              readonly format?: AudioFormat | undefined;
              readonly voice?: string | undefined;
              readonly speed?: number | undefined;
            }
          | undefined;
      }
    | undefined;
  readonly tools?: ReadonlyArray<FunctionTool> | undefined;
  readonly tool_choice?: ToolChoice | undefined;
  readonly max_output_tokens?: number | 'inf' | undefined;
}

/** Settings for one response; unset fields come from the session. */
export interface ResponseConfig {
  readonly output_modalities?: ReadonlyArray<Modality> | undefined;
  readonly instructions?: string | undefined;
  readonly tool_choice?: ToolChoice | undefined;
  readonly max_output_tokens?: number | 'inf' | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export type InputContent =
  | { readonly type: 'input_text'; readonly text: string }
  /** Base64 audio in the session's input format. */
  | { readonly type: 'input_audio'; readonly audio: string };

export type ConversationItem =
  | {
      readonly type: 'message';
      readonly role: 'user' | 'system';
      readonly content: ReadonlyArray<InputContent>;
    }
  | {
      readonly type: 'function_call_output';
      readonly call_id: string;
      /** The tool result as text, usually JSON. */
      readonly output: string;
    };

interface ClientEventBase {
  /** Echoed in an `error` event caused by this event. */
  readonly event_id?: string | undefined;
}

export type ClientEvent = ClientEventBase &
  (
    | { readonly type: 'session.update'; readonly session: SessionConfig }
    | { readonly type: 'conversation.item.create'; readonly item: ConversationItem }
    | { readonly type: 'response.create'; readonly response?: ResponseConfig | undefined }
    | { readonly type: 'response.cancel' }
    /** Base64 audio in the session's input format. */
    | { readonly type: 'input_audio_buffer.append'; readonly audio: string }
    | { readonly type: 'input_audio_buffer.commit' }
    | { readonly type: 'input_audio_buffer.clear' }
  );

const Text = Schema.optional(Schema.NullOr(Schema.String));
const Count = Schema.optional(Schema.NullOr(Schema.Finite));
const Id = Schema.optional(Schema.String);

export const ErrorDetails = Schema.Struct({
  type: Text,
  code: Text,
  message: Text,
  param: Text,
  event_id: Text,
});

const Usage = Schema.Struct({
  total_tokens: Count,
  input_tokens: Count,
  output_tokens: Count,
  input_token_details: Schema.optional(
    Schema.NullOr(Schema.Struct({ text_tokens: Count, audio_tokens: Count, cached_tokens: Count })),
  ),
  output_token_details: Schema.optional(
    Schema.NullOr(Schema.Struct({ text_tokens: Count, audio_tokens: Count })),
  ),
});

export const OutputItem = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('function_call'),
    id: Id,
    call_id: Schema.String,
    name: Schema.String,
    /** The arguments as JSON text. */
    arguments: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('message'),
    id: Id,
    role: Schema.String,
    content: Schema.Array(Schema.Struct({ type: Schema.String, text: Text, transcript: Text })),
  }),
]);
export const outputItemTypes: ReadonlySet<string> = new Set(['function_call', 'message']);

const Delta = { response_id: Id, item_id: Id };
const InputTranscription = { item_id: Id, content_index: Count };

export const ServerEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(['session.created', 'session.updated']),
    session: Schema.Struct({ id: Id, model: Id }),
  }),
  Schema.Struct({
    type: Schema.Literal('error'),
    error: Schema.optional(Schema.NullOr(ErrorDetails)),
  }),
  Schema.Struct({
    type: Schema.Literal('input_audio_buffer.committed'),
    item_id: Id,
    previous_item_id: Text,
  }),
  Schema.Struct({
    type: Schema.Literal('conversation.item.input_audio_transcription.delta'),
    ...InputTranscription,
    delta: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('conversation.item.input_audio_transcription.completed'),
    ...InputTranscription,
    transcript: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('conversation.item.input_audio_transcription.failed'),
    ...InputTranscription,
    error: Schema.optional(Schema.NullOr(Schema.Struct({ type: Text, code: Text, message: Text }))),
  }),
  Schema.Struct({
    type: Schema.Literal('response.created'),
    response: Schema.Struct({ id: Id, status: Text }),
  }),
  Schema.Struct({
    type: Schema.Literal('response.done'),
    response: Schema.Struct({
      id: Id,
      /** `completed`, `cancelled`, `incomplete` or `failed`. */
      status: Schema.String,
      status_details: Schema.optional(
        Schema.NullOr(
          Schema.Struct({
            type: Text,
            reason: Text,
            error: Schema.optional(Schema.NullOr(ErrorDetails)),
          }),
        ),
      ),
      output: Schema.Array(OutputItem),
      usage: Schema.optional(Schema.NullOr(Usage)),
    }),
  }),
  Schema.Struct({
    type: Schema.Literals([
      'response.output_text.delta',
      'response.output_audio_transcript.delta',
      // Base64 audio in the session's output format.
      'response.output_audio.delta',
    ]),
    ...Delta,
    delta: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('response.output_text.done'),
    ...Delta,
    text: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal('response.output_audio.done'), ...Delta }),
  Schema.Struct({
    type: Schema.Literal('response.output_audio_transcript.done'),
    ...Delta,
    transcript: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('response.function_call_arguments.delta'),
    ...Delta,
    call_id: Schema.String,
    delta: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('response.function_call_arguments.done'),
    ...Delta,
    call_id: Schema.String,
    name: Schema.String,
    arguments: Schema.String,
  }),
]);
export type ServerEvent = typeof ServerEvent.Type;

export const eventTypes: ReadonlySet<string> = new Set([
  'session.created',
  'session.updated',
  'error',
  'input_audio_buffer.committed',
  'conversation.item.input_audio_transcription.delta',
  'conversation.item.input_audio_transcription.completed',
  'conversation.item.input_audio_transcription.failed',
  'response.created',
  'response.done',
  'response.output_text.delta',
  'response.output_text.done',
  'response.output_audio.delta',
  'response.output_audio.done',
  'response.output_audio_transcript.delta',
  'response.output_audio_transcript.done',
  'response.function_call_arguments.delta',
  'response.function_call_arguments.done',
]);
