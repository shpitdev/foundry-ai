import type { NvidiaModelId } from '../models/nvidia-models.js';
import type { FoundryConfig } from '../types.js';
import { createOpenWeightChat, type OpenWeightChatProvider } from './open-weight-chat.js';

export type FoundryNvidiaProvider = OpenWeightChatProvider<NvidiaModelId>;

export function createFoundryNvidia(config: FoundryConfig): FoundryNvidiaProvider {
  return createOpenWeightChat(config, 'nvidia', 'createFoundryNvidia');
}
