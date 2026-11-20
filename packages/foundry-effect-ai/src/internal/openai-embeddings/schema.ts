// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/** Wire shapes for `/openai/v1/embeddings`. The response schema decodes only the fields we read. */
import * as Schema from 'effect/Schema';

export interface Request {
  readonly model: string;
  readonly input: ReadonlyArray<string>;
  readonly encoding_format: 'float';
  readonly dimensions?: number;
}

export const Response = Schema.Struct({
  data: Schema.Array(Schema.Struct({ index: Schema.Int, embedding: Schema.Array(Schema.Finite) })),
  usage: Schema.optional(
    Schema.NullOr(Schema.Struct({ prompt_tokens: Schema.optional(Schema.NullOr(Schema.Finite)) })),
  ),
});
