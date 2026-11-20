// Adapted from @effect/ai-anthropic (MIT), effect@4.1.4, 82904fe.
/**
 * Effect AI prompt, tools and response format → a Messages request. Every system message goes
 * to the top-level `system`; consecutive user and tool messages form one user turn, tool results
 * first. Thinking blocks replay with their signatures. Structured output is native
 * `output_config.format` on models that reject forced tool use, and a forced JSON tool otherwise.
 */
import * as AiError from 'effect/ai/AiError';
import { toCodecAnthropic } from 'effect/ai/AnthropicStructuredOutput';
import * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Prompt from 'effect/ai/Prompt';
import * as Tool from 'effect/ai/Tool';
import * as Effect from 'effect/Effect';
import * as Base64 from 'effect/encoding/Base64';
import * as Predicate from 'effect/Predicate';
import type * as Wire from './schema.ts';

/** Metadata and prompt-option namespace for thinking signatures and raw tool input. */
export const metadataKey = 'foundry-anthropic';

export interface Target {
  /** The wire model: a catalog RID or a raw target. */
  readonly rid: string;
  /** The default `max_tokens`. */
  readonly maxOutputTokens: number;
  /** Structured output through `output_config.format` instead of a forced JSON tool. */
  readonly nativeJson: boolean;
}

/** The public module's request-wide settings. */
export interface Settings {
  readonly max_tokens?: number | undefined;
  readonly thinking?: Wire.Thinking | undefined;
}

const fail = (reason: AiError.AiErrorReason) =>
  AiError.make({ module: 'AnthropicLanguageModel', method: 'makeRequest', reason });

/** A field this adapter stored under `metadataKey` on an earlier response part. */
export const option = (options: Prompt.ProviderOptions, field: string): unknown => {
  const value = options[metadataKey];
  return Predicate.isObject(value) ? value[field] : undefined;
};

const text = (options: Prompt.ProviderOptions, field: string): string | undefined => {
  const value = option(options, field);
  return typeof value === 'string' ? value : undefined;
};

type JsonFormat = Extract<LanguageModel.ProviderOptions['responseFormat'], { type: 'json' }>;

/** The response format when structured output goes through an injected JSON tool. */
export const jsonTool = (
  options: LanguageModel.ProviderOptions,
  target: Target,
): JsonFormat | undefined =>
  options.responseFormat.type === 'json' && !target.nativeJson ? options.responseFormat : undefined;

/** Strict tools are sent the Anthropic codec's schema; others the default one. */
export const isStrict = (tool: Tool.Any): boolean => Tool.getStrictMode(tool) === true;

const image = Effect.fnUntraced(function* (part: Prompt.FilePart) {
  if (!part.mediaType.startsWith('image/')) {
    return yield* fail(
      new AiError.InvalidUserInputError({
        description: `Unsupported file type ${part.mediaType}; send images only`,
      }),
    );
  }
  const block: Wire.ImageBlock = {
    type: 'image',
    source:
      part.data instanceof URL
        ? { type: 'url', url: part.data.href }
        : {
            type: 'base64',
            media_type: part.mediaType,
            data: typeof part.data === 'string' ? part.data : Base64.encode(part.data),
          },
  };
  return block;
});

/** JSON text for wire values; a void result still serializes as `null`. */
export const stringify = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value ?? null);

const toolResult = Effect.fnUntraced(function* (part: Prompt.ToolResultPart) {
  let content: string | Array<Wire.TextBlock | Wire.ImageBlock>;
  if (part.modelOutput === undefined) {
    content = stringify(part.result);
  } else {
    content = [];
    for (const output of part.modelOutput) {
      content.push(
        output.type === 'text' ? { type: 'text', text: output.text } : yield* image(output),
      );
    }
  }
  const block: Wire.UserBlock = {
    type: 'tool_result',
    tool_use_id: part.id,
    content,
    is_error: part.isFailure,
  };
  return block;
});

