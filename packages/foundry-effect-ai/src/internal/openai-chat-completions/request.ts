// Adapted from @effect/ai-openai-compat (MIT), effect@4.1.4, 82904fe.
/**
 * Effect AI prompt, tools and response format → a Chat Completions request. Chat is stateless,
 * so every turn sends the whole prompt; OpenAI models return no reasoning text here, so there
 * is no reasoning to replay. Tool calls replay with the model's own argument text.
 */
import * as AiError from 'effect/ai/AiError';
import * as LanguageModel from 'effect/ai/LanguageModel';
import { toCodecOpenAI } from 'effect/ai/OpenAiStructuredOutput';
import type * as Prompt from 'effect/ai/Prompt';
import * as Tool from 'effect/ai/Tool';
import * as Effect from 'effect/Effect';
import * as Base64 from 'effect/encoding/Base64';
import * as Predicate from 'effect/Predicate';
import type * as Wire from './schema.ts';

/** Metadata and prompt-option namespace for a tool call's wire arguments. */
export const metadataKey = 'foundry-openai';

export interface Target {
  /** The wire model: a catalog RID or a raw target. */
  readonly rid: string;
  /** Reasoning models take system prompts as developer messages. */
  readonly reasoning: boolean;
  /** Function tools are accepted only with `reasoning_effort: 'none'`. */
  readonly toolsNeedNoReasoning: boolean;
}

const fail = (reason: AiError.AiErrorReason) =>
  AiError.make({ module: 'OpenAiChatLanguageModel', method: 'makeRequest', reason });

/** A string field this adapter stored under `metadataKey` on an earlier response part. */
const option = (options: Prompt.ProviderOptions, field: string): string | undefined => {
  const value = options[metadataKey];
  const raw = Predicate.isObject(value) ? value[field] : undefined;
  return typeof raw === 'string' ? raw : undefined;
};

// A void result still serializes: `JSON.stringify(undefined)` is not a string.
const stringify = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value ?? null);

const unsupportedFile = (mediaType: string, where: string) =>
  fail(
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
const toolContent = Effect.fnUntraced(function* (part: Prompt.ToolResultPart) {
  if (part.modelOutput === undefined) {
    return stringify(part.result);
  }
  const content: Array<{ readonly type: 'text'; readonly text: string }> = [];
  for (const output of part.modelOutput) {
    if (output.type !== 'text') {
      return yield* unsupportedFile(output.mediaType, 'a tool result');
    }
    content.push({ type: 'text', text: output.text });
  }
  return content;
});

const encodePrompt = Effect.fnUntraced(function* (prompt: Prompt.Prompt, target: Target) {
  const messages: Array<Wire.Message> = [];
  for (const message of prompt.content) {
    switch (message.role) {
      case 'system':
        messages.push({
          role: target.reasoning ? 'developer' : 'system',
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
            return yield* unsupportedFile(part.mediaType, 'a user message; send images only');
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
                arguments: option(part.options, 'arguments') ?? stringify(part.params),
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
              content: yield* toolContent(part),
            });
          }
        }
        break;
    }
  }
  return messages;
});

const unsupportedSchema = (error: unknown) =>
  fail(
    new AiError.UnsupportedSchemaError({
      description: error instanceof Error ? error.message : String(error),
    }),
  );

/** Foundry OpenAI defaults function tools to strict unless the tool says otherwise. */
export const isStrict = (tool: Tool.Any): boolean => Tool.getStrictMode(tool) ?? true;

const encodeTools = Effect.fnUntraced(function* (options: LanguageModel.ProviderOptions) {
  const choice = options.toolChoice;
  const required =
    choice === 'required' ||
    (typeof choice === 'object' && ('tool' in choice || choice.mode === 'required'));
  if (options.tools.length === 0) {
    if (required) {
      return yield* fail(
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
      catch: unsupportedSchema,
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

const encodeFormat = Effect.fnUntraced(function* (options: LanguageModel.ProviderOptions) {
  if (options.responseFormat.type !== 'json') {
    return {};
  }
  const { objectName, schema } = options.responseFormat;
  const jsonSchema = yield* Effect.try({
    try: () => Tool.getJsonSchemaFromSchema(schema, { transformer: toCodecOpenAI }),
    catch: unsupportedSchema,
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
  target: Target,
  reasoningEffort: Wire.ReasoningEffort | undefined,
) {
  const messages = yield* encodePrompt(options.prompt, target);
  const tools = yield* encodeTools(options);
  // Without a configured effort, such models would reject the tools; an explicit one is sent.
  const effort =
    reasoningEffort ?? ('tools' in tools && target.toolsNeedNoReasoning ? 'none' : undefined);
  const request: Wire.Request = {
    model: target.rid,
    messages,
    ...(effort === undefined ? undefined : { reasoning_effort: effort }),
    ...tools,
    ...(yield* encodeFormat(options)),
  };
  return request;
});
