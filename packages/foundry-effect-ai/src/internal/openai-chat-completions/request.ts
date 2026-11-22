// Adapted from @effect/ai-openai-compat (MIT), effect@4.1.4, 82904fe.
/**
 * Effect AI prompt, tools and response format → a Chat Completions request. Chat is stateless,
 * so every turn sends the whole prompt. Tool calls replay with the model's own argument text.
 * Reasoning never replays: OpenAI models return none here, Foundry rejects Kimi's
 * `reasoning_content` on assistant messages (HTTP 400), and sending the tagged makers' spans
 * back would put reasoning into the assistant's text.
 */
import * as AiError from 'effect/ai/AiError';
import * as LanguageModel from 'effect/ai/LanguageModel';
import { toCodecOpenAI } from 'effect/ai/OpenAiStructuredOutput';
import type * as Prompt from 'effect/ai/Prompt';
import * as Tool from 'effect/ai/Tool';
import * as Effect from 'effect/Effect';
import * as Base64 from 'effect/encoding/Base64';
import * as Predicate from 'effect/Predicate';
import type * as ReasoningTags from './reasoningTags.ts';
import type * as Wire from './schema.ts';

/**
 * What one maker's models need on the Chat route, passed in by its public module so this folder
 * holds no vendor branches. OpenAI, DeepSeek, NVIDIA, Qwen and Moonshot differ only in these values.
 */
export interface Dialect {
  /** The public module, named in errors. */
  readonly module: string;
  /** The provider namespace for tool-call arguments and error codes in metadata and prompt options. */
  readonly metadataKey: string;
  /** The proxy route, `/openai/v1/chat/completions` for every maker. */
  readonly path: string;
  /** The wire model: a catalog RID or a raw target. */
  readonly model: string;
  /** OpenAI reasoning models take system prompts as developer messages. */
  readonly systemRole: 'system' | 'developer';
  /**
   * The `reasoning_effort` sent with every request, which is how each maker switches reasoning:
   * `'high'` turns on the tagged makers' spans, `'none'` turns off Kimi's default reasoning.
   */
  readonly reasoningEffort: Wire.ReasoningEffort | undefined;
  /** Function tools are accepted only with `reasoning_effort: 'none'`, sent when no effort is set. */
  readonly toolsNeedNoReasoning: boolean;
  /** Reads `reasoning_content` as reasoning (Kimi). OpenAI's field is always null. */
  readonly reasoningContent: boolean;
  /**
   * Splits `<reasoning>` spans out of `content` (DeepSeek, Nemotron, Qwen). Set only when the
   * request asks for reasoning, so content without it, such as JSON that holds the tag as text,
   * passes through untouched.
   */
  readonly reasoningTags: (() => ReasoningTags.Splitter) | undefined;
}

const fail = (dialect: Dialect, reason: AiError.AiErrorReason) =>
  AiError.make({ module: dialect.module, method: 'makeRequest', reason });

/** A string field this adapter stored under the dialect's namespace on an earlier response part. */
const option = (
  dialect: Dialect,
  options: Prompt.ProviderOptions,
  field: string,
): string | undefined => {
  const value = options[dialect.metadataKey];
  const raw = Predicate.isObject(value) ? value[field] : undefined;
  return typeof raw === 'string' ? raw : undefined;
};

// A void result still serializes: `JSON.stringify(undefined)` is not a string.
const stringify = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value ?? null);

const unsupportedFile = (dialect: Dialect, mediaType: string, where: string) =>
  fail(
    dialect,
    new AiError.InvalidUserInputError({
      description: `Unsupported file type ${mediaType} in ${where}`,
    }),
  );

const imagePart = (part: Prompt.FilePart): Wire.ContentPart => ({
  type: 'image_url',
  image_url: {
    url:
      part.data instanceof URL
        ? part.data.href
        : `data:${part.mediaType};base64,${typeof part.data === 'string' ? part.data : Base64.encode(part.data)}`,
  },
});

/** Chat tool messages carry text only; any other model output fails rather than vanishing. */
const toolContent = Effect.fnUntraced(function* (dialect: Dialect, part: Prompt.ToolResultPart) {
  if (part.modelOutput === undefined) {
    return stringify(part.result);
  }
  const content: Array<{ readonly type: 'text'; readonly text: string }> = [];
  for (const output of part.modelOutput) {
    if (output.type !== 'text') {
      return yield* unsupportedFile(dialect, output.mediaType, 'a tool result');
    }
    content.push({ type: 'text', text: output.text });
  }
  return content;
});