const assistantBlocks = (message: Prompt.AssistantMessage): Array<Wire.AssistantBlock> =>
  message.content.flatMap((part): Array<Wire.AssistantBlock> => {
    if (part.type === 'text') {
      return [{ type: 'text', text: part.text }];
    }
    if (part.type === 'reasoning') {
      // Only signed or redacted thinking can be replayed.
      const signature = text(part.options, 'signature');
      const redacted = text(part.options, 'redactedData');
      if (redacted !== undefined) {
        return [{ type: 'redacted_thinking', data: redacted }];
      }
      return signature === undefined ? [] : [{ type: 'thinking', thinking: part.text, signature }];
    }
    if (part.type === 'tool-call' && !part.providerExecuted) {
      // Strict calls replay the input the model produced, not the normalized parameters.
      const input = option(part.options, 'input') ?? part.params;
      return [{ type: 'tool_use', id: part.id, name: part.name, input }];
    }
    // Assistant files, provider-executed tools and approvals have no wire block here.
    return [];
  });

const encodePrompt = Effect.fnUntraced(function* (prompt: Prompt.Prompt) {
  const system: Array<Wire.TextBlock> = [];
  const messages: Array<Wire.Message> = [];
  // Consecutive user and tool messages share one user turn, with tool results first.
  let results: Array<Wire.UserBlock> = [];
  let user: Array<Wire.UserBlock> = [];
  const flushUser = () => {
    if (results.length + user.length > 0) {
      messages.push({ role: 'user', content: [...results, ...user] });
      results = [];
      user = [];
    }
  };
  for (const message of prompt.content) {
    switch (message.role) {
      case 'system':
        system.push({ type: 'text', text: message.content });
        break;
      case 'user':
        for (const part of message.content) {
          user.push(part.type === 'text' ? { type: 'text', text: part.text } : yield* image(part));
        }
        break;
      case 'tool':
        for (const part of message.content) {
          if (part.type === 'tool-result') {
            results.push(yield* toolResult(part));
          }
        }
        break;
      case 'assistant': {
        flushUser();
        const content = assistantBlocks(message);
        const last = messages.at(-1);
        if (last?.role === 'assistant') {
          last.content.push(...content);
        } else if (content.length > 0) {
          messages.push({ role: 'assistant', content });
        }
        break;
      }
    }
  }
  flushUser();
  // Anthropic rejects trailing whitespace in a final assistant prefill.
  const last = messages.at(-1);
  const final = last?.role === 'assistant' ? last.content.at(-1) : undefined;
  if (last?.role === 'assistant' && final?.type === 'text') {
    last.content[last.content.length - 1] = { type: 'text', text: final.text.trimEnd() };
  }
  return { system, messages };
});

const unsupportedSchema = (error: unknown) =>
  fail(
    new AiError.UnsupportedSchemaError({
      description: error instanceof Error ? error.message : String(error),
    }),
  );

const encodeTool = Effect.fnUntraced(function* (tool: Tool.Any) {
  if (Tool.isProviderDefined(tool)) {
    return yield* fail(
      new AiError.InvalidRequestError({
        description: `Provider-defined tool '${tool.name}' is not supported`,
      }),
    );
  }
  const strict = Tool.getStrictMode(tool);
  const inputSchema = yield* Effect.try({
    try: () =>
      Tool.getJsonSchema(tool, {
        transformer: strict === true ? toCodecAnthropic : LanguageModel.defaultCodecTransformer,
      }),
    catch: unsupportedSchema,
  });
  const description = Tool.getDescription(tool);
  const encoded: Wire.Tool = {
    name: String(tool.name),
    input_schema: inputSchema,
    ...(description === undefined ? undefined : { description }),
    ...(strict === undefined ? undefined : { strict }),
  };
  return encoded;
});

/**
 * In JSON-tool mode the application tools allowed by the choice travel with the injected tool,
 * and the model must call one of them, one at a time: the JSON tool alone is forced by name.
 * With thinking on, the choice stays `auto`, and a JSON text answer decodes as well.
 */
