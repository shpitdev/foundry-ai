import { expect } from '@effect/vitest';
import type * as Response from 'effect/ai/Response';
import * as OpenAiLanguageModel from '../../src/OpenAiLanguageModel.ts';
import { languageCells } from '../capabilities.ts';

const namespace = 'foundry-openai';

/** Stateless replay needs encrypted reasoning and the call's item ID and wire arguments. */
function expectReplay(parts: ReadonlyArray<Response.AnyPart>): void {
  const reasoning = parts.flatMap((part) =>
    part.type === 'reasoning' || part.type === 'reasoning-end' ? [part.metadata[namespace]] : [],
  );
  expect(reasoning).toContainEqual(
    expect.objectContaining({ encryptedContent: expect.any(String) }),
  );
  const call = parts.find((part) => part.type === 'tool-call');
  expect(call?.metadata[namespace]).toMatchObject({
    itemId: expect.any(String),
    arguments: expect.any(String),
  });
}

export const cells = languageCells({
  model: ({ reasoning }) =>
    OpenAiLanguageModel.model(
      'gpt-6-luna',
      reasoning ? { reasoning: { effort: 'medium', summary: 'auto' } } : undefined,
    ),
  replay: expectReplay,
});
