// Adapted from @ai-sdk/google (Apache-2.0), 4.0.122.
/**
 * Effect AI prompt, tools and response format → a `generateContent` request. Every turn replays
 * the whole prompt, and each part goes back with the thought signature it arrived with: Gemini
 * rejects a replayed function call that lost its signature.
 */
import * as AiError from 'effect/ai/AiError';
import * as LanguageModel from 'effect/ai/LanguageModel';
import type * as Prompt from 'effect/ai/Prompt';
import * as Tool from 'effect/ai/Tool';
import * as Effect from 'effect/Effect';
import * as Base64 from 'effect/encoding/Base64';
import * as Predicate from 'effect/Predicate';
import type * as Schema from 'effect/Schema';
import type * as Wire from './schema.ts';

/** Metadata and prompt-option namespace for thought signatures. */
export const metadataKey = 'foundry-google';

/**
 * Gemini accepts Effect's default JSON Schema as `responseJsonSchema`, including
 * `additionalProperties`, `anyOf`, bounds and `$defs`. It ignores `const`, which Effect never
 * emits: literals become `enum`. Keywords outside Gemini's subset, and types with no JSON form,
 * pass through unchecked; the codec still validates the answer.
 */
export const codecTransformer = LanguageModel.defaultCodecTransformer;

const fail = (reason: AiError.AiErrorReason) =>
  AiError.make({ module: 'GoogleLanguageModel', method: 'makeRequest', reason });

/** What an earlier response part stored for replay under `metadataKey`. */
const replayed = (options: Prompt.ProviderOptions) => {
  const value = options[metadataKey];
  const fields = Predicate.isObject(value) ? value : {};
  const { thoughtSignature, functionCall } = fields;
  return {
    signed: typeof thoughtSignature === 'string' ? { thoughtSignature } : {},
    localId: fields['localId'] === true,
    // The synthetic JSON call whose arguments became answer text.
    functionCall:
      Predicate.isObject(functionCall) && typeof functionCall['name'] === 'string'
        ? {
            name: functionCall['name'],
            args: functionCall['args'] ?? {},
            ...(typeof functionCall['id'] === 'string' ? { id: functionCall['id'] } : undefined),
          }
        : undefined,
  };
};

const base64DataUrl = /^data:[^,]*;base64,/u;

const filePart = (part: Prompt.FilePart): Wire.Part => {
  const { mediaType: mimeType, data } = part;
  if (!(data instanceof URL)) {
    return {
      inlineData: { mimeType, data: typeof data === 'string' ? data : Base64.encode(data) },
    };
  }
  return base64DataUrl.test(data.href)
    ? { inlineData: { mimeType, data: data.href.replace(base64DataUrl, '') } }
    : { fileData: { mimeType, fileUri: data.href } };
};

/** A tool result as Gemini's object `response`: the text of its model output, or the result. */
const toolResponse = Effect.fnUntraced(function* (part: Prompt.ToolResultPart) {
  if (part.isFailure) {
    return { name: part.name, error: part.result ?? null };
  }
  if (part.modelOutput === undefined) {
    return { name: part.name, content: part.result ?? null };
  }
  const texts: Array<string> = [];
  for (const output of part.modelOutput) {
    if (output.type !== 'text') {
      return yield* fail(
        new AiError.InvalidUserInputError({
          description: `Tool results cannot carry files (${output.mediaType}) on this route`,
        }),
      );
    }
    texts.push(output.text);
  }
  return { name: part.name, content: texts.join('\n') };
});

