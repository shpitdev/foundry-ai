import type { MoonshotModelId } from '../models/moonshot-models.js';
import type { FoundryConfig } from '../types.js';
import { createOpenWeightChat, type OpenWeightChatProvider } from './open-weight-chat.js';

export type FoundryMoonshotProvider = OpenWeightChatProvider<MoonshotModelId>;

export function createFoundryMoonshot(config: FoundryConfig): FoundryMoonshotProvider {
  return createOpenWeightChat(config, 'moonshot', 'createFoundryMoonshot');
}
