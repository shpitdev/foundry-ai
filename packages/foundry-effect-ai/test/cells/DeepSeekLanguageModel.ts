import * as DeepSeekLanguageModel from '../../src/DeepSeekLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import { expectChatReplay, reasoningTags, twoCuts } from '../chat.ts';

const replay = expectChatReplay(DeepSeekLanguageModel.providerName);

/**
 * `reasoning_effort: 'high'` turns on the `<reasoning>` spans, for the `reasoning` cell only:
 * under it DeepSeek V3.2 often puts its whole answer after a tool result inside the span, leaving
 * no answer text, so the tool cells run without an effort. Reasoning is never replayed.
 */
export const cellsFor = (model: string) => {
  const { reasoning } = languageCells({
    model: () => DeepSeekLanguageModel.model(model, { reasoning_effort: 'high' }),
    replay,
  });
  const cells = languageCells({ model: () => DeepSeekLanguageModel.model(model), replay });
  return reasoning === undefined ? cells : { ...cells, reasoning };
};

const shared = cellsFor('deepseek-v3.2');

export const cells = {
  ...shared,
  'stream-truncated': twoCuts(shared['stream-truncated']),
  'reasoning-tags': reasoningTags((reasoning) =>
    DeepSeekLanguageModel.model(
      'deepseek-v3.2',
      reasoning ? { reasoning_effort: 'high' } : undefined,
    ),
  ),
};