const encodePrompt = Effect.fnUntraced(function* (prompt: Prompt.Prompt, dialect: Dialect) {
  const messages: Array<Wire.Message> = [];
  for (const message of prompt.content) {
    switch (message.role) {
      case 'system':
        messages.push({
          role: dialect.systemRole,
          content: message.content,
        });
        break;
      case 'user': {
        const content: Array<Wire.ContentPart> = [];
        for (const part of message.content) {
          if (part.type === 'text') {
            content.push({ type: 'text', text: part.text });
          } else if (part.mediaType.startsWith('image/')) {
            content.push(imagePart(part));
          } else {
            return yield* unsupportedFile(
              dialect,
              part.mediaType,
              'a user message; send images only',
            );
          }
        }
        const [only] = content;
        messages.push({
          role: 'user',
          content: content.length === 1 && only?.type === 'text' ? only.text : content,
        });
        break;
      }
      case 'assistant': {
        // One wire message per prompt message keeps the text with its tool calls.
        let text: string | null = null;
        const toolCalls: Array<Wire.ToolCall> = [];
        for (const part of message.content) {
          if (part.type === 'text') {
            text = (text ?? '') + part.text;
          } else if (part.type === 'tool-call' && !part.providerExecuted) {
            toolCalls.push({
              id: part.id,
              type: 'function',
              function: {
                name: part.name,
                arguments: option(dialect, part.options, 'arguments') ?? stringify(part.params),
              },
            });
          }
        }
        if (text !== null || toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: text,
            ...(toolCalls.length === 0 ? undefined : { tool_calls: toolCalls }),
          });
        }
        break;
      }
      case 'tool':
        for (const part of message.content) {
          if (part.type === 'tool-result') {
            messages.push({
              role: 'tool',
              tool_call_id: part.id,
              content: yield* toolContent(dialect, part),
            });
          }
        }
        break;
    }
  }
  return messages;
});

const unsupportedSchema = (dialect: Dialect) => (error: unknown) =>
  fail(
    dialect,
    new AiError.UnsupportedSchemaError({
      description: error instanceof Error ? error.message : String(error),
    }),
  );

/** Foundry OpenAI defaults function tools to strict unless the tool says otherwise. */
export const isStrict = (tool: Tool.Any): boolean => Tool.getStrictMode(tool) ?? true;

const encodeTools = Effect.fnUntraced(function* (
  options: LanguageModel.ProviderOptions,
  dialect: Dialect,
) {
  const choice = options.toolChoice;
  const required =
    choice === 'required' ||
    (typeof choice === 'object' && ('tool' in choice || choice.mode === 'required'));
  if (options.tools.length === 0) {
    if (required) {
      return yield* fail(
        dialect,
        new AiError.ToolConfigurationError({
          toolName: typeof choice === 'object' && 'tool' in choice ? String(choice.tool) : '',
          description: 'The tool choice requires a tool call, but no tools are available',
        }),
      );
    }
    return {};
  }
  const allowed =
    typeof choice === 'object' && 'oneOf' in choice
      ? options.tools.filter((tool) => choice.oneOf.includes(tool.name))
      : options.tools;
  const tools: Array<Wire.FunctionTool> = [];
  for (const tool of allowed) {
    if (Tool.isProviderDefined(tool)) {
      return yield* fail(
        dialect,
        new AiError.InvalidRequestError({
          description: `Provider-defined tool '${tool.name}' is not supported`,
        }),
      );
    }
    const strict = isStrict(tool);
    const parameters = yield* Effect.try({
      try: () =>
        Tool.getJsonSchema(tool, {
          transformer: strict ? toCodecOpenAI : LanguageModel.defaultCodecTransformer,
        }),
      catch: unsupportedSchema(dialect),
    });
    const description = Tool.getDescription(tool);
    tools.push({
      type: 'function',
      function: {
        name: String(tool.name),
        parameters,
        strict,
        ...(description === undefined ? undefined : { description }),
      },
    });
  }
  let toolChoice: Wire.ToolChoice;
  if (typeof choice === 'string') {
    toolChoice = choice;
  } else if ('oneOf' in choice) {
    toolChoice = choice.mode ?? 'auto';
  } else {
    toolChoice = { type: 'function', function: { name: String(choice.tool) } };
  }
  return { tools, tool_choice: toolChoice };
});

const encodeFormat = Effect.fnUntraced(function* (
  options: LanguageModel.ProviderOptions,
  dialect: Dialect,
) {
  if (options.responseFormat.type !== 'json') {
    return {};
  }
  const { objectName, schema } = options.responseFormat;
  const jsonSchema = yield* Effect.try({
    try: () => Tool.getJsonSchemaFromSchema(schema, { transformer: toCodecOpenAI }),
    catch: unsupportedSchema(dialect),
  });
  return {
    response_format: {
      type: 'json_schema',
      json_schema: { name: objectName, schema: jsonSchema, strict: true },
    },
  } as const;
});

export const makeRequest = Effect.fnUntraced(function* (
  options: LanguageModel.ProviderOptions,
  dialect: Dialect,
) {
  const messages = yield* encodePrompt(options.prompt, dialect);
  const tools = yield* encodeTools(options, dialect);
  // Without a configured effort, such models would reject the tools; an explicit one is sent.
  const effort =
    dialect.reasoningEffort ??
    ('tools' in tools && dialect.toolsNeedNoReasoning ? 'none' : undefined);
  const request: Wire.Request = {
    model: dialect.model,
    messages,
    ...(effort === undefined ? undefined : { reasoning_effort: effort }),
    ...tools,
    ...(yield* encodeFormat(options, dialect)),
  };
  return request;
});
