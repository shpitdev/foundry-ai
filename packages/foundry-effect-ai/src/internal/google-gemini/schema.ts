// Adapted from @ai-sdk/google (Apache-2.0), 4.0.122.
/**
 * Wire shapes for `/google/v1/models/{model}:generateContent` and `:streamGenerateContent`.
 * Requests are plain interfaces; the response schema decodes only the fields the adapter reads,
 * and each stream event is a whole response chunk of the same shape.
 */
import * as Schema from 'effect/Schema';

/** A part the adapter sends. A signature goes back on the part that carried it. */
export type Part =
  | {
      readonly text: string;
      readonly thought?: true;
      readonly thoughtSignature?: string;
    }
  | { readonly inlineData: { readonly mimeType: string; readonly data: string } }
  | { readonly fileData: { readonly mimeType: string; readonly fileUri: string } }
  | {
      readonly functionCall: {
        readonly id?: string;
        readonly name: string;
        readonly args: unknown;
      };
      readonly thoughtSignature?: string;
    }
  | {
      readonly functionResponse: {
        readonly id?: string;
        readonly name: string;
        readonly response:
          | { readonly name: string; readonly content: unknown }
          | { readonly name: string; readonly error: unknown };
      };
    };

export interface Content {
  readonly role: 'user' | 'model';
  readonly parts: ReadonlyArray<Part>;
}

/** Request-wide thinking settings, sent as given. Foundry accepts upper-case levels only. */
export interface ThinkingConfig {
  readonly includeThoughts?: boolean;
  readonly thinkingBudget?: number;
  readonly thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface FunctionDeclaration {
  readonly name: string;
  readonly description?: string;
  readonly parametersJsonSchema: unknown;
}

export interface FunctionCallingConfig {
  readonly mode: 'AUTO' | 'NONE' | 'ANY';
  readonly allowedFunctionNames?: ReadonlyArray<string>;
}

export interface Request {
  readonly contents: ReadonlyArray<Content>;
  readonly systemInstruction?: { readonly parts: ReadonlyArray<{ readonly text: string }> };
  readonly generationConfig?: {
    readonly responseMimeType?: 'application/json';
    readonly responseJsonSchema?: unknown;
    readonly thinkingConfig?: ThinkingConfig;
  };
  readonly tools?: ReadonlyArray<{
    readonly functionDeclarations: ReadonlyArray<FunctionDeclaration>;
  }>;
  readonly toolConfig?: { readonly functionCallingConfig: FunctionCallingConfig };
}

const Count = Schema.optional(Schema.Finite);

/** Proto3 JSON omits zero counts, so a present snapshot reads missing fields as zero. */
export const UsageMetadata = Schema.Struct({
  promptTokenCount: Count,
  toolUsePromptTokenCount: Count,
  cachedContentTokenCount: Count,
  candidatesTokenCount: Count,
  thoughtsTokenCount: Count,
  totalTokenCount: Count,
});

/** `{ code, status, message }`, read leniently: every field may be absent. */
export const ErrorObject = Schema.Struct({
  code: Schema.optional(Schema.NullOr(Schema.Finite)),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  message: Schema.optional(Schema.NullOr(Schema.String)),
});

export const FunctionCall = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.String,
  args: Schema.optional(Schema.Json),
});

export const ResponsePart = Schema.Struct({
  text: Schema.optional(Schema.String),
  thought: Schema.optional(Schema.Boolean),
  thoughtSignature: Schema.optional(Schema.String),
  functionCall: Schema.optional(FunctionCall),
});

/** A response, or one stream chunk. A 2xx body or event may instead carry `error`. */
export const Response = Schema.Struct({
  responseId: Schema.optional(Schema.String),
  modelVersion: Schema.optional(Schema.String),
  createTime: Schema.optional(Schema.String),
  candidates: Schema.optional(
    Schema.Array(
      Schema.Struct({
        content: Schema.optional(
          Schema.Struct({ parts: Schema.optional(Schema.Array(ResponsePart)) }),
        ),
        finishReason: Schema.optional(Schema.String),
      }),
    ),
  ),
  promptFeedback: Schema.optional(Schema.Struct({ blockReason: Schema.optional(Schema.String) })),
  usageMetadata: Schema.optional(UsageMetadata),
  error: Schema.optional(ErrorObject),
});
