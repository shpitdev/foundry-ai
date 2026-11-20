import { expect } from '@effect/vitest';
import type * as Response from 'effect/ai/Response';
import * as XaiLanguageModel from '../../src/XaiLanguageModel.ts';
import { languageCells } from '../capabilities.ts';

const namespace = 'foundry-xai';

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
    XaiLanguageModel.model(
      'grok-4-6',
      reasoning ? { reasoning: { effort: 'medium', summary: 'auto' } } : undefined,
    ),
  replay: expectReplay,
});
