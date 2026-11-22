import type { QwenModelId } from '../models/qwen-models.js';
import type { FoundryConfig } from '../types.js';
import { createOpenWeightChat, type OpenWeightChatProvider } from './open-weight-chat.js';

export type FoundryQwenProvider = OpenWeightChatProvider<QwenModelId>;

export function createFoundryQwen(config: FoundryConfig): FoundryQwenProvider {
  return createOpenWeightChat(config, 'qwen', 'createFoundryQwen');
}
