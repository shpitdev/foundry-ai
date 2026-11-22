import * as ZaiLanguageModel from '../../src/ZaiLanguageModel.ts';
import { languageCells } from '../capabilities.ts';
import { expectChatReplay, twoCuts } from '../chat.ts';

const replay = expectChatReplay(ZaiLanguageModel.providerName);

export const cellsFor = (model: string) => {
  const { reasoning } = languageCells({
    model: () => ZaiLanguageModel.model(model, { reasoning_effort: 'high' }),
    replay,
  });
  const cells = languageCells({ model: () => ZaiLanguageModel.model(model), replay });
  return reasoning === undefined ? cells : { ...cells, reasoning };
};

const shared = cellsFor('glm-5');

export const cells = {
  ...shared,
  'stream-truncated': twoCuts(shared['stream-truncated']),
};
