import * as QwenLanguageModel from '../../src/QwenLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import { expectChatReplay, twoCuts } from '../chat.ts';

/** `reasoning_effort: 'high'` turns on the `<reasoning>` spans; reasoning is never replayed. */
export const cellsFor = (model: string) =>
  languageCells({
    model: ({ reasoning }) =>
      QwenLanguageModel.model(model, reasoning ? { reasoning_effort: 'high' } : undefined),
    replay: expectChatReplay(QwenLanguageModel.providerName),
  });

const shared = cellsFor('qwen3-32b');

export const cells = { ...shared, 'stream-truncated': twoCuts(shared['stream-truncated']) };
