// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/** Wire shapes for `/openai/v1/decisions`. The response schema decodes only the fields we read. */
import * as Schema from 'effect/Schema';

export type InputContent =
  | { readonly type: 'input_text'; readonly text: string }
  | { readonly type: 'input_image'; readonly image_url: string };

export type Question =
  | { readonly type: 'predicate'; readonly name: string; readonly instructions: string }
  | {
      readonly type: 'choice';
      readonly name: string;
      readonly instructions: string;
      readonly choices: ReadonlyArray<{ readonly value: string; readonly description?: string }>;
    }
  | {
      readonly type: 'score';
      readonly name: string;
      readonly instructions: string;
      readonly levels: ReadonlyArray<{ readonly label: string; readonly description: string }>;
    };

export interface Request {
  readonly model: string;
  readonly input:
    | string
    | ReadonlyArray<{ readonly role: 'user'; readonly content: ReadonlyArray<InputContent> }>;
  readonly questions: ReadonlyArray<Question>;
}

const Confidence = Schema.optional(Schema.NullOr(Schema.Finite));

export const Answer = Schema.Union([
  // Foundry's schema allows a refusal without a question name.
  Schema.Struct({ type: Schema.Literal('refusal'), name: Schema.NullOr(Schema.String) }),
  Schema.Struct({
    type: Schema.Literal('predicate'),
    name: Schema.String,
    probability: Schema.Finite,
  }),
  Schema.Struct({
    type: Schema.Literal('choice'),
    name: Schema.String,
    choice: Schema.String,
    confidence: Confidence,
    probabilities: Schema.Array(
      Schema.Struct({ value: Schema.String, probability: Schema.Finite }),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal('score'),
    name: Schema.String,
    score: Schema.Finite,
    confidence: Confidence,
    // `value` indexes the requested levels.
    probabilities: Schema.Array(Schema.Struct({ value: Schema.Int, probability: Schema.Finite })),
  }),
]);

export const Response = Schema.Struct({
  answers: Schema.Array(Answer),
  model: Schema.optional(Schema.NullOr(Schema.String)),
  id: Schema.optional(Schema.NullOr(Schema.String)),
  usage: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        input_tokens: Schema.optional(Schema.NullOr(Schema.Finite)),
        output_tokens: Schema.optional(Schema.NullOr(Schema.Finite)),
      }),
    ),
  ),
});