const encodeTools = Effect.fnUntraced(function* (
  options: LanguageModel.ProviderOptions,
  json: JsonFormat | undefined,
  thinking: boolean,
) {
  const choice = options.toolChoice;
  if (json !== undefined) {
    const { objectName, schema } = json;
    if (options.tools.some((tool) => tool.name === objectName)) {
      return yield* fail(
        new AiError.ToolConfigurationError({
          toolName: objectName,
          description: `Tool '${objectName}' collides with the structured output tool; pass another objectName`,
        }),
      );
    }
    const inputSchema = yield* Effect.try({
      try: () => Tool.getJsonSchemaFromSchema(schema, { transformer: toCodecAnthropic }),
      catch: unsupportedSchema,
    });
    const allowed = options.tools.filter(
      (tool) =>
        choice !== 'none' &&
        (typeof choice !== 'object' || !('tool' in choice) || tool.name === choice.tool),
    );
    const tools: Array<Wire.Tool> = [];
    for (const tool of allowed) {
      tools.push(yield* encodeTool(tool));
    }
    tools.push({
      name: objectName,
      description: 'Respond with a JSON object.',
      input_schema: inputSchema,
    });
    let toolChoice: Wire.ToolChoice;
    if (thinking) {
      // Thinking rejects forced tool use, so a thinking model is asked to call a tool instead.
      toolChoice = { type: 'auto', disable_parallel_tool_use: true };
    } else if (allowed.length === 0) {
      toolChoice = { type: 'tool', name: objectName, disable_parallel_tool_use: true };
    } else {
      toolChoice = { type: 'any', disable_parallel_tool_use: true };
    }
    return { tools, tool_choice: toolChoice };
  }
  if (options.tools.length === 0) {
    const required =
      choice === 'required' ||
      (typeof choice === 'object' && ('tool' in choice || choice.mode === 'required'));
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
  const tools: Array<Wire.Tool> = [];
  for (const tool of options.tools) {
    tools.push(yield* encodeTool(tool));
  }
  let toolChoice: Wire.ToolChoice;
  if (choice === 'required') {
    toolChoice = { type: 'any' };
  } else if (typeof choice === 'string') {
    toolChoice = { type: choice };
  } else if ('oneOf' in choice) {
    toolChoice = { type: choice.mode === 'required' ? 'any' : 'auto' };
  } else {
    toolChoice = { type: 'tool', name: String(choice.tool) };
  }
  return { tools, tool_choice: toolChoice };
});

const encodeFormat = Effect.fnUntraced(function* (
  options: LanguageModel.ProviderOptions,
  target: Target,
) {
  if (options.responseFormat.type !== 'json' || !target.nativeJson) {
    return {};
  }
  const { schema } = options.responseFormat;
  const jsonSchema = yield* Effect.try({
    try: () => Tool.getJsonSchemaFromSchema(schema, { transformer: toCodecAnthropic }),
    catch: unsupportedSchema,
  });
  return { output_config: { format: { type: 'json_schema', schema: jsonSchema } } } as const;
});

export const makeRequest = Effect.fnUntraced(function* (
  options: LanguageModel.ProviderOptions,
  target: Target,
  settings: Settings | undefined,
) {
  const { system, messages } = yield* encodePrompt(options.prompt);
  const thinking = settings?.thinking !== undefined && settings.thinking.type !== 'disabled';
  const tools = yield* encodeTools(options, jsonTool(options, target), thinking);
  const format = yield* encodeFormat(options, target);
  const request: Wire.Request = {
    model: target.rid,
    max_tokens: settings?.max_tokens ?? target.maxOutputTokens,
    messages,
    ...(system.length === 0 ? undefined : { system }),
    ...(settings?.thinking === undefined ? undefined : { thinking: settings.thinking }),
    ...tools,
    ...format,
  };
  return request;
});
