import * as NvidiaLanguageModel from '../../src/NvidiaLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import { expectChatReplay, twoCuts } from '../chat.ts';

/** `reasoning_effort: 'high'` turns on the `<reasoning>` spans; reasoning is never replayed. */
export const cellsFor = (model: string) =>
  languageCells({
    model: ({ reasoning }) =>
      NvidiaLanguageModel.model(model, reasoning ? { reasoning_effort: 'high' } : undefined),
    replay: expectChatReplay(NvidiaLanguageModel.providerName),
  });

const shared = cellsFor('nemotron-3-super-120b');

export const cells = { ...shared, 'stream-truncated': twoCuts(shared['stream-truncated']) };
