import { expect } from '@effect/vitest';
import type * as Response from 'effect/ai/Response';
import * as GemmaLanguageModel from '../../src/GemmaLanguageModel.ts';
import { languageCells } from '../capabilities.ts';

/** Replay needs the call's item ID and wire arguments; Gemma returns no reasoning. */
function expectReplay(parts: ReadonlyArray<Response.AnyPart>): void {
  const call = parts.find((part) => part.type === 'tool-call');
  expect(call?.metadata[GemmaLanguageModel.providerName]).toMatchObject({
    itemId: expect.any(String),
    arguments: expect.any(String),
  });
}

/** Gemma takes no reasoning settings, so it skips `reasoning`. */
export const cellsFor = (model: string) => {
  const { reasoning: _, ...cells } = languageCells({
    model: () => GemmaLanguageModel.model(model),
    replay: expectReplay,
  });
  return cells;
};

export const cells = cellsFor('gemma-4-31b');
