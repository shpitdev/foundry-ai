// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/**
 * Effect AI prompt, tools and response format → a stateless Responses request. Foundry needs
 * `store: false`, so every turn replays the whole prompt: reasoning items travel with their
 * encrypted content, and function calls keep their item IDs.
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

/** Metadata and prompt-option namespace for this protocol's item IDs and reasoning. */
export const metadataKey = 'foundry-openai';

export interface Target {
  /** The wire model: a catalog RID or a raw target. */
  readonly rid: string;
  /** Developer messages and encrypted reasoning for stateless replay. */
  readonly reasoning: boolean;
}

const fail = (reason: AiError.AiErrorReason) =>
  AiError.make({ module: 'OpenAiLanguageModel', method: 'makeRequest', reason });

/** A string field this adapter stored under `metadataKey` on an earlier response part. */
export const option = (options: Prompt.ProviderOptions, field: string): string | undefined => {
  const value = options[metadataKey];
  const raw = Predicate.isObject(value) ? value[field] : undefined;
  return typeof raw === 'string' ? raw : undefined;
};

const stringify = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

const imageUrl = (part: Prompt.FilePart): string =>
  part.data instanceof URL
    ? part.data.href
    : `data:${part.mediaType};base64,${typeof part.data === 'string' ? part.data : Base64.encode(part.data)}`;

const unsupportedFile = (mediaType: string) =>
  fail(
    new AiError.InvalidUserInputError({
      description: `Unsupported file type ${mediaType}; send images only`,
    }),
  );

/** A tool result as text, or its model output as input parts (Foundry accepts images there). */
const toolOutput = Effect.fnUntraced(function* (part: Prompt.ToolResultPart) {
  if (part.modelOutput === undefined) {
    return stringify(part.result);
  }
  const content: Array<Wire.InputContent> = [];
  for (const output of part.modelOutput) {
    if (output.type === 'text') {
      content.push({ type: 'input_text', text: output.text });
    } else if (output.mediaType.startsWith('image/')) {
      content.push({ type: 'input_image', image_url: imageUrl(output) });
    } else {
      return yield* unsupportedFile(output.mediaType);
    }
  }
  return content;
});

const encodePrompt = Effect.fnUntraced(function* (prompt: Prompt.Prompt, target: Target) {
  const input: Array<Wire.InputItem> = [];
  for (const message of prompt.content) {
    switch (message.role) {
      case 'system':
        input.push({
          role: target.reasoning ? 'developer' : 'system',
          content: [{ type: 'input_text', text: message.content }],
        });
        break;
      case 'user': {
        const content: Array<Wire.InputContent> = [];
        for (const part of message.content) {
          if (part.type === 'text') {
            content.push({ type: 'input_text', text: part.text });
          } else if (part.mediaType.startsWith('image/')) {
            content.push({ type: 'input_image', image_url: imageUrl(part) });
          } else {
            return yield* unsupportedFile(part.mediaType);
          }
        }
        input.push({ role: 'user', content });
        break;
      }
      case 'assistant': {
        // Parts of one wire item (text blocks, reasoning summaries) replay as one item.
        const messages = new Map<string, Extract<Wire.InputItem, { type: 'message' }>>();
        const reasoning = new Map<string, Extract<Wire.InputItem, { type: 'reasoning' }>>();
        for (const part of message.content) {
          const itemId = option(part.options, 'itemId');
          if (part.type === 'text') {
            const content = { type: 'output_text' as const, text: part.text, annotations: [] };
            const item = itemId === undefined ? undefined : messages.get(itemId);
            if (item === undefined) {
              const created: Extract<Wire.InputItem, { type: 'message' }> = {
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [content],
                ...(itemId === undefined ? undefined : { id: itemId }),
              };
              if (itemId !== undefined) {
                messages.set(itemId, created);
              }
              input.push(created);
            } else {
              item.content.push(content);
            }
          } else if (part.type === 'reasoning' && itemId !== undefined) {
            const encrypted = option(part.options, 'encryptedContent');
            const item = reasoning.get(itemId);
            const summary =
              part.text === '' ? [] : [{ type: 'summary_text' as const, text: part.text }];
            if (item === undefined) {
              const created: Extract<Wire.InputItem, { type: 'reasoning' }> = {
                type: 'reasoning',
                id: itemId,
                summary,
                ...(encrypted === undefined ? undefined : { encrypted_content: encrypted }),
              };
              reasoning.set(itemId, created);
              input.push(created);
            } else {
              item.summary.push(...summary);
              if (encrypted !== undefined) {
                item.encrypted_content = encrypted;
              }
            }
          } else if (part.type === 'tool-call' && !part.providerExecuted) {
            input.push({
              type: 'function_call',
              call_id: part.id,
              name: part.name,
              arguments: option(part.options, 'arguments') ?? stringify(part.params),
              ...(itemId === undefined ? undefined : { id: itemId }),
            });
          }
        }
        break;
      }
      case 'tool':
        for (const part of message.content) {
          if (part.type === 'tool-result') {
            input.push({
              type: 'function_call_output',
              call_id: part.id,
              output: yield* toolOutput(part),
            });
          }
        }
        break;
    }
  }
  return input;
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
      name: String(tool.name),
      parameters,
      strict,
      ...(description === undefined ? undefined : { description }),
    });
  }
  let toolChoice: Wire.ToolChoice;
  if (typeof choice === 'string') {
    toolChoice = choice;
  } else if ('oneOf' in choice) {
    toolChoice = choice.mode ?? 'auto';
  } else {
    toolChoice = { type: 'function', name: String(choice.tool) };
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
    text: { format: { type: 'json_schema', name: objectName, schema: jsonSchema, strict: true } },
  } as const;
});

export const makeRequest = Effect.fnUntraced(function* (
  options: LanguageModel.ProviderOptions,
  target: Target,
  reasoning: Wire.Reasoning | undefined,
) {
  const input = yield* encodePrompt(options.prompt, target);
  const tools = yield* encodeTools(options);
  const text = yield* encodeFormat(options);
  const request: Wire.Request = {
    model: target.rid,
    input,
    store: false,
    ...(target.reasoning ? { include: ['reasoning.encrypted_content'] } : undefined),
    ...(reasoning === undefined ? undefined : { reasoning }),
    ...tools,
    ...text,
  };
  return request;
});
