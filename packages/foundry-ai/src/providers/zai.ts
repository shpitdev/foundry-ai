import type { ZaiModelId } from '../models/zai-models.js';
import type { FoundryConfig } from '../types.js';
import { createOpenWeightChat, type OpenWeightChatProvider } from './open-weight-chat.js';

export type FoundryZaiProvider = OpenWeightChatProvider<ZaiModelId>;

export function createFoundryZai(config: FoundryConfig): FoundryZaiProvider {
  return createOpenWeightChat(config, 'zai', 'createFoundryZai');
}
