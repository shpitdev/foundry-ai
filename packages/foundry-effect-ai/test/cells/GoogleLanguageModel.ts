import { expect } from '@effect/vitest';
import type * as Response from 'effect/ai/Response';
import * as GoogleLanguageModel from '../../src/GoogleLanguageModel.ts';
import { languageCells } from '../capabilities.ts';

const namespace = 'foundry-google';

/** Gemini rejects a replayed function call without the thought signature it arrived with. */
function expectReplay(parts: ReadonlyArray<Response.AnyPart>): void {
  const call = parts.find((part) => part.type === 'tool-call');
  expect(call?.metadata[namespace]).toMatchObject({ thoughtSignature: expect.any(String) });
}

export const cellsFor = (model: string) =>
  languageCells({
    model: ({ reasoning }) =>
      GoogleLanguageModel.model(
        model,
        // Thought summaries need a level: flash-lite's default thinks too little to report any.
        reasoning
          ? { thinkingConfig: { includeThoughts: true, thinkingLevel: 'HIGH' } }
          : undefined,
      ),
    replay: expectReplay,
  });

export const cells = cellsFor('gemini-3.1-flash-lite');
