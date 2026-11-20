import * as OpenAiLanguageModel from '../../src/OpenAiLanguageModel.ts';
import { languageCells } from '../capabilities.ts';

export const cells = languageCells({
  model: ({ reasoning }) =>
    OpenAiLanguageModel.model(
      'gpt-6-luna',
      reasoning ? { reasoning: { effort: 'medium', summary: 'auto' } } : undefined,
    ),
});
