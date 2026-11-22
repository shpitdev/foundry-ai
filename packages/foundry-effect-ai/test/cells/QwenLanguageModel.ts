import * as QwenLanguageModel from '../../src/QwenLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import { expectChatReplay, twoCuts } from '../chat.ts';

// Qwen3 235B A22B 2507 does not think, and with `reasoning_effort: 'high'` Foundry never answered
// (no response within 90 seconds, twice), so it gets no effort and skips `reasoning`.
const thinking = (model: string) => model !== 'qwen3-235b-a22b-2507';

/** `reasoning_effort: 'high'` turns on the `<reasoning>` spans; reasoning is never replayed. */
export const cellsFor = (model: string) => {
  const { reasoning, ...cells } = languageCells({
    model: (options) =>
      QwenLanguageModel.model(
        model,
        options.reasoning && thinking(model) ? { reasoning_effort: 'high' } : undefined,
      ),
    replay: expectChatReplay(QwenLanguageModel.providerName),
  });
  return thinking(model) && reasoning !== undefined ? { ...cells, reasoning } : cells;
};

const shared = cellsFor('qwen3-32b');

export const cells = { ...shared, 'stream-truncated': twoCuts(shared['stream-truncated']) };
