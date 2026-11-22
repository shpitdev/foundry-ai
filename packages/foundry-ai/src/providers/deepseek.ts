import type { DeepSeekModelId } from '../models/deepseek-models.js';
import type { FoundryConfig } from '../types.js';
import { createOpenWeightChat, type OpenWeightChatProvider } from './open-weight-chat.js';

export type FoundryDeepSeekProvider = OpenWeightChatProvider<DeepSeekModelId>;

export function createFoundryDeepSeek(config: FoundryConfig): FoundryDeepSeekProvider {
  return createOpenWeightChat(config, 'deepseek', 'createFoundryDeepSeek');
}