const encodePrompt = Effect.fnUntraced(function* (prompt: Prompt.Prompt) {
  const system: Array<{ text: string }> = [];
  const contents: Array<Wire.Content> = [];
  // Call IDs generated locally because Gemini sent none; they stay off the wire.
  const localIds = new Set<string>();
  for (const message of prompt.content) {
    const parts: Array<Wire.Part> = [];
    switch (message.role) {
      case 'system':
        if (contents.length > 0) {
          return yield* fail(
            new AiError.InvalidUserInputError({
              description: 'System messages are supported only at the start of the prompt',
            }),
          );
        }
        system.push({ text: message.content });
        break;
      case 'user':
        for (const part of message.content) {
          parts.push(part.type === 'text' ? { text: part.text } : filePart(part));
        }
        contents.push({ role: 'user', parts });
        break;
      case 'assistant':
        for (const part of message.content) {
          const { signed, localId, functionCall } = replayed(part.options);
          if (part.type === 'text' && functionCall !== undefined) {
            parts.push({ functionCall, ...signed });
          } else if (
            (part.type === 'text' || part.type === 'reasoning') &&
            (part.text !== '' || signed.thoughtSignature !== undefined)
          ) {
            parts.push({
              text: part.text,
              ...(part.type === 'reasoning' ? { thought: true } : undefined),
              ...signed,
            });
          } else if (part.type === 'tool-call' && !part.providerExecuted) {
            if (localId) {
              localIds.add(part.id);
            }
            parts.push({
              functionCall: {
                ...(localId ? undefined : { id: part.id }),
                name: part.name,
                args: part.params,
              },
              ...signed,
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
        break;
      case 'tool':
        for (const part of message.content) {
          if (part.type === 'tool-result') {
            parts.push({
              functionResponse: {
                ...(localIds.has(part.id) ? undefined : { id: part.id }),
                name: part.name,
                response: yield* toolResponse(part),
              },
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'user', parts });
        }
        break;
    }
  }
  return {
    contents,
    ...(system.length === 0 ? undefined : { systemInstruction: { parts: system } }),
  };
});

const unsupportedSchema = (error: unknown) =>
  fail(
    new AiError.UnsupportedSchemaError({
      description: error instanceof Error ? error.message : String(error),
    }),
  );

const responseSchema = (schema: Schema.Constraint) =>
  Effect.try({
    try: () => Tool.getJsonSchemaFromSchema(schema, { transformer: codecTransformer }),
    catch: unsupportedSchema,
  });

/**
 * Function declarations and the calling mode. JSON output beside tools becomes a synthetic
 * `json` function under forced calling: with `responseJsonSchema` and tools both set, Gemini
 * 3.1 Flash-Lite calls the tool again after its result instead of answering.
 */
const encodeTools = Effect.fnUntraced(function* (
  options: LanguageModel.ProviderOptions,
  jsonSchema: unknown,
) {
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
  const functionDeclarations: Array<Wire.FunctionDeclaration> = [];
  for (const tool of allowed) {
    if (Tool.isProviderDefined(tool)) {
      return yield* fail(
        new AiError.InvalidRequestError({
          description: `Provider-defined tool '${tool.name}' is not supported`,
        }),
      );
    }
    const parametersJsonSchema = yield* Effect.try({
      try: () => Tool.getJsonSchema(tool, { transformer: codecTransformer }),
      catch: unsupportedSchema,
    });
    const description = Tool.getDescription(tool);
    functionDeclarations.push({
      name: String(tool.name),
      parametersJsonSchema,
      ...(description === undefined ? undefined : { description }),
    });
  }
  let jsonTool: string | undefined;
  if (jsonSchema !== undefined) {
    jsonTool = 'json';
    for (let suffix = 1; options.tools.some((tool) => tool.name === jsonTool); suffix++) {
      jsonTool = `json_${suffix}`;
    }
    functionDeclarations.push({
      name: jsonTool,
      description: 'Respond with a JSON object.',
      parametersJsonSchema: jsonSchema,
    });
  }
  let functionCallingConfig: Wire.FunctionCallingConfig;
  if (typeof choice === 'object' && 'tool' in choice) {
    functionCallingConfig = { mode: 'ANY', allowedFunctionNames: [String(choice.tool)] };
  } else if (jsonTool !== undefined) {
    functionCallingConfig =
      choice === 'none' ? { mode: 'ANY', allowedFunctionNames: [jsonTool] } : { mode: 'ANY' };
  } else if (choice === 'none') {
    functionCallingConfig = { mode: 'NONE' };
  } else {
    functionCallingConfig = { mode: required ? 'ANY' : 'AUTO' };
  }
  return { tools: [{ functionDeclarations }], toolConfig: { functionCallingConfig }, jsonTool };
});

/** The request, and the synthetic JSON function whose call is the answer, if one was added. */
export const makeRequest = Effect.fnUntraced(function* (
  options: LanguageModel.ProviderOptions,
  thinkingConfig: Wire.ThinkingConfig | undefined,
) {
  const prompt = yield* encodePrompt(options.prompt);
  const format = options.responseFormat;
  const jsonSchema = format.type === 'json' ? yield* responseSchema(format.schema) : undefined;
  const { jsonTool, ...tools } = yield* encodeTools(options, jsonSchema);
  const generationConfig = {
    ...(jsonSchema === undefined || jsonTool !== undefined
      ? undefined
      : { responseMimeType: 'application/json' as const, responseJsonSchema: jsonSchema }),
    ...(thinkingConfig === undefined ? undefined : { thinkingConfig }),
  };
  const request: Wire.Request = {
    ...prompt,
    ...tools,
    ...(Object.keys(generationConfig).length === 0 ? undefined : { generationConfig }),
  };
  return { request, jsonTool };
});
