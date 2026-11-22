/**
 * OpenAI realtime models on Foundry, by API name. The WebSocket route takes the API name, not a
 * RID, and the adapter reads nothing else, so the entries are empty.
 */
export const models = {
  'gpt-realtime': {},
  'gpt-realtime-1.5': {},
  'gpt-realtime-2': {},
  'gpt-realtime-2.1': {},
  'gpt-realtime-2.1-mini': {},
} as const;
